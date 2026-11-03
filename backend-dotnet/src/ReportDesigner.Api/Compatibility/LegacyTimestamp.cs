using System.Globalization;

namespace ReportDesigner.Api.Compatibility;

internal static class LegacyTimestamp
{
    // JavaScript Date.toJSON emits UTC milliseconds, truncating PostgreSQL microseconds.
    public static string? Format(DateTime? value) => value?.ToUniversalTime()
        .ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
}
