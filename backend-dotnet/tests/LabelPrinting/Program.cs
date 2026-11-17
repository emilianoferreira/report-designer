using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using ReportDesigner.Application.Common;
using ReportDesigner.Application.LabelPrinting;
using ReportDesigner.Infrastructure.LabelPrinting;

var count = 0;
void Check(bool value) { if (!value) throw new Exception("Assertion failed"); count++; }
async Task Reject(Func<Task> call, int status) { try { await call(); throw new Exception("Expected rejection"); } catch(LabelPrintException e) { Check(e.Status == status); } }
ServiceProvider Provider(string? mode, string env, Guid company) {
    var settings = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["LabelPrinting:Provider"] = mode }).Build();
    var services = new ServiceCollection().AddSingleton<ICompanyContext>(new Tenant(company));
    services.AddLabelPrinting(settings, new EnvironmentStub { EnvironmentName = env });
    return services.BuildServiceProvider();
}
using var first = Provider("Demo", "Testing", Guid.NewGuid());
using var second = Provider("Demo", "Testing", Guid.NewGuid());
var service = first.GetRequiredService<LabelPrintService>(); var other = second.GetRequiredService<LabelPrintService>();
var ct = CancellationToken.None;
Check((await service.ContextAsync(ct)).Mode == "demo");
var lists = await service.ListsAsync(null, 1, ct);
Check(lists.Items.Count == 1 && lists.NextCursor != null);
var last = await service.ListsAsync(lists.NextCursor, 1, ct);
Check(last.Items.Count == 1 && last.NextCursor == null);
await Reject(() => other.ListsAsync(lists.NextCursor, 1, ct), 400);
var retail = lists.Items[0].Id; var wholesale = last.Items[0].Id;
var search = await service.SearchAsync("DEMO-", retail, null, 25, ct);
Check(search.Items.Count == 25 && search.NextCursor != null);
Check((await service.SearchAsync("", retail, null, 25, ct)).Items.Count == 0);
Check((await service.SearchAsync(search.Items[0].Article!.Barcode, retail, null, 25, ct)).Items.Count == 1);
Check((await service.SearchAsync("DEMO-060", retail, null, 25, ct)).Items.Count == 0);
var ids = search.Items.Take(4).Select(x => x.ArticleId).ToArray();
var snapshot = await service.ResolveAsync(wholesale, ids, ct);
Check(snapshot.Items.Select(x => x.ArticleId).SequenceEqual(ids));
Check(snapshot.Items[1].Price.Amount == "46.00");
Check(snapshot.Items[2].Price.Amount == "95.00");
Check(snapshot.Items[3].Price.TaxTreatment == "included");
Check((await service.ResolveAsync(retail, [ids[2]], ct)).Items[0].Price.Status == "available");
await Reject(() => other.ResolveAsync(retail, ids, ct), 404);
var foreignList = (await other.ListsAsync(null,25,ct)).Items[0].Id;
Check((await other.ResolveAsync(foreignList, ids, ct)).Items.All(x => x.Status == "unavailable" && x.Article is null));
foreach (var invalid in new[] { 0, 101, -1 }) await Reject(() => service.ListsAsync(null, invalid, ct), 400);
await Reject(() => service.ResolveAsync(retail, [], ct), 400);
await Reject(() => service.ResolveAsync(retail, [ids[0],ids[0]], ct), 400);
await Reject(() => service.ResolveAsync(retail, Enumerable.Range(0,101).Select(i => i.ToString()).ToArray(), ct), 400);
await Reject(() => service.SearchAsync("DEMO-", wholesale, search.NextCursor,25,ct),400);
using var disabled = Provider(null,"Production",Guid.NewGuid());
var off = disabled.GetRequiredService<LabelPrintService>();
Check(!(await off.ContextAsync(ct)).Available);
await Reject(() => off.ListsAsync(null,25,ct),503);
foreach(var env in new[]{"Production","Staging"}) {
    try { using var unexpected = Provider("Demo",env,Guid.NewGuid()); throw new Exception("Demo enabled outside test environment"); }
    catch(InvalidOperationException) { count++; }
}
try { await service.ContextAsync(new CancellationToken(true)); throw new Exception("Expected cancellation"); } catch(OperationCanceledException) { count++; }
Check(lists.Items[0].Name == "Principal" && last.Items[0].Name == "Mayorista");
var remainder = await service.SearchAsync("DEMO-", retail, search.NextCursor, 25, ct);
Check(remainder.Items.Count == 5 && remainder.NextCursor is null);
var all = search.Items.Concat(remainder.Items).ToArray();
Check(all.Select(x => x.ArticleId).Distinct().Count() == 30);
Check(all.Select(x => x.Article!.Barcode).Distinct().Count() == 30);
foreach(var item in all) {
    var barcode = item.Article!.Barcode!;
    Check(barcode.Length == 13 && barcode.All(char.IsDigit));
    Check(barcode.Select((digit,index)=>(digit-'0')*(index%2==0?1:3)).Sum()%10==0);
    Check(item.Price.Amount is not null && decimal.Parse(item.Price.Amount, System.Globalization.CultureInfo.InvariantCulture) > 0);
    Check((await service.SearchAsync(item.Article.Code,retail,null,25,ct)).Items.Single().ArticleId == item.ArticleId);
}
var both = await service.ResolveAsync(wholesale, all.Select(x=>x.ArticleId).ToArray(),ct);
Check(both.Items.All(x=>x.Price.Status=="available" && x.Price.CurrencyCode=="UYU" && x.Price.TaxTreatment=="included"));
Check(all[0].Price.Amount=="65.00" && both.Items[0].Price.Amount=="52.00");
Check((await service.ContextAsync(ct)).Company!.Logo!.StartsWith("data:image/svg+xml"));
// Edge cases belong exclusively to this injected test fixture, not the default catalog.
var edgeSource = new DemoLabelSource(new Tenant(Guid.NewGuid()), new DemoLabelCatalog([
    new(1,"Precio cero",0m,0m), new(2,"Sin precio mayorista",10m,null),
    new(3,"Inactivo",10m,8m,false), new(4,"Impuestos desconocidos",10m,8m,true,"unknown")
]));
var edge = new LabelPrintService(edgeSource,edgeSource);
var edgeList=(await edge.ListsAsync(null,25,ct)).Items[1].Id;
var edgeItems=(await edge.SearchAsync("DEMO-",edgeList,null,25,ct)).Items;
Check(edgeItems.Count==3);
Check(edgeItems[0].Price.Amount=="0.00");
Check(edgeItems[1].Price.Status=="missing" && edgeItems[1].Price.Amount is null);
Check(edgeItems[2].Price.TaxTreatment=="unknown");
var inactiveId=edgeItems[0].ArticleId.Replace("article-1","article-3");
Check((await edge.ResolveAsync(edgeList,[inactiveId],ct)).Items[0].Status=="unavailable");
using var explicitOff = Provider("Disabled","Development",Guid.NewGuid());
Check(!(await explicitOff.GetRequiredService<LabelPrintService>().ContextAsync(ct)).Available);
Console.WriteLine($"PASS: {count} label printing assertions.");
sealed record Tenant(Guid CompanyId) : ICompanyContext;
sealed class EnvironmentStub : IHostEnvironment {
    public string EnvironmentName { get; set; } = "Testing";
    public string ApplicationName { get; set; } = "LabelPrintingTests";
    public string ContentRootPath { get; set; } = ".";
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
