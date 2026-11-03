using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Templates;
using ReportDesigner.Infrastructure.Persistence;

namespace ReportDesigner.Infrastructure.Templates;

internal sealed class PostgresTemplateCommands(ReportDesignerDbContext db, ITemplateQueries queries) : ITemplateCommands
{
    public async Task<TemplateReadModel> CreateAsync(CreateTemplate command, CancellationToken cancellationToken)
    {
        var fields = new Dictionary<string, object?> {
            ["company_id"] = command.CompanyId, ["nombre"] = command.Nombre, ["descripcion"] = command.Descripcion
        };
        if (command.Design.ValueKind != JsonValueKind.Undefined) fields["template_json"] = command.Design;
        var json = JsonSerializer.Serialize(fields);
        var id = Guid.NewGuid();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // Only creation fields are supplied; PostgreSQL supplies the same defaults as NestJS.
        await db.Database.ExecuteSqlAsync($"""
            INSERT INTO report_templates (id, company_id, nombre, descripcion, template_json)
            SELECT {id}, p.company_id, p.nombre, p.descripcion, p.template_json
            FROM jsonb_populate_record(NULL::report_templates, CAST({json} AS jsonb)) p
            """, cancellationToken);
        var result = await Required(id.ToString(), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    public async Task<TemplateReadModel> UpdateAsync(string id, TemplateChanges changes, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await Required(id, cancellationToken);
        // Fixed SQL column names; all client values remain parameters. Extra properties never become SQL.
        var json = JsonSerializer.Serialize(changes.Fields);
        var explicitTimestamp = changes.Fields.ContainsKey("updated_at");
        await db.Database.ExecuteSqlAsync($"""
            UPDATE report_templates t SET nombre = p.nombre, descripcion = p.descripcion,
                company_id = p.company_id, autor = p.autor, tags = p.tags, estado = p.estado,
                template_json = p.template_json, based_on = p.based_on, created_at = p.created_at,
                version = CASE WHEN p.version IS NULL OR p.version = 0 THEN 2 ELSE p.version + 1 END,
                updated_at = CASE WHEN {explicitTimestamp} THEN p.updated_at ELSE CURRENT_TIMESTAMP END
            FROM (SELECT p.* FROM report_templates original
                CROSS JOIN LATERAL jsonb_populate_record(original, CAST({json} AS jsonb)) p
                WHERE original.id = CAST({id} AS uuid)) p
            WHERE t.id = CAST({id} AS uuid)
              AND ROW(t.nombre, t.descripcion, t.company_id, t.autor, t.tags, t.estado,
                      t.template_json, t.based_on, t.created_at, t.version, t.updated_at)
                  IS DISTINCT FROM ROW(p.nombre, p.descripcion, p.company_id, p.autor, p.tags, p.estado,
                      p.template_json, p.based_on, p.created_at,
                      CASE WHEN p.version IS NULL OR p.version = 0 THEN 2 ELSE p.version + 1 END,
                      CASE WHEN {explicitTimestamp} THEN p.updated_at ELSE t.updated_at END)
            """, cancellationToken);
        var result = await Required(id, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    public async Task<TemplateWriteResult> SaveDesignAsync(string id, JsonElement design, CancellationToken cancellationToken)
    {
        var fields = new Dictionary<string, JsonElement>();
        if (design.ValueKind != JsonValueKind.Undefined) fields["template_json"] = design;
        var result = await UpdateAsync(id, new TemplateChanges(fields), cancellationToken);
        // TypeORM skips undefined in SQL and omits that property from the returned object.
        return new TemplateWriteResult(result, design.ValueKind == JsonValueKind.Undefined);
    }

    public async Task<TemplateReadModel> DuplicateAsync(string id, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await Required(id, cancellationToken);
        var copyId = Guid.NewGuid();
        await db.Database.ExecuteSqlAsync($"""
            INSERT INTO report_templates (id, company_id, nombre, descripcion, version, autor,
                tags, estado, template_json, based_on)
            SELECT {copyId}, company_id, nombre || ' (copia)', descripcion, 1, autor,
                tags, estado, template_json, based_on
            FROM report_templates WHERE id = CAST({id} AS uuid)
            """, cancellationToken);
        var result = await Required(copyId.ToString(), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    public async Task DeleteAsync(string id, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await Required(id, cancellationToken);
        await db.Database.ExecuteSqlAsync($"DELETE FROM report_templates WHERE id = CAST({id} AS uuid)", cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private async Task<TemplateReadModel> Required(string id, CancellationToken cancellationToken) =>
        await queries.FindAsync(id, cancellationToken) ?? throw new TemplateNotFoundException(id);
}
