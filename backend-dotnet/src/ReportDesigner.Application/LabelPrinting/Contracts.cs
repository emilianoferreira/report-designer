namespace ReportDesigner.Application.LabelPrinting;

public sealed record LabelCompany(string Name, string? Logo);
public sealed record LabelPrintContext(string Mode, bool Available, LabelCompany? Company);
public sealed record PriceListSummary(string Id, string Name);
public sealed record ArticleSummary(string Id, string Code, string Name, string? Barcode, string? Image);
// Amount is a canonical decimal string. Null is not zero. Unknown tax is never inferred.
public sealed record ResolvedPrice(string Status, string? Amount, string? CurrencyCode, string? CurrencySymbol, string TaxTreatment);
public sealed record ResolvedArticle(string ArticleId, string Status, ArticleSummary? Article, ResolvedPrice Price);
public sealed record Page<T>(IReadOnlyList<T> Items, string? NextCursor);
public sealed record ResolvedPrintSnapshot(string Mode, string PriceListId, DateTimeOffset ResolvedAt, string? SourceRevision, LabelCompany Company, IReadOnlyList<ResolvedArticle> Items);
public interface ILabelCatalogSource
{
    Task<LabelPrintContext> ContextAsync(CancellationToken ct);
    Task<Page<PriceListSummary>> ListsAsync(string? cursor, int pageSize, CancellationToken ct);
    Task<Page<ArticleSummary>> SearchAsync(string query, string priceListId, string? cursor, int pageSize, CancellationToken ct);
}
public interface ILabelPriceSource
{
    Task<ResolvedPrintSnapshot> ResolveAsync(string priceListId, IReadOnlyList<string> articleIds, CancellationToken ct);
}
public sealed class LabelPrintException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}
public sealed class LabelPrintService(ILabelCatalogSource catalog, ILabelPriceSource prices)
{
    public Task<LabelPrintContext> ContextAsync(CancellationToken ct) => catalog.ContextAsync(ct);
    public Task<Page<PriceListSummary>> ListsAsync(string? cursor, int pageSize, CancellationToken ct)
    { ValidatePage(pageSize, cursor); return catalog.ListsAsync(cursor, pageSize, ct); }
    public async Task<Page<ResolvedArticle>> SearchAsync(string? query, string? priceListId, string? cursor, int pageSize, CancellationToken ct)
    {
        ValidatePage(pageSize, cursor); ValidateId(priceListId);
        query = query?.Trim() ?? "";
        if (query.Length > 100) throw Invalid();
        var page = await catalog.SearchAsync(query, priceListId!, cursor, pageSize, ct);
        if (page.Items.Count == 0) return new([], page.NextCursor);
        var snapshot = await prices.ResolveAsync(priceListId!, page.Items.Select(a => a.Id).ToArray(), ct);
        return new(snapshot.Items, page.NextCursor);
    }
    public Task<ResolvedPrintSnapshot> ResolveAsync(string? list, IReadOnlyList<string>? ids, CancellationToken ct)
    {
        ValidateId(list);
        if (ids is null || ids.Count is < 1 or > 100 || ids.Distinct(StringComparer.Ordinal).Count() != ids.Count) throw Invalid();
        foreach (var id in ids) ValidateId(id);
        return prices.ResolveAsync(list!, ids, ct);
    }
    private static void ValidateId(string? id) { if (string.IsNullOrWhiteSpace(id) || id.Length > 200) throw Invalid(); }
    private static void ValidatePage(int size, string? cursor) { if (size is < 1 or > 100 || cursor?.Length > 1024) throw Invalid(); }
    private static LabelPrintException Invalid() => new(400, "invalid_request", "Invalid label printing request.");
}
