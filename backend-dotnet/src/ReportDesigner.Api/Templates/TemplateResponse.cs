using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using ReportDesigner.Application.Templates;

namespace ReportDesigner.Api.Templates;

public sealed record TemplateResponse(
    [property: JsonPropertyName("id")] Guid Id,
    [property: JsonPropertyName("company_id")] Guid CompanyId,
    [property: JsonPropertyName("nombre")] string Nombre,
    [property: JsonPropertyName("descripcion")] string? Descripcion,
    [property: JsonPropertyName("version")] int? Version,
    [property: JsonPropertyName("autor")] string? Autor,
    [property: JsonPropertyName("tags")] string[]? Tags,
    [property: JsonPropertyName("estado")] string? Estado,
    [property: JsonPropertyName("template_json")] JsonElement TemplateJson,
    [property: JsonPropertyName("based_on")] Guid? BasedOn,
    [property: JsonPropertyName("created_at")] string? CreatedAt,
    [property: JsonPropertyName("updated_at")] string? UpdatedAt)
{
    public static TemplateResponse From(TemplateReadModel row) => new(
        row.Id, row.CompanyId, row.Nombre, row.Descripcion, row.Version, row.Autor,
        row.Tags, row.Estado, row.TemplateJson, row.BasedOn, Timestamp(row.CreatedAt), Timestamp(row.UpdatedAt));

    // JavaScript Date.toJSON emits UTC milliseconds, truncating PostgreSQL microseconds.
    private static string? Timestamp(DateTime? value) => value?.ToUniversalTime()
        .ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
