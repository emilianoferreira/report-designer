namespace ReportDesigner.Application.Invoices;

public sealed class InvoiceDataHeader
{
    public string TypeNombre { get; init; } = "";
    public bool? OperaContado { get; init; }
    public string? Serie { get; init; }
    public int Numero { get; init; }
    public string? CaeIdentificador { get; init; }
    public string? CaeDesde { get; init; }
    public string? CaeHasta { get; init; }
    public DateOnly? CaeFechaVto { get; init; }
    public DateTime Fecha { get; init; }
    public int FechaOffsetSeconds { get; init; }
    public string? Comentario { get; init; }
    public decimal? TipoCambio { get; init; }
    public decimal? PorcentajeDescGlobal { get; init; }
    public string? DireccionFactura { get; init; }
    public string? Parametros { get; init; }
    public string? BranchDireccion { get; init; }
    public string CompanyNombre { get; init; } = "";
    public string? CompanyNombreComercial { get; init; }
    public string CompanyRut { get; init; } = "";
    public string? CompanyDireccion { get; init; }
    public string? CompanyCiudad { get; init; }
    public string? LogoUrl { get; init; }
    public string CurrencyCode { get; init; } = "";
    public string CurrencySymbol { get; init; } = "";
    public bool HasContacto { get; init; }
    public string? ContactNombre { get; init; }
    public string? ContactDireccion { get; init; }
    public string? CfeCodSeguridad { get; init; }
    public string? CfeAdenda { get; init; }
    public decimal? Subtotal { get; init; }
    public decimal? Total { get; init; }
    public decimal? Redondeo { get; init; }
    public decimal? MontoDtoGlobal { get; init; }
    public bool? EsCfe { get; init; }
    public bool? IsConsumoFinal { get; init; }
    public bool? IsImpIncluidos { get; init; }
}
