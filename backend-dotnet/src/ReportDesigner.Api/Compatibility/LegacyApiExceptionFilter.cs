using ReportDesigner.Application.Templates;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using ReportDesigner.Application.Common;

namespace ReportDesigner.Api.Compatibility;

// Preserve Nest's public error envelope rather than exposing SQL or ASP.NET ProblemDetails.
public sealed class LegacyApiExceptionFilter(ILogger<LegacyApiExceptionFilter> logger) : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is OperationCanceledException && context.HttpContext.RequestAborted.IsCancellationRequested)
            return;
        if (context.Exception is TemplateConflictException or InvalidTemplateRevisionException)
        {
            var status = context.Exception is TemplateConflictException ? 409 : 400;
            context.Result = new ObjectResult(new { statusCode = status, message = context.Exception.Message, error = status == 409 ? "Conflict" : "Bad Request" }) { StatusCode = status };
            context.ExceptionHandled = true;
            return;
        }
        if (context.Exception is AccessDeniedException)
        {
            context.Result = new ObjectResult(new { statusCode = 403, message = "Forbidden", error = "Forbidden" }) { StatusCode = 403 };
            context.ExceptionHandled = true;
            return;
        }
        if (context.Exception is ResourceNotFoundException missing)
        {
            context.Result = new NotFoundObjectResult(new { message = missing.Message, error = "Not Found", statusCode = 404 });
            context.ExceptionHandled = true;
            return;
        }
        logger.LogError(context.Exception, "API operation failed.");
        context.Result = new ObjectResult(new { statusCode = 500, message = "Internal server error" }) { StatusCode = 500 };
        context.ExceptionHandled = true;
    }
}
