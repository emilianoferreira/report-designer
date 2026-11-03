namespace ReportDesigner.Application.Common;

public abstract class ResourceNotFoundException(string message) : Exception(message);
