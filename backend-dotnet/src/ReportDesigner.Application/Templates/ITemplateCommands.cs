using System.Text.Json;
using ReportDesigner.Application.Common;

namespace ReportDesigner.Application.Templates;

public sealed record CreateTemplate(string? Nombre, string CompanyId, string Descripcion, JsonElement Design);
// A dictionary preserves absent vs explicit null without imposing an editor schema.
public sealed record TemplateChanges(IReadOnlyDictionary<string, JsonElement> Fields, int? ExpectedVersion = null);
public sealed record TemplateWriteResult(TemplateReadModel Template, bool OmitDesign = false);
public sealed class TemplateNotFoundException(string id) : ResourceNotFoundException($"Template {id} not found");

public interface ITemplateCommands
{
    Task<TemplateReadModel> CreateAsync(CreateTemplate command, CancellationToken cancellationToken);
    Task<TemplateReadModel> UpdateAsync(string id, TemplateChanges changes, CancellationToken cancellationToken);
    Task<TemplateWriteResult> SaveDesignAsync(string id, JsonElement design, CancellationToken cancellationToken, int? expectedVersion = null);
    Task<TemplateReadModel> DuplicateAsync(string id, CancellationToken cancellationToken);
    Task DeleteAsync(string id, CancellationToken cancellationToken, int? expectedVersion = null);
}

public sealed class TemplateConflictException() : Exception("Template revision conflict");
public sealed class InvalidTemplateRevisionException() : Exception("Invalid If-Match revision");
