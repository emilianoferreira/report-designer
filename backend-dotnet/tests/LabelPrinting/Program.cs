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
Check((await service.SearchAsync("779000000001", retail, null, 25, ct)).Items.Count == 1);
Check((await service.SearchAsync("DEMO-060", retail, null, 25, ct)).Items.Count == 0);
var ids = search.Items.Take(4).Select(x => x.ArticleId).ToArray();
var snapshot = await service.ResolveAsync(wholesale, ids, ct);
Check(snapshot.Items.Select(x => x.ArticleId).SequenceEqual(ids));
Check(snapshot.Items[1].Price.Amount == "0.00");
Check(snapshot.Items[2].Price.Status == "missing" && snapshot.Items[2].Price.Amount is null);
Check(snapshot.Items[3].Price.TaxTreatment == "unknown");
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
Console.WriteLine($"PASS: {count} label printing assertions.");
sealed record Tenant(Guid CompanyId) : ICompanyContext;
sealed class EnvironmentStub : IHostEnvironment {
    public string EnvironmentName { get; set; } = "Testing";
    public string ApplicationName { get; set; } = "LabelPrintingTests";
    public string ContentRootPath { get; set; } = ".";
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
}
