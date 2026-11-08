using System.Globalization;
using System.Text.Json;

namespace ReportDesigner.Application.Invoices;

// Independent of persistence and HTTP; shared by the PostgreSQL comparison and MySQL adapter.
public sealed class InvoiceDataBuilder
{
    public JsonElement Build(InvoiceDataSource source, TimeZoneInfo? timeZone = null)
    {
        var h = source.Header;
        var lines = source.Lines.Select(l => new {
            Articulo = new { Codigo = l.Codigo, Nombre = l.Nombre },
            l.Cantidad, l.PrecioUnitario, l.PrecioUnitarioNeto, l.Descuento, l.SubTotal
        }).ToArray();
        return JsonSerializer.SerializeToElement(new {
            invoice = new {
                Tipo = new { Nombre = h.TypeNombre, Clasificacion = new { OperaContado = h.OperaContado } },
                Numero = new { h.Serie, Numero = h.Numero.ToString(CultureInfo.InvariantCulture),
                    CAEIdentificador = h.CaeIdentificador ?? "", CAEDesde = h.CaeDesde ?? "",
                    CAEHasta = h.CaeHasta ?? "", CAEFechaVto = h.CaeFechaVto?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "" },
                Fecha = FormatTimestamp(h.Fecha, timeZone is null ? h.FechaOffsetSeconds : checked((int)timeZone.GetUtcOffset(DateTime.SpecifyKind(h.Fecha, DateTimeKind.Utc)).TotalSeconds)),
                Comentario = h.Comentario ?? "", h.TipoCambio, h.PorcentajeDescGlobal,
                DireccionFactura = new { Domicilio = h.DireccionFactura ?? h.ContactDireccion ?? "" },
                Empresa = new { Parametros = h.Parametros is null ? (JsonElement?)null : Parse(h.Parametros) },
                Sucursal = new { Direccion = h.BranchDireccion ?? "" }
            },
            invoiceLines = lines,
            company = new { Nombre = h.CompanyNombre, NombreComercial = h.CompanyNombreComercial,
                RUT = h.CompanyRut, Direccion = h.CompanyDireccion, Ciudad = h.CompanyCiudad, logoUrl = h.LogoUrl ?? "" },
            Moneda = new { ISO4217 = h.CurrencyCode, Simbolo = h.CurrencySymbol },
            Contacto = new { GuardarComo = h.HasContacto ? h.ContactNombre : "" },
            CFE = new { TipoComprobanteFiscal = new { Nombre = "" }, CodSeguridad = h.CfeCodSeguridad ?? "", Adenda = h.CfeAdenda ?? "" },
            Articulos = lines,
            Impuestos = source.Taxes.Select(t => new { t.Nombre, t.Valor }).ToArray(),
            SubtotalesDesglosados = Array.Empty<object>(),
            h.Subtotal, h.Total, h.Redondeo, h.MontoDtoGlobal,
            isCFE = h.EsCfe, isConsumoFinal = h.IsConsumoFinal, isImpIncluidos = h.IsImpIncluidos,
            hasContacto = h.HasContacto,
            hasDtoGlobal = h.PorcentajeDescGlobal is null ? (bool?)null : h.PorcentajeDescGlobal > 0,
            hasRedondeo = h.Redondeo is null ? (bool?)null : h.Redondeo != 0,
            logoBase64 = "", QRBase64 = ""
        });
    }

    private static JsonElement Parse(string json) { using var doc = JsonDocument.Parse(json); return doc.RootElement.Clone(); }

    // PostgreSQL JSON uses trimmed microseconds and an explicit session offset, including +00:00.
    private static string FormatTimestamp(DateTime utc, int offsetSeconds)
    {
        var local = utc.AddSeconds(offsetSeconds);
        var text = local.ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
        var fraction = (local.Ticks % TimeSpan.TicksPerSecond / 10).ToString("D6", CultureInfo.InvariantCulture).TrimEnd('0');
        if (fraction.Length > 0) text += "." + fraction;
        var offset = Math.Abs(offsetSeconds);
        return text + (offsetSeconds < 0 ? "-" : "+") + (offset / 3600).ToString("D2", CultureInfo.InvariantCulture)
            + ":" + (offset % 3600 / 60).ToString("D2", CultureInfo.InvariantCulture)
            + (offset % 60 == 0 ? "" : ":" + (offset % 60).ToString("D2", CultureInfo.InvariantCulture));
    }
}

public sealed record InvoiceDataSource(InvoiceDataHeader Header, IReadOnlyList<InvoiceDataLine> Lines, IReadOnlyList<InvoiceDataTax> Taxes);

public sealed class InvoiceDataLine
{
    public string? Codigo { get; init; }
    public string? Nombre { get; init; }
    public decimal? Cantidad { get; init; }
    public decimal? PrecioUnitario { get; init; }
    public decimal? PrecioUnitarioNeto { get; init; }
    public decimal? Descuento { get; init; }
    public decimal? SubTotal { get; init; }
}

public sealed class InvoiceDataTax
{
    public string Nombre { get; init; } = "";
    public decimal? Valor { get; init; }
}
