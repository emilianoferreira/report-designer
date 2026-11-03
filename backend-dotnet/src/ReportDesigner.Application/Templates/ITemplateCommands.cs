using System.Text.Json;

namespace ReportDesigner.Application.Templates;

public sealed record CreateTemplate(string? Nombre, string CompanyId, string Descripcion, JsonElement Design);
// A dictionary preserves absent vs explicit null without imposing an editor schema.
public sealed record TemplateChanges(IReadOnlyDictionary<string, JsonElement> Fields);
public sealed record TemplateWriteResult(TemplateReadModel Template, bool OmitDesign = false);
public sealed class TemplateNotFoundException(string id) : Exception($"Template {id} not found");

public interface ITemplateCommands
{
    Task<TemplateReadModel> CreateAsync(CreateTemplate command, CancellationToken cancellationToken);
    Task<TemplateReadModel> UpdateAsync(string id, TemplateChanges changes, CancellationToken cancellationToken);
    Task<TemplateWriteResult> SaveDesignAsync(string id, JsonElement design, CancellationToken cancellationToken);
    Task<TemplateReadModel> DuplicateAsync(string id, CancellationToken cancellationToken);
    Task DeleteAsync(string id, CancellationToken cancellationToken);
}
