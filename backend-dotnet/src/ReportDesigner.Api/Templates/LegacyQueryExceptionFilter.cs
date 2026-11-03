using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ReportDesigner.Api.Templates;

// Preserve Nest's public error envelope rather than exposing SQL or ASP.NET ProblemDetails.
public sealed class LegacyQueryExceptionFilter(ILogger<LegacyQueryExceptionFilter> logger) : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is OperationCanceledException && context.HttpContext.RequestAborted.IsCancellationRequested)
            return;
        logger.LogError(context.Exception, "Template query failed.");
        context.Result = new ObjectResult(new { statusCode = 500, message = "Internal server error" }) { StatusCode = 500 };
        context.ExceptionHandled = true;
    }
}
