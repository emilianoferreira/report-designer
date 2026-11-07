using System.Data;
using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MySql.Data.MySqlClient;

var cs = new MySqlConnectionStringBuilder(Environment.GetEnvironmentVariable("A3_CONNECTION") ?? throw new Exception("Use the isolated A3 runner."));
var directory = Environment.GetEnvironmentVariable("A3_DIRECTORY") ?? throw new Exception("Missing evidence directory.");
if (cs.Server != "127.0.0.1" || !Regex.IsMatch(cs.Database, "^a3_[a-f0-9]{32}$") || cs.Database != "a3_" + Environment.GetEnvironmentVariable("A3_ID")) throw new Exception("Refusing an unowned database.");
var options = new DbContextOptionsBuilder<Probe>().UseMySQL(cs.ConnectionString).Options;
var checks = new List<string>(); var comparisons = new List<object>();
void Check(bool value, string label) { if (!value) throw new Exception(label); checks.Add(label); }
await using var connection = new MySqlConnection(cs.ConnectionString); await connection.OpenAsync();
async Task<object?> Sql(string sql) { using var c = new MySqlCommand(sql, connection); return await c.ExecuteScalarAsync(); }
Check(Convert.ToString(await Sql("SELECT VERSION()"))!.StartsWith("8.4.13"), "MySQL 8.4.13");
await Sql("SET time_zone='+00:00'");
using (var c = new MySqlCommand("SHOW SESSION STATUS LIKE 'Ssl_cipher'", connection))
using (var r = await c.ExecuteReaderAsync()) Check(await r.ReadAsync() && r.GetString(1).Length > 0, "TLS with verified CA");
await Sql("CREATE TABLE probe (id varchar(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, native_json JSON NULL, text_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL CHECK(JSON_VALID(text_json)), tags JSON NULL, amount DECIMAL(15,2) NOT NULL, quantity DECIMAL(15,4) NOT NULL, happened DATETIME(6) NOT NULL, revision INT NOT NULL) ENGINE=InnoDB");
var date = new DateTime(2026,4,1,0,4,5,DateTimeKind.Utc).AddTicks(1239870);
await using var db = new Probe(options);
var id=Guid.NewGuid();
db.Rows.Add(new Row { Id=id, NativeJson="{}", TextJson="{}", Tags="[\"ñ\",null,\"ñ\",\"\"]", Amount=1234567890123.40m, Quantity=-2.1234m, Happened=date, Revision=1 });
await db.SaveChangesAsync();db.ChangeTracker.Clear();
var read=await db.Rows.AsNoTracking().SingleAsync();
Check(read.Id==id, "UUID through EF");
Check(read.Amount==1234567890123.40m && read.Quantity==-2.1234m, "decimal scale and negative amount through EF");
Check(read.Happened==date && read.Happened.Kind==DateTimeKind.Utc,"UTC microseconds through EF");
Check(Equal(JsonDocument.Parse(read.Tags!).RootElement,JsonDocument.Parse("[\"ñ\",null,\"ñ\",\"\"]").RootElement),"tags preserve duplicates order and null");
foreach(var tags in new string?[]{null,"[]"}) {
    var entity=await db.Rows.SingleAsync(x=>x.Id==id);entity.Tags=tags;await db.SaveChangesAsync();db.ChangeTracker.Clear();
    Check((await db.Rows.AsNoTracking().SingleAsync(x=>x.Id==id)).Tags==tags,tags is null?"SQL NULL remains distinct from empty array":"empty array remains distinct from SQL NULL");
}
Check(!Equal(JsonDocument.Parse("12345678901234567890.123456789").RootElement,JsonDocument.Parse("1.2345678901234567e19").RootElement),"comparison detects precision loss without double conversion");
foreach(var item in JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(directory,"corpus.json"))).RootElement.EnumerateArray()) {
    var name=item.GetProperty("name").GetString()!;
    var input=await File.ReadAllTextAsync(Path.Combine(directory,name+".input.json"));
    var oraclePath=Path.Combine(directory,name+".postgres.json");
    foreach(var storage in new[]{"native","text"}) {
        string? actual=null;int? error=null;
        await using var current=new Probe(options);
        var entity=new Row {Id=Guid.NewGuid(),NativeJson=storage=="native"?input:null,TextJson=storage=="text"?input:null,Amount=0,Quantity=0,Happened=date,Revision=1};
        try {
            current.Rows.Add(entity);await current.SaveChangesAsync();current.ChangeTracker.Clear();
            var stored=await current.Rows.AsNoTracking().SingleAsync(x=>x.Id==entity.Id);
            actual=storage=="native"?stored.NativeJson:stored.TextJson;
            await File.WriteAllTextAsync(Path.Combine(directory,name+"."+storage+".json"),actual!);
        } catch(DbUpdateException e) when(e.InnerException is MySqlException mysql) { error=mysql.Number; }
        bool? equal=null;
        if(actual is not null && File.Exists(oraclePath)) equal=Equal(JsonDocument.Parse(actual).RootElement,JsonDocument.Parse(await File.ReadAllTextAsync(oraclePath)).RootElement);
        comparisons.Add(new{name,storage,required=item.GetProperty("required").GetBoolean(),accepted=actual is not null,error,postgresAccepted=File.Exists(oraclePath),semanticEqual=equal,lexicalEqual=actual==input});
    }
}
// Comparisons report differences rather than declaring both storage options viable.
await File.WriteAllTextAsync(Path.Combine(directory,"json-comparison.json"),JsonSerializer.Serialize(comparisons,new JsonSerializerOptions{WriteIndented=true}));
await using(var tx=await db.Database.BeginTransactionAsync()) {
    await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE probe SET revision=99 WHERE id={id.ToString()}");await tx.RollbackAsync();
}
Check((await db.Rows.AsNoTracking().SingleAsync(x=>x.Id==id)).Revision==1,"rollback from independent read");
await using(var owner=new MySqlConnection(cs.ConnectionString)) {
    await owner.OpenAsync();await using var tx=await owner.BeginTransactionAsync(IsolationLevel.ReadCommitted);
    using var locked=new MySqlCommand("SELECT revision FROM probe WHERE id=@id FOR UPDATE",owner,tx);locked.Parameters.AddWithValue("@id",id.ToString());await locked.ExecuteScalarAsync();
    await using var contender=new MySqlConnection(cs.ConnectionString);await contender.OpenAsync();
    using(var timeout=new MySqlCommand("SET innodb_lock_wait_timeout=1",contender))await timeout.ExecuteNonQueryAsync();
    await using var other=await contender.BeginTransactionAsync(IsolationLevel.ReadCommitted);
    using var waiting=new MySqlCommand("SELECT revision FROM probe WHERE id=@id FOR UPDATE",contender,other);waiting.Parameters.AddWithValue("@id",id.ToString());
    var blocked=false;try{await waiting.ExecuteScalarAsync();}catch(MySqlException e)when(e.Number==1205){blocked=true;}
    Check(blocked,"second independent connection actually blocks on row lock");await other.RollbackAsync();await tx.RollbackAsync();
}
async Task<string> WriteRevision() {
    await using var c=new MySqlConnection(cs.ConnectionString);await c.OpenAsync();await using var tx=await c.BeginTransactionAsync(IsolationLevel.ReadCommitted);
    using var command=new MySqlCommand("SELECT revision FROM probe WHERE id=@id FOR UPDATE",c,tx);command.Parameters.AddWithValue("@id",id.ToString());
    if(Convert.ToInt32(await command.ExecuteScalarAsync())!=1){await tx.RollbackAsync();return "conflict";}
    command.CommandText="UPDATE probe SET revision=revision+1 WHERE id=@id";await command.ExecuteNonQueryAsync();await tx.CommitAsync();return "written";
}
var race=await Task.WhenAll(WriteRevision(),WriteRevision());
Check(race.Count(x=>x=="written")==1 && race.Count(x=>x=="conflict")==1,"same revision: exactly one write and one conflict");
Check((await db.Rows.AsNoTracking().SingleAsync(x=>x.Id==id)).Revision==2,"committed revision visible through EF");
async Task LegacyWrite() {
    await using var c=new MySqlConnection(cs.ConnectionString);await c.OpenAsync();
    using var command=new MySqlCommand("UPDATE probe SET revision=revision+1 WHERE id=@id",c);command.Parameters.AddWithValue("@id",id.ToString());
    Check(await command.ExecuteNonQueryAsync()==1,"legacy unconditional write accepted");
}
// Atomic updates serialize, but provide no stale-client detection without an expected revision.
await LegacyWrite();await LegacyWrite();
Check((await db.Rows.AsNoTracking().SingleAsync(x=>x.Id==id)).Revision==4,"legacy updates advance revision without rejecting stale intent");
using var rsa=System.Security.Cryptography.RSA.Create(2048);
var request=new System.Security.Cryptography.X509Certificates.CertificateRequest("CN=A3 untrusted CA",rsa,System.Security.Cryptography.HashAlgorithmName.SHA256,System.Security.Cryptography.RSASignaturePadding.Pkcs1);
using var certificate=request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1),DateTimeOffset.UtcNow.AddDays(1));
await File.WriteAllTextAsync(Path.Combine(directory,"untrusted-ca.pem"),certificate.ExportCertificatePem());
var invalid=new MySqlConnectionStringBuilder(cs.ConnectionString){SslCa=Path.Combine(directory,"untrusted-ca.pem"),Pooling=false};
var refused=false;try{await using var c=new MySqlConnection(invalid.ConnectionString);await c.OpenAsync();}catch(Exception e)when(e is MySqlException or IOException or ArgumentException){refused=true;}
Check(refused,"TLS rejects unrelated trust anchor");
await File.WriteAllTextAsync(Path.Combine(directory,"provider.json"),JsonSerializer.Serialize(new{passed=true,checks,runtime=Environment.Version.ToString(),provider=typeof(Probe).Assembly.GetReferencedAssemblies().Select(x=>x.FullName)},new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine($"Provider checks passed: {checks.Count}; JSON comparisons: {comparisons.Count}");

static bool Equal(JsonElement a,JsonElement b) {
    if(a.ValueKind!=b.ValueKind)return false;
    if(a.ValueKind==JsonValueKind.Object){var x=new Dictionary<string,JsonElement>();var y=new Dictionary<string,JsonElement>();foreach(var p in a.EnumerateObject())x[p.Name]=p.Value;foreach(var p in b.EnumerateObject())y[p.Name]=p.Value;return x.Count==y.Count&&x.All(p=>y.TryGetValue(p.Key,out var v)&&Equal(p.Value,v));}
    if(a.ValueKind==JsonValueKind.Array)return a.GetArrayLength()==b.GetArrayLength()&&a.EnumerateArray().Zip(b.EnumerateArray()).All(p=>Equal(p.First,p.Second));
    if(a.ValueKind==JsonValueKind.Number)return Number(a.GetRawText())==Number(b.GetRawText());
    return a.ToString()==b.ToString();
}
static string Number(string raw) {
    var parts=raw.ToLowerInvariant().Split('e');var exponent=parts.Length==2?int.Parse(parts[1],CultureInfo.InvariantCulture):0;
    var fraction=parts[0].IndexOf('.');if(fraction>=0)exponent-=parts[0].Length-fraction-1;
    var n=BigInteger.Parse(parts[0].Replace(".",""),CultureInfo.InvariantCulture);if(n.IsZero)return "0";
    while(n%10==0){n/=10;exponent++;}return n.ToString(CultureInfo.InvariantCulture)+"e"+exponent;
}
sealed class Probe(DbContextOptions<Probe> options):DbContext(options){
    public DbSet<Row> Rows=>Set<Row>();
    protected override void OnModelCreating(ModelBuilder b){var r=b.Entity<Row>();r.ToTable("probe");r.HasKey(x=>x.Id);
        r.Property(x=>x.Id).HasColumnName("id").HasConversion<string>().HasColumnType("varchar(36)");
        r.Property(x=>x.NativeJson).HasColumnName("native_json").HasColumnType("json");r.Property(x=>x.TextJson).HasColumnName("text_json").HasColumnType("longtext");r.Property(x=>x.Tags).HasColumnName("tags").HasColumnType("json");
        r.Property(x=>x.Amount).HasColumnName("amount").HasPrecision(15,2);r.Property(x=>x.Quantity).HasColumnName("quantity").HasPrecision(15,4);
        r.Property(x=>x.Happened).HasColumnName("happened").HasColumnType("datetime(6)").HasConversion(x=>x,x=>DateTime.SpecifyKind(x,DateTimeKind.Utc));r.Property(x=>x.Revision).HasColumnName("revision");}
}
sealed class Row{public Guid Id{get;set;}public string? NativeJson{get;set;}public string? TextJson{get;set;}public string? Tags{get;set;}public decimal Amount{get;set;}public decimal Quantity{get;set;}public DateTime Happened{get;set;}public int Revision{get;set;}}
