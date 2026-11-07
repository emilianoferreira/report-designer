using System.Globalization;
using System.Numerics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using ReportDesigner.Application.Common;
using ReportDesigner.Application.Invoices;
using ReportDesigner.Infrastructure.Invoices;
using ReportDesigner.Infrastructure.Persistence;

var cs = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("A2_CONNECTION"));
var directory = Environment.GetEnvironmentVariable("A2_DIRECTORY") ?? throw new Exception("Use isolated A2 runner");
if(cs.Host != "127.0.0.1" || cs.Port.ToString(CultureInfo.InvariantCulture) != Environment.GetEnvironmentVariable("A2_PORT")) throw new Exception("Refusing non-isolated connection");
await using var connection = new NpgsqlConnection(cs.ConnectionString); await connection.OpenAsync();
using(var marker = new NpgsqlCommand("SELECT owner FROM a2_test_owner",connection))
    if((string?)await marker.ExecuteScalarAsync() != Environment.GetEnvironmentVariable("A2_OWNER")) throw new Exception("Ownership mismatch");
var options = new DbContextOptionsBuilder<ReportDesignerDbContext>().UseNpgsql(connection).Options;
var results = new List<object>(); var passed = true;
foreach(var test in JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(directory,"cases.json"))).RootElement.EnumerateArray())
{
    var name=test.GetProperty("name").GetString()!;
    var id=test.GetProperty("id").GetGuid();
    using(var zone = new NpgsqlCommand("SELECT set_config('TimeZone',@zone,false)",connection)) {
        zone.Parameters.AddWithValue("zone",test.GetProperty("zone").GetString()!); await zone.ExecuteScalarAsync();
    }
    await using var db=new ReportDesignerDbContext(options);
    var source=new PostgresInvoiceDataSource(db,new Company(test.GetProperty("company").GetGuid()));
    var denied=test.GetProperty("denied").GetBoolean();
    try {
        var candidate=new InvoiceDataBuilder().Build(await source.LoadAsync(id));
        if(denied)throw new Exception("Unauthorized invoice was returned");
        using var command=new NpgsqlCommand("SELECT build_invoice_data(@id)::text",connection);command.Parameters.AddWithValue("id",id);
        var oracle=(string)(await command.ExecuteScalarAsync())!;
        await File.WriteAllTextAsync(Path.Combine(directory,name+".oracle.json"),oracle);
        await File.WriteAllTextAsync(Path.Combine(directory,name+".candidate.json"),candidate.GetRawText());
        using var doc=JsonDocument.Parse(oracle);
        var differences=new List<string>();Compare(doc.RootElement,candidate,"$",differences);
        results.Add(new{name,passed=differences.Count==0,differences});passed &= differences.Count==0;
    }catch(InvoiceNotFoundException e) when(denied) {
        var correct=e.Message=="Invoice not found";passed &= correct;results.Add(new{name,passed=correct,notFound=true});
    }
}
await File.WriteAllTextAsync(Path.Combine(directory,"comparison.json"),JsonSerializer.Serialize(new{passed,cases=results},new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine($"A2 comparison: {results.Count} cases, passed={passed}");
if(!passed)Environment.ExitCode=1;

static void Compare(JsonElement expected,JsonElement actual,string path,List<string> differences) {
    if(expected.ValueKind!=actual.ValueKind){differences.Add(path+": type");return;}
    switch(expected.ValueKind) {
        case JsonValueKind.Object:
            var names=expected.EnumerateObject().Select(x=>x.Name).ToHashSet();
            if(!names.SetEquals(actual.EnumerateObject().Select(x=>x.Name)))differences.Add(path+": keys");
            foreach(var p in expected.EnumerateObject())if(actual.TryGetProperty(p.Name,out var other))Compare(p.Value,other,path+"."+p.Name,differences);
            break;
        case JsonValueKind.Array:
            if(expected.GetArrayLength()!=actual.GetArrayLength()){differences.Add(path+": length");break;}
            for(var i=0;i<expected.GetArrayLength();i++)Compare(expected[i],actual[i],path+"["+i+"]",differences);
            break;
        case JsonValueKind.Number:
            if(Number(expected.GetRawText())!=Number(actual.GetRawText()))differences.Add(path+": number");break;
        default: if(expected.ToString()!=actual.ToString())differences.Add(path+": value");break;
    }
}
static string Number(string raw) {
    var parts=raw.ToLowerInvariant().Split('e');var exponent=parts.Length==2?int.Parse(parts[1],CultureInfo.InvariantCulture):0;
    var fraction=parts[0].IndexOf('.');if(fraction>=0)exponent-=parts[0].Length-fraction-1;
    var n=BigInteger.Parse(parts[0].Replace(".",""),CultureInfo.InvariantCulture);if(n.IsZero)return "0";
    while(n%10==0){n/=10;exponent++;}return n.ToString(CultureInfo.InvariantCulture)+"e"+exponent;
}
sealed record Company(Guid CompanyId):ICompanyContext;
