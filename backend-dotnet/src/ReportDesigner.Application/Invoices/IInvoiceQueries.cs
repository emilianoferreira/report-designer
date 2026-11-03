using System.Text.Json;
using ReportDesigner.Application.Common;

namespace ReportDesigner.Application.Invoices;

public sealed record InvoiceSummaryReadModel(Guid Id, string? Serie, int Numero, DateTime Fecha,
    string? Total, string? Estado, string TypeName, string? TypeCode, string? ContactName,
    string CurrencyCode, string CurrencySymbol);

public sealed class InvoiceNotFoundException(string message) : ResourceNotFoundException(message);

public interface IInvoiceQueries
{
    Task<IReadOnlyList<InvoiceSummaryReadModel>> ListAsync(string companyId, CancellationToken cancellationToken);
    Task<JsonElement> GetDataAsync(string id, CancellationToken cancellationToken);
}
