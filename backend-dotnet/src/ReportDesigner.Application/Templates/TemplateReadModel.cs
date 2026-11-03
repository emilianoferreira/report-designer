using System.Text.Json;

namespace ReportDesigner.Application.Templates;

public sealed record TemplateReadModel(
    Guid Id, Guid CompanyId, string Nombre, string? Descripcion, int? Version,
    string? Autor, string[]? Tags, string? Estado, JsonElement TemplateJson,
    Guid? BasedOn, DateTime? CreatedAt, DateTime? UpdatedAt);
