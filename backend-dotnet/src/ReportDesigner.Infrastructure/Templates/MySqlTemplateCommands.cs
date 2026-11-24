using System.Data;
using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Common;
using ReportDesigner.Application.Templates;
using ReportDesigner.Infrastructure.Persistence;

namespace ReportDesigner.Infrastructure.Templates;

internal sealed class MySqlTemplateCommands(MySqlReportDesignerDbContext db, ITemplateQueries queries, ICompanyContext company) : ITemplateCommands
{
    public async Task<TemplateReadModel> CreateAsync(CreateTemplate command, CancellationToken ct)
    {
        if (!Guid.TryParse(command.CompanyId, out var requested) || requested != company.CompanyId) throw new AccessDeniedException();
        _ = StoredJson.Normalize(JsonSerializer.SerializeToElement(new { command.Nombre, command.Descripcion }));
        var design = Design(command.Design); var id = Guid.NewGuid().ToString();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO report_templates(id,company_id,nombre,descripcion,template_json,created_at,updated_at)
            VALUES({id},{company.CompanyId.ToString()},{command.Nombre},{command.Descripcion},{design},UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))
            """, ct);
        var result = await Required(id, ct); await tx.CommitAsync(ct); return result;
    }

    public async Task<TemplateReadModel> UpdateAsync(string id, TemplateChanges changes, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await Lock(id, changes.ExpectedVersion, ct);
        foreach (var key in new[] { "id", "company_id", "company", "created_at", "updated_at" })
            if (changes.Fields.ContainsKey(key)) throw new AccessDeniedException();
        _ = StoredJson.Normalize(JsonSerializer.SerializeToElement(changes.Fields.Where(f => !changes.ExpectedVersion.HasValue || f.Key != "version").ToDictionary(f => f.Key, f => f.Value)));
        var old = await Required(id, ct); var fields = changes.Fields;
        string? Field(string key, string? fallback) => fields.TryGetValue(key, out var value) ? Text(value) : fallback;
        var name = Field("nombre", old.Nombre); var description = Field("descripcion", old.Descripcion);
        var author = Field("autor", old.Autor); var state = Field("estado", old.Estado);
        var basedOn = fields.TryGetValue("based_on", out var reference) ? (reference.ValueKind == JsonValueKind.Null ? null : Guid.Parse(reference.GetString()!).ToString()) : old.BasedOn?.ToString();
        if (fields.ContainsKey("based_on") && basedOn is not null) await Required(basedOn, ct);
        var tags = old.Tags;
        if (fields.TryGetValue("tags", out var tagValue))
        {
            if (tagValue.ValueKind == JsonValueKind.Array && tagValue.EnumerateArray().Any(value => value.ValueKind == JsonValueKind.Array))
                throw new InvalidOperationException("Multidimensional tags cannot be read by the existing API.");
            tags = tagValue.ValueKind == JsonValueKind.Null ? null : tagValue.EnumerateArray().Select(value => Text(value)!).ToArray();
        }
        var design = fields.TryGetValue("template_json", out var json) ? Design(json) : StoredJson.Normalize(old.TemplateJson);
        var version = old.Version;
        if (!changes.ExpectedVersion.HasValue && fields.TryGetValue("version", out var requestedVersion))
            version = requestedVersion.ValueKind == JsonValueKind.Null ? null : int.Parse(Text(requestedVersion)!, CultureInfo.InvariantCulture);
        var nextVersion = version is null or 0 ? 2 : checked(version.Value + 1);
        // Preserve the historical no-op when a legacy supplied version cancels the increment.
        if (name != old.Nombre || description != old.Descripcion || author != old.Autor || state != old.Estado
            || basedOn != old.BasedOn?.ToString() || JsonSerializer.Serialize(tags) != JsonSerializer.Serialize(old.Tags)
            || design != StoredJson.Normalize(old.TemplateJson) || nextVersion != old.Version)
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                UPDATE report_templates SET nombre={name},descripcion={description},autor={author},estado={state},
                    based_on={basedOn},tags={SerializeTags(tags)},template_json={design},version={nextVersion},updated_at=UTC_TIMESTAMP(6)
                WHERE id={Guid.Parse(id).ToString()} AND company_id={company.CompanyId.ToString()}
                """, ct);
        var result = await Required(id, ct); await tx.CommitAsync(ct); return result;
    }

    public async Task<TemplateWriteResult> SaveDesignAsync(string id, JsonElement design, CancellationToken ct, int? expectedVersion = null)
    {
        var fields = new Dictionary<string, JsonElement>();
        if (design.ValueKind != JsonValueKind.Undefined) fields["template_json"] = design;
        return new(await UpdateAsync(id, new TemplateChanges(fields, expectedVersion), ct), design.ValueKind == JsonValueKind.Undefined);
    }

    public async Task<TemplateReadModel> DuplicateAsync(string id, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await Lock(id, null, ct);
        var copy = Guid.NewGuid().ToString();
        var suffix = $" (copia {copy[..8]})";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO report_templates(id,company_id,nombre,descripcion,version,autor,tags,estado,template_json,based_on,created_at,updated_at)
            SELECT {copy},source.company_id,
                CASE WHEN EXISTS (SELECT 1 FROM report_templates AS copies
                    WHERE copies.company_id = source.company_id AND copies.nombre = CONCAT(LEFT(source.nombre, 192), ' (copia)'))
                    THEN CONCAT(LEFT(source.nombre, 200 - {suffix.Length}), {suffix})
                    ELSE CONCAT(LEFT(source.nombre, 192), ' (copia)') END,
                source.descripcion,1,source.autor,source.tags,source.estado,source.template_json,source.based_on,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6)
            FROM report_templates AS source WHERE source.id={Guid.Parse(id).ToString()} AND source.company_id={company.CompanyId.ToString()}
            """, ct);
        var result = await Required(copy, ct); await tx.CommitAsync(ct); return result;
    }

    public async Task DeleteAsync(string id, CancellationToken ct, int? expectedVersion = null)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, ct);
        await Lock(id, expectedVersion, ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM report_templates WHERE id={Guid.Parse(id).ToString()} AND company_id={company.CompanyId.ToString()}", ct);
        await tx.CommitAsync(ct);
    }
    private async Task Lock(string id, int? expected, CancellationToken ct)
    {
        var rows = await db.Database.SqlQuery<int>($"SELECT COALESCE(version,0) AS Value FROM report_templates WHERE id={Guid.Parse(id).ToString()} AND company_id={company.CompanyId.ToString()} FOR UPDATE").ToListAsync(ct);
        if (rows.Count == 0) throw new TemplateNotFoundException(id);
        if (expected.HasValue && expected.Value != rows[0]) throw new TemplateConflictException();
    }
    private async Task<TemplateReadModel> Required(string id, CancellationToken ct) => await queries.FindAsync(id, ct) ?? throw new TemplateNotFoundException(id);
    private static string? Text(JsonElement value) => StoredJson.AsText(value);
    private static string? SerializeTags(string[]? tags) => tags is null ? null : JsonSerializer.Serialize(tags);
    private static string Design(JsonElement value) => value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
        ? throw new InvalidOperationException("Design is required.") : StoredJson.Normalize(value);
}
