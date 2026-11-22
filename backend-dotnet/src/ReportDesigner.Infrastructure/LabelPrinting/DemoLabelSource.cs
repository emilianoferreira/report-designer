using System.Globalization;
using System.Text;
using ReportDesigner.Application.Common;
using ReportDesigner.Application.LabelPrinting;

namespace ReportDesigner.Infrastructure.LabelPrinting;

// Scoped source: every external-looking identity belongs to the authenticated company.
public sealed class DemoLabelSource(ICompanyContext company, DemoLabelCatalog catalog) : ILabelCatalogSource, ILabelPriceSource
{
    private string Prefix => "demo:" + company.CompanyId.ToString("N") + ":";
    private LabelCompany Company => new("Almacén Demo — empresa ficticia", DemoLabelCatalog.Logo);
    private PriceListSummary[] Lists => [new(Prefix + "retail", "Principal"), new(Prefix + "wholesale", "Mayorista")];
    private string Id(DemoLabelItem item) => Prefix + "article-" + item.Number.ToString(CultureInfo.InvariantCulture);
    private ArticleSummary Article(DemoLabelItem item) => new(Id(item), item.Code, item.Name, item.Barcode, null);
    public Task<LabelPrintContext> ContextAsync(CancellationToken ct) { ct.ThrowIfCancellationRequested(); return Task.FromResult(new LabelPrintContext("demo", true, Company)); }
    public Task<Page<PriceListSummary>> ListsAsync(string? cursor, int pageSize, CancellationToken ct)
    { ct.ThrowIfCancellationRequested(); return Task.FromResult(Paginate(Lists, "lists", cursor, pageSize)); }
    public Task<Page<ArticleSummary>> SearchAsync(string query, string priceListId, string? cursor, int pageSize, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested(); CheckList(priceListId);
        // Only active items from the injected catalog are searchable.
        var rows = query.Length == 0 ? [] : catalog.Items.Where(item => item.Active && (
            item.Code.StartsWith(query, StringComparison.OrdinalIgnoreCase) ||
            item.Barcode == query ||
            CultureInfo.GetCultureInfo("es-UY").CompareInfo.IndexOf(item.Name, query, CompareOptions.IgnoreCase | CompareOptions.IgnoreNonSpace) >= 0))
            .Select(Article).ToArray();
        return Task.FromResult(Paginate(rows, "search:" + priceListId + ":" + query, cursor, pageSize));
    }
    public Task<ResolvedPrintSnapshot> ResolveAsync(string priceListId, IReadOnlyList<string> articleIds, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested(); CheckList(priceListId);
        var articles = catalog.Items.ToDictionary(Id, StringComparer.Ordinal);
        var result = articleIds.Select(id => {
            if (!articles.TryGetValue(id, out var item) || !item.Active)
                return new ResolvedArticle(id, "unavailable", null, new("missing", null, null, null, "unknown"));
            var amount = priceListId == Prefix + "retail" ? item.Principal : item.Wholesale;
            return new ResolvedArticle(id, "available", Article(item), new(amount.HasValue ? "available" : "missing", amount?.ToString("0.00", CultureInfo.InvariantCulture), "UYU", "$", item.TaxTreatment));
        }).ToArray();
        return Task.FromResult(new ResolvedPrintSnapshot("demo", priceListId, DateTimeOffset.UtcNow, "demo-v2", Company, result));
    }
    private void CheckList(string id) { if (!Lists.Any(l => l.Id == id)) throw new LabelPrintException(404, "list_unavailable", "Price list unavailable."); }
    private Page<T> Paginate<T>(T[] items, string scope, string? cursor, int size)
    {
        var key = Prefix + scope + "|";
        var offset = 0;
        if (cursor is not null)
        {
            try {
                var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
                if (!decoded.StartsWith(key, StringComparison.Ordinal) || !int.TryParse(decoded[key.Length..], out offset) || offset < 0 || offset > items.Length) throw new FormatException();
            } catch (FormatException) { throw new LabelPrintException(400, "invalid_cursor", "Invalid pagination cursor."); }
        }
        var next = offset + size;
        return new(items.Skip(offset).Take(size).ToArray(), next < items.Length ? Convert.ToBase64String(Encoding.UTF8.GetBytes(key + next.ToString(CultureInfo.InvariantCulture))) : null);
    }
}
