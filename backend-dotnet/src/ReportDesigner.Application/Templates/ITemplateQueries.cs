namespace ReportDesigner.Application.Templates;

public interface ITemplateQueries
{
    Task<IReadOnlyList<TemplateReadModel>> ListAsync(string companyId, CancellationToken cancellationToken);
    Task<TemplateReadModel?> FindAsync(string id, CancellationToken cancellationToken);
}
