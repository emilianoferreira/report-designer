namespace ReportDesigner.Application.Common;

// Set only from the authenticated session, never from request data.
public interface ICompanyContext { Guid CompanyId { get; } }
