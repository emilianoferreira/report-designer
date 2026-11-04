using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Templates;
using ReportDesigner.Infrastructure.Persistence;
using ReportDesigner.Infrastructure.Persistence.Entities;
using ReportDesigner.Application.Common;

namespace ReportDesigner.Infrastructure.Templates;

internal sealed class EfTemplateQueries(ReportDesignerDbContext db, ICompanyContext company) : ITemplateQueries
{
    public async Task<IReadOnlyList<TemplateReadModel>> ListAsync(string companyId, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(companyId, out var requested) || requested != company.CompanyId) throw new AccessDeniedException();
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
        // A foreign row is deliberately indistinguishable from an absent row.
        var row = await db.Templates.FromSql($"""
            SELECT id, company_id, nombre, descripcion, version, autor, tags, estado,
                   template_json, based_on, created_at, updated_at
            FROM report_templates WHERE id = CAST({id} AS uuid) AND company_id = {company.CompanyId}
            """)
            .AsNoTracking().SingleOrDefaultAsync(cancellationToken);
        return row is null ? null : ToReadModel(row);
    }

    private static TemplateReadModel ToReadModel(ReportTemplateRow row) => new(
        row.Id, row.CompanyId, row.Nombre, row.Descripcion, row.Version, row.Autor,
        row.Tags, row.Estado, row.TemplateJson, row.BasedOn, row.CreatedAt, row.UpdatedAt);
}
