using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Common;
using ReportDesigner.Application.Templates;
using ReportDesigner.Infrastructure.Persistence;

namespace ReportDesigner.Infrastructure.Templates;

internal sealed class MySqlTemplateQueries(MySqlReportDesignerDbContext db, ICompanyContext company) : ITemplateQueries
{
    internal const string Columns = "id AS Id, company_id AS CompanyId, nombre AS Nombre, descripcion AS Descripcion, version AS Version, autor AS Autor, tags AS Tags, estado AS Estado, template_json AS TemplateJson, based_on AS BasedOn, created_at AS CreatedAt, updated_at AS UpdatedAt";
    public async Task<IReadOnlyList<TemplateReadModel>> ListAsync(string companyId, CancellationToken ct)
    {
        if (!Guid.TryParse(companyId, out var requested) || requested != company.CompanyId) throw new AccessDeniedException();
        var rows = await db.Database.SqlQueryRaw<MySqlTemplateRow>("SELECT " + Columns + " FROM report_templates WHERE company_id={0} ORDER BY updated_at DESC", company.CompanyId.ToString()).ToListAsync(ct);
        return rows.Select(Map).ToArray();
    }
    public async Task<TemplateReadModel?> FindAsync(string id, CancellationToken ct)
    {
        var row = await db.Database.SqlQueryRaw<MySqlTemplateRow>("SELECT " + Columns + " FROM report_templates WHERE id={0} AND company_id={1}", Guid.Parse(id).ToString(), company.CompanyId.ToString()).SingleOrDefaultAsync(ct);
        return row is null ? null : Map(row);
    }
    private static TemplateReadModel Map(MySqlTemplateRow row) => new(Guid.Parse(row.Id), Guid.Parse(row.CompanyId), row.Nombre, row.Descripcion, row.Version, row.Autor,
        row.Tags is null ? null : JsonSerializer.Deserialize<string[]>(row.Tags), row.Estado, StoredJson.Parse(row.TemplateJson),
        row.BasedOn is null ? null : Guid.Parse(row.BasedOn), Utc(row.CreatedAt), Utc(row.UpdatedAt));
    private static DateTime? Utc(DateTime? value) => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null;
}

internal sealed class MySqlTemplateRow
{
    public string Id { get; set; } = "";
    public string CompanyId { get; set; } = "";
    public string Nombre { get; set; } = "";
    public string? Descripcion { get; set; }
    public int? Version { get; set; }
    public string? Autor { get; set; }
    public string? Tags { get; set; }
    public string? Estado { get; set; }
    public string TemplateJson { get; set; } = "";
    public string? BasedOn { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
