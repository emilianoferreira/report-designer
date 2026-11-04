using Microsoft.AspNetCore.Mvc;
using ReportDesigner.Api.Compatibility;
using ReportDesigner.Application.Templates;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using ReportDesigner.Application.Common;

namespace ReportDesigner.Api.Templates;

[ApiController]
[Route("api/templates")]
[Produces("application/json")]
[ServiceFilter(typeof(LegacyApiExceptionFilter))]
public sealed class TemplatesController(ITemplateQueries queries, ITemplateCommands commands, ICompanyContext tenant) : ControllerBase
{
    private string DefaultCompany => tenant.CompanyId.ToString();

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        // Default only when absent; explicit values must match the authenticated company.
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

    [HttpPost]
    public async Task<IActionResult> Create([FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] JsonElement body, CancellationToken cancellationToken)
    {
        var name = Property(body, "nombre");
        var company = Property(body, "company_id");
        var description = Property(body, "descripcion");
        var command = new CreateTemplate(name.ValueKind == JsonValueKind.Undefined || name.ValueKind == JsonValueKind.Null ? null : name.GetString(),
            Truthy(company) ? company.GetString()! : DefaultCompany,
            Truthy(description) ? description.GetString()! : "", Property(body, "template_json"));
        var result = await commands.CreateAsync(command, cancellationToken);
        return StatusCode(201, TemplateResponse.From(result));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update([FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] JsonElement body, CancellationToken cancellationToken)
    {
        var fields = body.ValueKind == JsonValueKind.Object
            ? body.EnumerateObject().ToDictionary(field => field.Name, field => field.Value)
            : new Dictionary<string, JsonElement>();
        return Ok(TemplateResponse.From(await commands.UpdateAsync(Id, new TemplateChanges(fields), cancellationToken)));
    }

    [HttpPut("{id}/design")]
    public async Task<IActionResult> SaveDesign([FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] JsonElement body, CancellationToken cancellationToken)
    {
        var result = await commands.SaveDesignAsync(Id, Property(body, "template_json"), cancellationToken);
        var response = TemplateResponse.From(result.Template);
        return Ok(result.OmitDesign ? response with { TemplateJson = null } : response);
    }

    [HttpPost("{id}/duplicate")]
    public async Task<IActionResult> Duplicate(CancellationToken cancellationToken) =>
        StatusCode(201, TemplateResponse.From(await commands.DuplicateAsync(Id, cancellationToken)));

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(CancellationToken cancellationToken)
    {
        await commands.DeleteAsync(Id, cancellationToken);
        return new EmptyResult(); // NestJS returns 200 with an empty body.
    }

    private string Id => (string)RouteData.Values["id"]!;
    private static JsonElement Property(JsonElement body, string name) =>
        body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out var value) ? value : default;
    private static bool Truthy(JsonElement value) => value.ValueKind switch {
        JsonValueKind.Undefined or JsonValueKind.Null or JsonValueKind.False => false,
        JsonValueKind.String => value.GetString() != "",
        JsonValueKind.Number => value.GetDouble() != 0,
        _ => true
    };
}
