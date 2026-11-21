using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ReportDesigner.Application.LabelPrinting;
using ReportDesigner.Api.Compatibility;
namespace ReportDesigner.Api.LabelPrinting;

[ApiController, Route("api/label-print"), Authorize(Roles = "editor,viewer")]
[ServiceFilter(typeof(LegacyApiExceptionFilter))]
public sealed class LabelPrintingController(LabelPrintService service) : ControllerBase
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    [HttpGet("context")]
    public Task<IActionResult> Context(CancellationToken ct) => Run(() => service.ContextAsync(ct));
    [HttpGet("price-lists")]
    public Task<IActionResult> Lists(CancellationToken ct, [FromQuery] string? cursor = null, [FromQuery] int pageSize = 25) => Run(() => service.ListsAsync(cursor, pageSize, ct));
    [HttpGet("articles")]
    public Task<IActionResult> Search(CancellationToken ct, [FromQuery] string? query = null, [FromQuery] string? priceListId = null, [FromQuery] string? cursor = null, [FromQuery] int pageSize = 25) => Run(() => service.SearchAsync(query, priceListId, cursor, pageSize, ct));
    [HttpPost("resolve"), RequestSizeLimit(32768)]
    public Task<IActionResult> Resolve([FromBody] ResolveRequest request, CancellationToken ct) => Run(() => service.ResolveAsync(request.PriceListId, request.ArticleIds, ct));
    private async Task<IActionResult> Run<T>(Func<Task<T>> operation)
    {
        try { return new JsonResult(await operation(), Json); }
        catch (LabelPrintException e) { return StatusCode(e.Status, new { statusCode = e.Status, code = e.Code, message = e.Message }); }
    }
}
public sealed record ResolveRequest(
    [property: JsonPropertyName("priceListId")] string? PriceListId,
    [property: JsonPropertyName("articleIds")] string[]? ArticleIds);
