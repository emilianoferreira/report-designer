using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Common;
using ReportDesigner.Application.Invoices;
using ReportDesigner.Infrastructure.Persistence;

namespace ReportDesigner.Infrastructure.Invoices;

internal sealed class MySqlInvoiceQueries(MySqlReportDesignerDbContext db, ICompanyContext company, MySqlInvoiceDataSource source, TimeZoneInfo timeZone) : IInvoiceQueries
{
    public async Task<IReadOnlyList<InvoiceSummaryReadModel>> ListAsync(string companyId, CancellationToken ct)
    {
        if (!Guid.TryParse(companyId, out var requested) || requested != company.CompanyId) throw new AccessDeniedException();
        var rows = await db.Database.SqlQuery<MySqlInvoiceSummaryRow>($"""
            SELECT i.id AS Id, i.serie AS Serie, i.numero AS Numero, i.fecha AS Fecha,
                CAST(i.total AS CHAR) AS Total, i.estado AS Estado, t.nombre AS TypeName, t.codigo AS TypeCode,
                c.guardar_como AS ContactName, cur.iso4217 AS CurrencyCode, cur.simbolo AS CurrencySymbol
            FROM invoices i LEFT JOIN invoice_types t ON t.id=i.type_id
            LEFT JOIN contacts c ON c.id=i.contact_id LEFT JOIN currencies cur ON cur.id=i.currency_id
            WHERE i.company_id={company.CompanyId.ToString()}
              AND (c.company_id IS NULL OR c.company_id=i.company_id) AND t.company_id=i.company_id
            ORDER BY i.fecha DESC
            """).ToListAsync(ct);
        return rows.Select(r => new InvoiceSummaryReadModel(Guid.Parse(r.Id), r.Serie, r.Numero, DateTime.SpecifyKind(r.Fecha, DateTimeKind.Utc), r.Total, r.Estado,
            r.TypeName, r.TypeCode, r.ContactName, r.CurrencyCode, r.CurrencySymbol)).ToArray();
    }
    public async Task<JsonElement> GetDataAsync(string id, CancellationToken ct) => new InvoiceDataBuilder().Build(await source.LoadAsync(Guid.Parse(id), ct), timeZone);
}

internal sealed class MySqlInvoiceSummaryRow
{
    public string Id { get; set; } = "";
    public string? Serie { get; set; }
    public int Numero { get; set; }
    public DateTime Fecha { get; set; }
    public string? Total { get; set; }
    public string? Estado { get; set; }
    public string TypeName { get; set; } = "";
    public string? TypeCode { get; set; }
    public string? ContactName { get; set; }
    public string CurrencyCode { get; set; } = "";
    public string CurrencySymbol { get; set; } = "";
}
