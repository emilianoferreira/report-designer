using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using ReportDesigner.Application.Templates;

namespace ReportDesigner.Api.Templates;

// Preserve Nest's public error envelope rather than exposing SQL or ASP.NET ProblemDetails.
public sealed class LegacyTemplateExceptionFilter(ILogger<LegacyTemplateExceptionFilter> logger) : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is OperationCanceledException && context.HttpContext.RequestAborted.IsCancellationRequested)
            return;
        if (context.Exception is TemplateNotFoundException missing)
        {
            context.Result = new NotFoundObjectResult(new { message = missing.Message, error = "Not Found", statusCode = 404 });
            context.ExceptionHandled = true;
            return;
        }
        logger.LogError(context.Exception, "Template operation failed.");
        context.Result = new ObjectResult(new { statusCode = 500, message = "Internal server error" }) { StatusCode = 500 };
        context.ExceptionHandled = true;
    }
}
