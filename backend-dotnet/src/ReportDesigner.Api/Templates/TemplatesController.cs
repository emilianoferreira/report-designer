using Microsoft.AspNetCore.Mvc;
using ReportDesigner.Application.Templates;

namespace ReportDesigner.Api.Templates;

[ApiController]
[Route("api/templates")]
[Produces("application/json")]
[ServiceFilter(typeof(LegacyQueryExceptionFilter))]
public sealed class TemplatesController(ITemplateQueries queries) : ControllerBase
{
    private const string DefaultCompany = "c1000000-0000-0000-0000-000000000001";

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        // Default only when absent: an explicitly empty value must retain the legacy 500.
        var companyId = Request.Query.TryGetValue("companyId", out var value) ? value.ToString() : DefaultCompany;
        var rows = await queries.ListAsync(companyId, cancellationToken);
        return Ok(rows.Select(TemplateResponse.From).ToArray());
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Find(CancellationToken cancellationToken)
    {
        // Read the opaque segment directly: MVC would turn whitespace-only strings into null/400.
        var id = (string)RouteData.Values["id"]!;
        var row = await queries.FindAsync(id, cancellationToken);
        return row is null
            ? NotFound(new { message = $"Template {id} not found", error = "Not Found", statusCode = 404 })
            : Ok(TemplateResponse.From(row));
    }
}
