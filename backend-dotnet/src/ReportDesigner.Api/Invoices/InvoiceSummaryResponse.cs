using System.Text.Json.Serialization;
using ReportDesigner.Api.Compatibility;
using ReportDesigner.Application.Invoices;

namespace ReportDesigner.Api.Invoices;

public sealed record InvoiceTypeResponse(
    [property: JsonPropertyName("nombre")] string Nombre,
    [property: JsonPropertyName("codigo")] string? Codigo);
public sealed record InvoiceContactResponse([property: JsonPropertyName("guardar_como")] string GuardarComo);
public sealed record InvoiceCurrencyResponse(
    [property: JsonPropertyName("iso4217")] string Iso4217,
    [property: JsonPropertyName("simbolo")] string Simbolo);

public sealed record InvoiceSummaryResponse(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("serie")] string? Serie,
    [property: JsonPropertyName("numero")] int Numero,
    [property: JsonPropertyName("fecha")] string Fecha,
    [property: JsonPropertyName("total")] string? Total,
    [property: JsonPropertyName("estado")] string? Estado,
    [property: JsonPropertyName("invoice_type")] InvoiceTypeResponse InvoiceType,
    [property: JsonPropertyName("contact")] InvoiceContactResponse? Contact,
    [property: JsonPropertyName("currency")] InvoiceCurrencyResponse Currency)
{
    public static InvoiceSummaryResponse From(InvoiceSummaryReadModel row) => new(
        row.Id, row.Serie, row.Numero, LegacyTimestamp.Format(row.Fecha)!, row.Total, row.Estado,
        new(row.TypeName, row.TypeCode), row.ContactName is null ? null : new(row.ContactName),
        new(row.CurrencyCode, row.CurrencySymbol));
}
