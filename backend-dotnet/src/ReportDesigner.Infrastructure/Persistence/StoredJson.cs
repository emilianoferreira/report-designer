using System.Globalization;
using System.Numerics;
using System.Text;
using System.Text.Json;

namespace ReportDesigner.Infrastructure.Persistence;

// JSONB's value semantics without MySQL's double-based JSON parser.
internal static class StoredJson
{
    // jsonb_populate_record converts non-string JSON values to PostgreSQL's JSON text for text columns.
    public static string? AsText(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null => null,
        JsonValueKind.String => Text(value.GetString()!),
        JsonValueKind.Number => NumberText(value.GetRawText()),
        JsonValueKind.Array => "[" + string.Join(", ", value.EnumerateArray().Select(JsonText)) + "]",
        JsonValueKind.Object => "{" + string.Join(", ", value.EnumerateObject().GroupBy(p => p.Name).Select(g => g.Last())
            .OrderBy(p => Encoding.UTF8.GetByteCount(p.Name)).ThenBy(p => p.Name, StringComparer.Ordinal)
            .Select(p => JsonSerializer.Serialize(p.Name, TextOptions) + ": " + JsonText(p.Value))) + "}",
        _ => value.GetRawText()
    };
    private static readonly JsonSerializerOptions TextOptions = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    private static string JsonText(JsonElement value) => value.ValueKind == JsonValueKind.String ? JsonSerializer.Serialize(value.GetString(), TextOptions) : AsText(value) ?? "null";
    private static string NumberText(string value)
    {
        var parts = value.ToLowerInvariant().Split('e'); var exponent = parts.Length == 2 ? int.Parse(parts[1], CultureInfo.InvariantCulture) : 0;
        var point = parts[0].IndexOf('.'); var scale = Math.Max(0, checked((point < 0 ? 0 : parts[0].Length - point - 1) - exponent));
        if (scale > 16383 || Math.Abs((long)exponent) > 131072) throw new InvalidOperationException("Numeric range exceeded.");
        var negative = parts[0].StartsWith('-'); var digits = parts[0].TrimStart('-').Replace(".", "").TrimStart('0');
        if (exponent > (point < 0 ? 0 : parts[0].Length - point - 1)) digits += new string('0', exponent - (point < 0 ? 0 : parts[0].Length - point - 1));
        digits = digits.TrimStart('0').PadLeft(scale + 1, '0');
        var result = scale == 0 ? digits : digits.Insert(digits.Length - scale, ".");
        return negative && digits.Any(c => c != '0') ? "-" + result : result;
    }
    public static JsonElement Parse(string value) { using var doc = JsonDocument.Parse(value); return doc.RootElement.Clone(); }
    public static string Normalize(JsonElement value)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) Write(writer, value);
        return Encoding.UTF8.GetString(stream.ToArray());
    }
    private static string Text(string value) => value.Contains('\0') ? throw new InvalidOperationException("JSON contains a zero character.") : value;
    private static void Write(Utf8JsonWriter writer, JsonElement value)
    {
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                var fields = new SortedDictionary<string, JsonElement>(StringComparer.Ordinal);
                foreach (var property in value.EnumerateObject()) fields[Text(property.Name)] = property.Value;
                writer.WriteStartObject();
                foreach (var field in fields) { writer.WritePropertyName(field.Key); Write(writer, field.Value); }
                writer.WriteEndObject(); break;
            case JsonValueKind.Array:
                writer.WriteStartArray(); foreach (var element in value.EnumerateArray()) Write(writer, element); writer.WriteEndArray(); break;
            case JsonValueKind.String: writer.WriteStringValue(Text(value.GetString()!)); break;
            case JsonValueKind.Number:
                var raw = value.GetRawText().ToLowerInvariant().Split('e');
                var exponent = raw.Length == 2 ? int.Parse(raw[1], CultureInfo.InvariantCulture) : 0;
                var point = raw[0].IndexOf('.'); if (point >= 0) exponent = checked(exponent - (raw[0].Length - point - 1));
                var digits = raw[0].Replace(".", "");
                var number = BigInteger.Parse(digits, CultureInfo.InvariantCulture);
                // PostgreSQL numeric limits; trailing fractional zeros count toward its scale.
                if (exponent < -16383 || (long)digits.TrimStart('-','0').Length + exponent > 131072) throw new InvalidOperationException("JSON numeric range exceeded.");
                if (number.IsZero) { writer.WriteNumberValue(0); break; }
                while (number % 10 == 0) { number /= 10; exponent++; }
                writer.WriteRawValue(number.ToString(CultureInfo.InvariantCulture) + "e" + exponent.ToString(CultureInfo.InvariantCulture)); break;
            case JsonValueKind.Null: writer.WriteNullValue(); break;
            case JsonValueKind.True: writer.WriteBooleanValue(true); break;
            case JsonValueKind.False: writer.WriteBooleanValue(false); break;
            default: throw new InvalidOperationException("Missing JSON value.");
        }
    }
}
