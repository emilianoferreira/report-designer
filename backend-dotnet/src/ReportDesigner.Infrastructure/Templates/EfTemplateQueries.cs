using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Templates;
using ReportDesigner.Infrastructure.Persistence;
using ReportDesigner.Infrastructure.Persistence.Entities;

namespace ReportDesigner.Infrastructure.Templates;

internal sealed class EfTemplateQueries(ReportDesignerDbContext db) : ITemplateQueries
{
    public async Task<IReadOnlyList<TemplateReadModel>> ListAsync(string companyId, CancellationToken cancellationToken)
    {
        // FromSql parameterizes these values. PostgreSQL retains the legacy UUID parsing semantics.
        var rows = await db.Templates.FromSql($"""
            SELECT id, company_id, nombre, descripcion, version, autor, tags, estado,
                   template_json, based_on, created_at, updated_at
            FROM report_templates WHERE company_id = CAST({companyId} AS uuid)
            """)
            .AsNoTracking().OrderByDescending(row => row.UpdatedAt).ToListAsync(cancellationToken);
        return rows.Select(ToReadModel).ToArray();
    }

    public async Task<TemplateReadModel?> FindAsync(string id, CancellationToken cancellationToken)
    {
        // Legacy lookup is by row identity only; tenant authorization is a separate migration decision.
        var row = await db.Templates.FromSql($"""
            SELECT id, company_id, nombre, descripcion, version, autor, tags, estado,
                   template_json, based_on, created_at, updated_at
            FROM report_templates WHERE id = CAST({id} AS uuid)
            """)
            .AsNoTracking().SingleOrDefaultAsync(cancellationToken);
        return row is null ? null : ToReadModel(row);
    }

    private static TemplateReadModel ToReadModel(ReportTemplateRow row) => new(
        row.Id, row.CompanyId, row.Nombre, row.Descripcion, row.Version, row.Autor,
        row.Tags, row.Estado, row.TemplateJson, row.BasedOn, row.CreatedAt, row.UpdatedAt);
}
