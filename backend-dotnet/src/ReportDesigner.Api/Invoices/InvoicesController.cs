using Microsoft.AspNetCore.Mvc;
using ReportDesigner.Api.Compatibility;
using ReportDesigner.Application.Invoices;

namespace ReportDesigner.Api.Invoices;

[ApiController]
[Route("api/invoices")]
[Produces("application/json")]
[ServiceFilter(typeof(LegacyApiExceptionFilter))]
public sealed class InvoicesController(IInvoiceQueries queries) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        // An empty value is not the same as an absent parameter in NestJS.
        var companyId = Request.Query.TryGetValue("companyId", out var value)
            ? value.ToString() : "c1000000-0000-0000-0000-000000000001";
        return Ok((await queries.ListAsync(companyId, cancellationToken)).Select(InvoiceSummaryResponse.From).ToArray());
    }

    [HttpGet("{id}/data")]
    public async Task<IActionResult> Data(CancellationToken cancellationToken)
    {
        // Avoid MVC's automatic 400 for whitespace-only segments; PostgreSQL owns UUID parsing.
        var id = (string)RouteData.Values["id"]!;
        return Ok(await queries.GetDataAsync(id, cancellationToken));
    }
}
