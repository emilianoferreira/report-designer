using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Invoices;
using ReportDesigner.Infrastructure.Persistence;

namespace ReportDesigner.Infrastructure.Invoices;

internal sealed class PostgresInvoiceQueries(ReportDesignerDbContext db) : IInvoiceQueries
{
    public async Task<IReadOnlyList<InvoiceSummaryReadModel>> ListAsync(string companyId, CancellationToken cancellationToken)
    {
        // SqlQuery parameterizes input. Casting in PostgreSQL preserves legacy UUID syntax/errors.
        // numeric::text retains pg/TypeORM's decimal strings, including trailing zeroes.
        var rows = await db.Database.SqlQuery<InvoiceSummaryRow>($"""
            SELECT i.id AS "Id", i.serie AS "Serie", i.numero AS "Numero", i.fecha AS "Fecha",
                   i.total::text AS "Total", i.estado AS "Estado", it.nombre AS "TypeName",
                   it.codigo AS "TypeCode", c.guardar_como AS "ContactName",
                   cur.iso4217 AS "CurrencyCode", cur.simbolo AS "CurrencySymbol"
            FROM invoices i
            LEFT JOIN invoice_types it ON i.type_id = it.id
            LEFT JOIN contacts c ON i.contact_id = c.id
            LEFT JOIN currencies cur ON i.currency_id = cur.id
            WHERE i.company_id = CAST({companyId} AS uuid)
            ORDER BY i.fecha DESC
            """).ToListAsync(cancellationToken);
        return rows.Select(row => new InvoiceSummaryReadModel(row.Id, row.Serie, row.Numero, row.Fecha,
            row.Total, row.Estado, row.TypeName, row.TypeCode, row.ContactName, row.CurrencyCode, row.CurrencySymbol)).ToArray();
    }

    public async Task<JsonElement> GetDataAsync(string id, CancellationToken cancellationToken)
    {
        // Keep the existing database function as the authority for renderer data and its casing.
        var json = await db.Database.SqlQuery<string>($"""
            SELECT build_invoice_data(CAST({id} AS uuid))::text AS "Value"
            """).SingleAsync(cancellationToken);
        if (json is null) throw new InvoiceNotFoundException($"Invoice {id} not found");
        using var document = JsonDocument.Parse(json);
        if (document.RootElement.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.String && !string.IsNullOrEmpty(error.GetString()))
            throw new InvoiceNotFoundException(error.GetString()!);
        return document.RootElement.Clone();
    }
}
