using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ReportDesigner.Api.Fiscal;

[ApiController]
[Route("api/fiscal/advice")]
public sealed class FiscalAdviceController(IConfiguration configuration, IHttpClientFactory clients) : ControllerBase
{
    // Server-owned excerpts from the local catalogue. The browser supplies only an ID and state.
    private static readonly Dictionary<string, string> Rules = new(StringComparer.Ordinal)
    {
        ["PAP-01"] = "Formato CFE 25.2 pág. 79. Tamaño de hoja entre 150 × 57 mm y 356 × 216 mm en ambas orientaciones. Revisar las dimensiones en Diseño.",
        ["PAP-02"] = "Formato CFE 25.2 pág. 79. El rollo tiene ancho mínimo de 57 mm. Revisar ancho y soporte en el perfil.",
        ["LEG-01"] = "Formato CFE 25.2 pág. 80. Borde sin letras de 5 mm. Revisar las letras impresas y su distancia al borde.",
        ["LEG-02"] = "Formato CFE 25.2 págs. 80–85. Revisar la altura efectiva de caracteres impresos. El tamaño CSS no mide las letras impresas.",
        ["ID-01"] = "Formato CFE 25.2 pág. 81. Revisar nombre o razón social del emisor, nombre comercial si existe y domicilio fiscal.",
        ["ID-02"] = "Formato CFE 25.2 pág. 81. Revisar la denominación del CFE, RUT, serie, número y forma de pago cuando corresponda.",
        ["REC-02"] = "Formato CFE 25.2 pág. 82. Revisar si corresponde el recuadro CONSUMO FINAL. Su aplicación depende del comprobante y del receptor.",
        ["REG-05"] = "Formato CFE 25.2 pág. 81. Cuando corresponda, revisar el recuadro de régimen de 40 × 10 mm, su ubicación y la altura de caracteres de 3 mm.",
        ["CON-01"] = "Formato CFE 25.2 pág. 83. Comparar la fecha de emisión visible con la del comprobante de origen.",
        ["CON-05.07"] = "Formato CFE 25.2 págs. 47 y 83. Revisar el monto no facturable A.129 cuando corresponde. Cero es un valor informado.",
        ["REF-03.02"] = "Formato CFE 25.2 pág. 65. F.6 es obligatorio para una referencia global. Si se informa en una referencia identificada, revisar que se imprima.",
        ["QR-01"] = "Formato CFE 25.2 pág. 84. Revisar que el sello esté visible y que se resuelva el contenido de consulta desde el origen.",
        ["QR-02"] = "Formato CFE 25.2 pág. 84. Medir el símbolo y su margen por separado. Extremos de 22 mm con margen de 3 mm y 30 mm con margen de 5 mm. No interpolar.",
        ["QR-03"] = "Formato CFE 25.2 pág. 84. Comparar el contenido con el origen: RUT, tipo, serie, número, importe aplicable, fecha de firma y hash completo.",
        ["QR-04"] = "Formato CFE 25.2 pág. 84. Revisar que los seis primeros caracteres del hash se vean debajo del QR.",
        ["PIE-02"] = "Formato CFE 25.2 pág. 84. Comparar el número de CAE, rango autorizado y vencimiento con el origen.",
        ["EXT-03"] = "Formato CFE 25.2 pág. 80. Revisar en cada hoja los datos de identificación que correspondan, la numeración y el sello. El resto del pie va en la última hoja."
    };

    private string? Key => configuration["FiscalAdvice:OpenAI:ApiKey"];
    private string? Model => configuration["FiscalAdvice:OpenAI:Model"];
    private bool Enabled => configuration.GetValue<bool>("FiscalAdvice:Enabled") &&
        !string.IsNullOrWhiteSpace(Key) && !string.IsNullOrWhiteSpace(Model);

    [HttpGet]
    public IActionResult Availability() => Ok(new { ruleIds = Enabled ? Rules.Keys.ToArray() : Array.Empty<string>() });

    [HttpPost]
    [RequestSizeLimit(1024)]
    [EnableRateLimiting("fiscal-advice")]
    public async Task<IActionResult> Explain([FromBody] AdviceRequest request, CancellationToken cancellationToken)
    {
        if (request.RuleId is null || !Rules.TryGetValue(request.RuleId, out var rule) ||
            request.Status is not ("fail" or "pending")) return BadRequest();
        if (!Enabled) return StatusCode(503);

        using var message = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Key);
        message.Content = JsonContent.Create(new
        {
            model = Model,
            store = false,
            max_output_tokens = 600,
            instructions = """
                Explicá el resultado de una regla del diseñador de comprobantes uruguayos.
                Escribí en español rioplatense, en texto plano y en hasta 100 palabras.
                Usá exclusivamente la ficha provista. Conservá el estado dado.
                Para Pendiente, indicá qué revisar sin atribuir un incumplimiento.
                Para Incumple, proponé pasos manuales y una comprobación posterior.
                No agregues normas, enlaces, medidas ni excepciones ausentes en la ficha.
                No inventes datos del documento, no recomiendes eludir el bloqueo y no certifiques cumplimiento.
                """,
            input = $"Regla {request.RuleId}. Estado: {(request.Status == "fail" ? "Incumple" : "Pendiente")}. Ficha: {rule}"
        });

        try
        {
            using var response = await clients.CreateClient("fiscal-advice").SendAsync(message, cancellationToken);
            if (!response.IsSuccessStatusCode) return StatusCode(503);
            await using var body = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var json = await JsonDocument.ParseAsync(body, cancellationToken: cancellationToken);
            var explanation = ReadExplanation(json.RootElement);
            return explanation is null ? StatusCode(503) : Ok(new { explanation });
        }
        catch (Exception error) when (error is HttpRequestException or JsonException or IOException ||
            error is OperationCanceledException && !cancellationToken.IsCancellationRequested)
        {
            return StatusCode(503);
        }
    }

    private static string? ReadExplanation(JsonElement response)
    {
        if (!PropertyIs(response, "status", "completed") ||
            !response.TryGetProperty("output", out var output) || output.ValueKind != JsonValueKind.Array)
            return null;
        var paragraphs = new List<string>();
        foreach (var item in output.EnumerateArray())
        {
            if (!PropertyIs(item, "type", "message") || !item.TryGetProperty("content", out var content) ||
                content.ValueKind != JsonValueKind.Array) continue;
            foreach (var part in content.EnumerateArray())
            {
                if (PropertyIs(part, "type", "refusal")) return null;
                if (PropertyIs(part, "type", "output_text") && part.TryGetProperty("text", out var text) &&
                    text.ValueKind == JsonValueKind.String && text.GetString()?.Trim() is { Length: > 0 } paragraph)
                    paragraphs.Add(paragraph);
            }
        }
        var explanation = string.Join("\n", paragraphs);
        return explanation.Length is > 0 and <= 1200 ? explanation : null;
    }

    private static bool PropertyIs(JsonElement element, string key, string value) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(key, out var property) &&
        property.ValueKind == JsonValueKind.String && property.GetString() == value;
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AdviceRequest(
    [property: JsonPropertyName("ruleId")] string? RuleId,
    [property: JsonPropertyName("status")] string? Status);
