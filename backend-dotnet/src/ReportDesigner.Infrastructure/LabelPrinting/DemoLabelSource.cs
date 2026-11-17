using System.Globalization;
using System.Text;
using ReportDesigner.Application.Common;
using ReportDesigner.Application.LabelPrinting;

namespace ReportDesigner.Infrastructure.LabelPrinting;

// Scoped source: every external-looking identity belongs to the authenticated company.
public sealed class DemoLabelSource(ICompanyContext company) : ILabelCatalogSource, ILabelPriceSource
{
    private string Prefix => "demo:" + company.CompanyId.ToString("N") + ":";
    private LabelCompany Company => new("Empresa de demostración", null);
    private PriceListSummary[] Lists => [new(Prefix + "retail", "Demostración · General"), new(Prefix + "wholesale", "Demostración · Mayorista")];
    private ArticleSummary[] Articles => Enumerable.Range(1, 60).Select(i => new ArticleSummary(Prefix + "article-" + i, "DEMO-" + i.ToString("D3"), "Artículo de demostración " + i, "779" + i.ToString("D9"), null)).ToArray();
    public Task<LabelPrintContext> ContextAsync(CancellationToken ct) { ct.ThrowIfCancellationRequested(); return Task.FromResult(new LabelPrintContext("demo", true, Company)); }
    public Task<Page<PriceListSummary>> ListsAsync(string? cursor, int pageSize, CancellationToken ct)
    { ct.ThrowIfCancellationRequested(); return Task.FromResult(Paginate(Lists, "lists", cursor, pageSize)); }
    public Task<Page<ArticleSummary>> SearchAsync(string query, string priceListId, string? cursor, int pageSize, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested(); CheckList(priceListId);
        // Fixture 60 represents an inactive article and is never searchable.
        var rows = query.Length == 0 ? [] : Articles.Where(a => a.Id != Prefix + "article-60" && (a.Code.StartsWith(query, StringComparison.OrdinalIgnoreCase) || a.Barcode == query)).ToArray();
        return Task.FromResult(Paginate(rows, "search:" + priceListId + ":" + query, cursor, pageSize));
    }
    public Task<ResolvedPrintSnapshot> ResolveAsync(string priceListId, IReadOnlyList<string> articleIds, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested(); CheckList(priceListId);
        var articles = Articles.ToDictionary(a => a.Id, StringComparer.Ordinal);
        var result = articleIds.Select(id => {
            if (!articles.TryGetValue(id, out var article) || id == Prefix + "article-60")
                return new ResolvedArticle(id, "unavailable", null, new("missing", null, null, null, "unknown"));
            var index = int.Parse(id[(id.LastIndexOf('-') + 1)..], CultureInfo.InvariantCulture);
            var missing = index == 3 && priceListId == Prefix + "wholesale";
            var amount = index == 2 ? 0m : index * (priceListId == Prefix + "retail" ? 100.25m : 80.50m);
            return new ResolvedArticle(id, "available", article, new(missing ? "missing" : "available", missing ? null : amount.ToString("0.00", CultureInfo.InvariantCulture), "UYU", "$", index == 4 ? "unknown" : "included"));
        }).ToArray();
        return Task.FromResult(new ResolvedPrintSnapshot("demo", priceListId, DateTimeOffset.UtcNow, "demo-v1", Company, result));
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
