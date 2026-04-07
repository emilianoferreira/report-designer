/**
 * Sample Invoice Data
 * Based on the real Zureo ERP invoice structure.
 * Used for preview rendering in the designer.
 */
import { InvoiceData } from '../../../core/models/template.model';

/**
 * Sample invoice matching the Zureo ERP data model.
 * This mirrors the structure used by z-code directives:
 *   comp.*, CFE.*, Moneda.*, Contacto.*, Articulos[], etc.
 */
export const SAMPLE_INVOICE_DATA: InvoiceData = {
  invoice: {
    // ─── Comprobante (comp) ───
    Tipo: {
      Nombre: 'Venta Contado',
      Clasificacion: {
        OperaContado: true
      }
    },
    Numero: {
      Serie: 'A',
      Numero: '16',
      CAEIdentificador: '',
      CAEDesde: '',
      CAEHasta: '',
      CAEFechaVto: ''
    },
    Fecha: '2026-02-25T17:39:00.000Z',
    Comentario: '',
    TipoCambio: 1,
    PorcentajeDescGlobal: 0,
    DireccionFactura: {
      Domicilio: ''
    },
    Empresa: {
      Parametros: {
        EFA_Emisor_Nombre: 'Mi Empresa S.A.',
        EFA_Emisor_NComercial: 'Mi Empresa',
        EFA_Emisor_RUT: '21-123456-0012',
        EFA_Emisor_Direccion: 'Av. 18 de Julio 1234',
        EFA_Emisor_Ciudad: 'Montevideo',
        EFA_Resolucion: ''
      }
    },
    Sucursal: {
      Direccion: ''
    }
  },

  invoiceLines: [
    {
      Articulo: {
        Codigo: 'Art1',
        Nombre: 'Articulo 1'
      },
      Cantidad: 1,
      PrecioUnitario: 122.00,
      PrecioUnitarioNeto: 100.00,
      Descuento: 0,
      SubTotal: 122.00,
      ImpuestoIncluido: true,
      FechaArticulo: '2025-09-17T00:00:00.000Z'
    }
  ],

  company: {
    Nombre: 'Mi Empresa S.A.',
    NombreComercial: 'Mi Empresa',
    RUT: '21-123456-0012',
    Direccion: 'Av. 18 de Julio 1234',
    Ciudad: 'Montevideo',
    logoUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCAxMDAgNDAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNDAiIGZpbGw9IiMzMzY2Y2MiIHJ4PSI0Ii8+PHRleHQgeD0iNTAiIHk9IjI1IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+TE9HTzwvdGV4dD48L3N2Zz4='
  },

  // ─── Contexto adicional Zureo ───
  Moneda: {
    ISO4217: 'UYU',
    Simbolo: '$'
  },

  Contacto: {
    GuardarComo: ''
  },

  CFE: {
    TipoComprobanteFiscal: {
      Nombre: ''
    },
    CodSeguridad: '',
    Adenda: ''
  },

  // ─── Flags de contexto ───
  isCFE: false,
  isConsumoFinal: true,
  isImpIncluidos: true,
  hasContacto: false,
  hasDtoGlobal: false,
  hasRedondeo: false,
  logoBase64: '',
  QRBase64: '',

  // ─── Valores calculados ───
  Subtotal: 100.00,
  Total: 122.00,
  Redondeo: 0,
  MontoDtoGlobal: 0,
  Impuestos: [
    { Nombre: 'IVA Tasa Básica', Valor: 22.00 }
  ],
  SubtotalesDesglosados: [],
  Articulos: [
    {
      Articulo: {
        Codigo: 'Art1',
        Nombre: 'Articulo 1'
      },
      Cantidad: 1,
      PrecioUnitario: 122.00,
      PrecioUnitarioNeto: 100.00,
      Descuento: 0,
      SubTotal: 122.00,
      FechaArticulo: '2025-09-17T00:00:00.000Z'
    }
  ]
};

/**
 * Sample with multiple invoice lines for testing detail section pagination
 */
export const SAMPLE_INVOICE_MULTILINE: InvoiceData = {
  ...SAMPLE_INVOICE_DATA,
  invoiceLines: [
    { Articulo: { Codigo: 'ART001', Nombre: 'Producto Alpha' }, Cantidad: 2, PrecioUnitario: 150.00, PrecioUnitarioNeto: 123.97, Descuento: 0, SubTotal: 300.00, FechaArticulo: '2025-08-10T00:00:00.000Z' },
    { Articulo: { Codigo: 'ART002', Nombre: 'Producto Beta' }, Cantidad: 5, PrecioUnitario: 80.00, PrecioUnitarioNeto: 66.12, Descuento: 10, SubTotal: 360.00, FechaArticulo: '2025-09-05T00:00:00.000Z' },
    { Articulo: { Codigo: 'ART003', Nombre: 'Servicio Consultoría' }, Cantidad: 1, PrecioUnitario: 2500.00, PrecioUnitarioNeto: 2066.12, Descuento: 0, SubTotal: 2500.00, FechaArticulo: '2025-09-17T00:00:00.000Z' },
    { Articulo: { Codigo: 'ART004', Nombre: 'Licencia Software Anual' }, Cantidad: 1, PrecioUnitario: 4800.00, PrecioUnitarioNeto: 3966.94, Descuento: 5, SubTotal: 4560.00, FechaArticulo: '2025-10-01T00:00:00.000Z' },
    { Articulo: { Codigo: 'ART005', Nombre: 'Soporte Técnico Mensual' }, Cantidad: 3, PrecioUnitario: 600.00, PrecioUnitarioNeto: 495.87, Descuento: 0, SubTotal: 1800.00, FechaArticulo: '2025-10-15T00:00:00.000Z' },
  ],
  Articulos: [
    { Articulo: { Codigo: 'ART001', Nombre: 'Producto Alpha' }, Cantidad: 2, PrecioUnitario: 150.00, PrecioUnitarioNeto: 123.97, Descuento: 0, SubTotal: 300.00, FechaArticulo: '2025-08-10T00:00:00.000Z' },
    { Articulo: { Codigo: 'ART002', Nombre: 'Producto Beta' }, Cantidad: 5, PrecioUnitario: 80.00, PrecioUnitarioNeto: 66.12, Descuento: 10, SubTotal: 360.00, FechaArticulo: '2025-09-05T00:00:00.000Z' },
    { Articulo: { Codigo: 'ART003', Nombre: 'Servicio Consultoría' }, Cantidad: 1, PrecioUnitario: 2500.00, PrecioUnitarioNeto: 2066.12, Descuento: 0, SubTotal: 2500.00, FechaArticulo: '2025-09-17T00:00:00.000Z' },
    { Articulo: { Codigo: 'ART004', Nombre: 'Licencia Software Anual' }, Cantidad: 1, PrecioUnitario: 4800.00, PrecioUnitarioNeto: 3966.94, Descuento: 5, SubTotal: 4560.00, FechaArticulo: '2025-10-01T00:00:00.000Z' },
    { Articulo: { Codigo: 'ART005', Nombre: 'Soporte Técnico Mensual' }, Cantidad: 3, PrecioUnitario: 600.00, PrecioUnitarioNeto: 495.87, Descuento: 0, SubTotal: 1800.00, FechaArticulo: '2025-10-15T00:00:00.000Z' },
  ],
  Subtotal: 7851.24,
  Total: 9520.00,
  Impuestos: [
    { Nombre: 'IVA Tasa Básica', Valor: 1548.76 },
    { Nombre: 'IVA Tasa Mínima', Valor: 120.00 }
  ]
};
