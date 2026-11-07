using System.Data;
using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Common;
using ReportDesigner.Application.Invoices;
using ReportDesigner.Infrastructure.Persistence;

namespace ReportDesigner.Infrastructure.Invoices;

// Candidate reader for A2. Deliberately not registered as IInvoiceQueries.
public sealed class PostgresInvoiceDataSource(ReportDesignerDbContext db, ICompanyContext company)
{
    public async Task<InvoiceDataSource> LoadAsync(Guid id, CancellationToken cancellationToken = default)
    {
        // Header, lines and taxes must come from one consistent view of the invoice.
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, cancellationToken);
        var header = await db.Database.SqlQuery<InvoiceDataHeader>($"""
            SELECT
            t.nombre AS "TypeNombre",
            t.opera_contado AS "OperaContado",
            i.serie AS "Serie",
            i.numero AS "Numero",
            i.cae_identificador AS "CaeIdentificador",
            i.cae_desde AS "CaeDesde",
            i.cae_hasta AS "CaeHasta",
            i.cae_fecha_vto AS "CaeFechaVto",
            i.fecha AS "Fecha",
            EXTRACT(timezone FROM i.fecha)::int AS "FechaOffsetSeconds",
            i.comentario AS "Comentario",
            i.tipo_cambio AS "TipoCambio",
            i.porcentaje_desc_global AS "PorcentajeDescGlobal",
            i.direccion_factura AS "DireccionFactura",
            c.parametros::text AS "Parametros",
            b.direccion AS "BranchDireccion",
            c.nombre AS "CompanyNombre",
            c.nombre_comercial AS "CompanyNombreComercial",
            c.rut AS "CompanyRut",
            c.direccion AS "CompanyDireccion",
            c.ciudad AS "CompanyCiudad",
            c.logo_url AS "LogoUrl",
            cur.iso4217 AS "CurrencyCode",
            cur.simbolo AS "CurrencySymbol",
            i.contact_id IS NOT NULL AS "HasContacto",
            co.guardar_como AS "ContactNombre",
            co.direccion AS "ContactDireccion",
            i.cfe_cod_seguridad AS "CfeCodSeguridad",
            i.cfe_adenda AS "CfeAdenda",
            i.subtotal AS "Subtotal",
            i.total AS "Total",
            i.redondeo AS "Redondeo",
            i.monto_dto_global AS "MontoDtoGlobal",
            t.es_cfe AS "EsCfe",
            i.is_consumo_final AS "IsConsumoFinal",
            i.is_imp_incluidos AS "IsImpIncluidos"
            FROM invoices i
            JOIN companies c ON c.id=i.company_id
            JOIN invoice_types t ON t.id=i.type_id
            JOIN currencies cur ON cur.id=i.currency_id
            LEFT JOIN contacts co ON co.id=i.contact_id
            LEFT JOIN branches b ON b.id=i.branch_id
            WHERE i.id={id} AND i.company_id={company.CompanyId}
              AND (co.id IS NULL OR co.company_id=i.company_id)
              AND (b.id IS NULL OR b.company_id=i.company_id)
              AND t.company_id=i.company_id
            """).SingleOrDefaultAsync(cancellationToken);
        if (header is null) throw new InvoiceNotFoundException("Invoice not found");
        var lines = await db.Database.SqlQuery<InvoiceDataLine>($"""
            SELECT articulo_codigo AS "Codigo", articulo_nombre AS "Nombre", cantidad AS "Cantidad",
                   precio_unitario AS "PrecioUnitario", precio_unitario_neto AS "PrecioUnitarioNeto",
                   descuento AS "Descuento", subtotal AS "SubTotal"
            FROM invoice_lines WHERE invoice_id={id} ORDER BY linea_nro
            """).ToListAsync(cancellationToken);
        // No order is specified by the original function for taxes; do not invent one.
        var taxes = await db.Database.SqlQuery<InvoiceDataTax>($"""
            SELECT nombre AS "Nombre", valor AS "Valor" FROM invoice_taxes WHERE invoice_id={id}
            """).ToListAsync(cancellationToken);
        await tx.CommitAsync(cancellationToken);
        return new InvoiceDataSource(header, lines, taxes);
    }
}
