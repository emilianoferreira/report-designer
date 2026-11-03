using System.Text.Json;

namespace ReportDesigner.Infrastructure.Persistence.Entities;

// Persistence row, not an editor schema: arbitrary JSON properties must survive reads.
internal sealed class ReportTemplateRow
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public string Nombre { get; set; } = null!;
    public string? Descripcion { get; set; }
    public int? Version { get; set; }
    public string? Autor { get; set; }
    public string[]? Tags { get; set; }
    public string? Estado { get; set; }
    public JsonElement TemplateJson { get; set; }
    public Guid? BasedOn { get; set; }
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
