using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Templates;
using ReportDesigner.Infrastructure.Persistence;
using ReportDesigner.Application.Common;

namespace ReportDesigner.Infrastructure.Templates;

internal sealed class PostgresTemplateCommands(ReportDesignerDbContext db, ITemplateQueries queries, ICompanyContext company) : ITemplateCommands
{
    public async Task<TemplateReadModel> CreateAsync(CreateTemplate command, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(command.CompanyId, out var requested) || requested != company.CompanyId) throw new AccessDeniedException();
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
        await LockRevision(id, changes.ExpectedVersion, cancellationToken);
        // Ownership and identity are immutable; cross-company references are never accepted.
        foreach (var key in new[] { "id", "company_id", "company", "created_at", "updated_at" })
            if (changes.Fields.ContainsKey(key)) throw new AccessDeniedException();
        if (changes.Fields.TryGetValue("based_on", out var reference) && reference.ValueKind != JsonValueKind.Null)
            await Required(reference.GetString()!, cancellationToken);
        // Fixed SQL column names; all client values remain parameters. Extra properties never become SQL.
        var json = JsonSerializer.Serialize(changes.ExpectedVersion.HasValue ? changes.Fields.Where(f => f.Key != "version").ToDictionary(f => f.Key, f => f.Value) : changes.Fields);
        var explicitTimestamp = changes.Fields.ContainsKey("updated_at");
        await db.Database.ExecuteSqlAsync($"""
            UPDATE report_templates t SET nombre = p.nombre, descripcion = p.descripcion,
                company_id = p.company_id, autor = p.autor, tags = p.tags, estado = p.estado,
                template_json = p.template_json, based_on = p.based_on, created_at = p.created_at,
                version = CASE WHEN p.version IS NULL OR p.version = 0 THEN 2 ELSE p.version + 1 END,
                updated_at = CASE WHEN {explicitTimestamp} THEN p.updated_at ELSE CURRENT_TIMESTAMP END
            FROM (SELECT p.* FROM report_templates original
                CROSS JOIN LATERAL jsonb_populate_record(original, CAST({json} AS jsonb)) p
                WHERE original.id = CAST({id} AS uuid) AND original.company_id = {company.CompanyId}) p
            WHERE t.id = CAST({id} AS uuid) AND t.company_id = {company.CompanyId}
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

    public async Task<TemplateWriteResult> SaveDesignAsync(string id, JsonElement design, CancellationToken cancellationToken, int? expectedVersion = null)
    {
        var fields = new Dictionary<string, JsonElement>();
        if (design.ValueKind != JsonValueKind.Undefined) fields["template_json"] = design;
        var result = await UpdateAsync(id, new TemplateChanges(fields, expectedVersion), cancellationToken);
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
            FROM report_templates WHERE id = CAST({id} AS uuid) AND company_id = {company.CompanyId}
            """, cancellationToken);
        var result = await Required(copyId.ToString(), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return result;
    }

    public async Task DeleteAsync(string id, CancellationToken cancellationToken, int? expectedVersion = null)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await LockRevision(id, expectedVersion, cancellationToken);
        await db.Database.ExecuteSqlAsync($"DELETE FROM report_templates WHERE id = CAST({id} AS uuid) AND company_id = {company.CompanyId}", cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    private async Task LockRevision(string id, int? expected, CancellationToken cancellationToken)
    {
        // Lock before reading the revision, including legacy writes, to avoid a stale UPDATE source row.
        var versions = await db.Database.SqlQuery<int>($"SELECT COALESCE(version, 0) AS value FROM report_templates WHERE id = CAST({id} AS uuid) AND company_id = {company.CompanyId} FOR UPDATE").ToListAsync(cancellationToken);
        if (versions.Count == 0) throw new TemplateNotFoundException(id);
        if (expected.HasValue && versions[0] != expected.Value) throw new TemplateConflictException();
    }

    private async Task<TemplateReadModel> Required(string id, CancellationToken cancellationToken) =>
        await queries.FindAsync(id, cancellationToken) ?? throw new TemplateNotFoundException(id);
}
