namespace ReportDesigner.Infrastructure.Invoices;

// Unmapped SQL projection: the list contract needs only these columns, not the invoice graph.
internal sealed class InvoiceSummaryRow
{
    public Guid Id { get; set; }
    public string? Serie { get; set; }
    public int Numero { get; set; }
    public DateTime Fecha { get; set; }
    public string? Total { get; set; }
    public string? Estado { get; set; }
    public string TypeName { get; set; } = null!;
    public string? TypeCode { get; set; }
    public string? ContactName { get; set; }
    public string CurrencyCode { get; set; } = null!;
    public string CurrencySymbol { get; set; } = null!;
}
