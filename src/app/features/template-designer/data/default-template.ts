/**
 * Default Invoice Template
 * Pre-built template matching the Zureo ERP invoice PDF layout.
 * This is what the user sees when opening the designer for the first time.
 *
 * Layout based on the real Zureo invoice:
 *   - Header: Logo, company data, invoice type/number, client info, date
 *   - Detail: Article table headers (columns rendered by the engine)
 *   - Footer: Subtotals, taxes, total, comments
 *
 * All positions in millimeters. A4 = 210x297mm, margins 10mm each side.
 * Usable area: 190mm wide x 277mm tall.
 */
import { ReportTemplate } from '../../../core/models/template.model';
import { v4 as uuid } from 'uuid';

/**
 * Generate a fresh default template with unique IDs
 */
export function createDefaultTemplate(): ReportTemplate {
  return {
    schemaVersion: '1.0',
    metadata: {
      id: uuid(),
      name: 'Factura Estándar',
      description: 'Plantilla de factura estándar basada en el formato Zureo ERP',
      version: 1,
      author: 'Sistema',
      companyId: 'default',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['factura', 'estándar'],
      status: 'draft'
    },
    page: {
      paperType: 'a4',
      width: 210,
      height: 297,
      dynamicHeight: false,
      margins: { top: 10, right: 10, bottom: 10, left: 10 },
      orientation: 'portrait',
      defaultFont: {
        family: 'Arial',
        size: 10,
        weight: 'normal',
        style: 'normal',
        color: '#000000'
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // SECTIONS
    // ═══════════════════════════════════════════════════════════════
    sections: {
      // ─── HEADER: 85mm ───
      header: {
        height: 85,
        elements: [

          // ── Logo (arriba izquierda) ──
          {
            id: uuid(),
            type: 'image' as const,
            name: 'Logo Empresa',
            position: { x: 0, y: 0 },
            size: { width: 55, height: 25 },
            style: {},
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 1,
            printOnly: false,
            screenOnly: false,
            source: {
              type: 'dataField' as const,
              binding: 'company.logoUrl'
            },
            fit: 'contain' as const
          },

          // ── RUT Empresa (arriba derecha) ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'RUT Empresa',
            position: { x: 120, y: 0 },
            size: { width: 70, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Empresa.Parametros.EFA_Emisor_RUT',
              defaultValue: 'RUT: '
            }
          },

          // ── Tipo Comprobante (derecha, negrita) ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Tipo Comprobante',
            position: { x: 120, y: 7 },
            size: { width: 70, height: 7 },
            style: {
              font: { family: 'Arial', size: 12, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Tipo.Nombre',
              defaultValue: 'Venta Contado'
            }
          },

          // ── Número de comprobante ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Número',
            position: { x: 120, y: 15 },
            size: { width: 70, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Numero.Numero',
              defaultValue: 'A-16'
            }
          },

          // ── Forma de Pago ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label Forma Pago',
            position: { x: 120, y: 22 },
            size: { width: 35, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'Forma de Pago:'
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Forma Pago Valor',
            position: { x: 156, y: 22 },
            size: { width: 34, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Tipo.Clasificacion.OperaContado',
              defaultValue: 'Contado'
            }
          },

          // ── Recuadro Identificador (CONSUMIDOR FINAL) ──
          {
            id: uuid(),
            type: 'rectangle' as const,
            name: 'Recuadro Identificador',
            shapeType: 'rectangle' as const,
            position: { x: 125, y: 30 },
            size: { width: 65, height: 12 },
            style: {},
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 1,
            printOnly: false,
            screenOnly: false,
            strokeColor: '#000000',
            strokeWidth: 0.3,
            strokeStyle: 'solid' as const
          },
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Identificador Texto',
            position: { x: 126, y: 31 },
            size: { width: 63, height: 10 },
            style: {
              font: { family: 'Arial', size: 11, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'center' as const,
              verticalAlign: 'middle' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 3,
            printOnly: false,
            screenOnly: false,
            content: 'CONSUMIDOR FINAL'
          },

          // ── Nombre Empresa (izquierda, segunda fila) ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Nombre Empresa',
            position: { x: 0, y: 28 },
            size: { width: 65, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Empresa.Parametros.EFA_Emisor_Nombre',
              defaultValue: 'Mi Empresa S.A.'
            }
          },

          // ── Nombre Comercial ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Nombre Comercial',
            position: { x: 0, y: 34 },
            size: { width: 65, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Empresa.Parametros.EFA_Emisor_NComercial',
              defaultValue: 'Mi Empresa'
            }
          },

          // ── Dirección Empresa ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Dirección Empresa',
            position: { x: 0, y: 40 },
            size: { width: 65, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Empresa.Parametros.EFA_Emisor_Direccion',
              defaultValue: 'Av. 18 de Julio 1234'
            }
          },

          // ── Ciudad Empresa ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Ciudad Empresa',
            position: { x: 0, y: 46 },
            size: { width: 65, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Empresa.Parametros.EFA_Emisor_Ciudad',
              defaultValue: 'Montevideo'
            }
          },

          // ── Cliente (derecha, segunda mitad) ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label Cliente',
            position: { x: 120, y: 46 },
            size: { width: 20, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'Cliente:'
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Nombre Cliente',
            position: { x: 141, y: 46 },
            size: { width: 49, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'Contacto.GuardarComo',
              defaultValue: ''
            }
          },

          // ── Dirección Cliente ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label Dirección',
            position: { x: 112, y: 52 },
            size: { width: 28, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'Dirección:'
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Dirección Cliente',
            position: { x: 141, y: 52 },
            size: { width: 49, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.DireccionFactura.Domicilio',
              defaultValue: ''
            }
          },

          // ── Fecha y Hora (labels) ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label Fecha',
            position: { x: 130, y: 62 },
            size: { width: 28, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'center' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'Fecha'
          },
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label Hora',
            position: { x: 162, y: 62 },
            size: { width: 28, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'center' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'Hora'
          },

          // ── Fecha valor ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Fecha Valor',
            position: { x: 130, y: 68 },
            size: { width: 28, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'center' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Fecha',
              format: { type: 'date' as const, pattern: 'dd/MM/yyyy' }
            }
          },

          // ── Hora valor ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Hora Valor',
            position: { x: 162, y: 68 },
            size: { width: 28, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'center' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Fecha',
              format: { type: 'date' as const, pattern: 'HH:mm' }
            }
          },

          // ── Línea separadora inferior del header ──
          {
            id: uuid(),
            type: 'line' as const,
            name: 'Línea Header',
            position: { x: 0, y: 78 },
            size: { width: 190, height: 0 },
            style: {},
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 1,
            printOnly: false,
            screenOnly: false,
            direction: 'horizontal' as const,
            lineStyle: { width: 0.3, style: 'solid' as const, color: '#b1b1b1' }
          }
        ],
        printOnFirstPage: true,
        printOnLastPage: true,
        printOnEveryPage: false
      },

      // ─── DETAIL: 160mm ───
      detail: {
        height: 160,
        elements: [
          // ── Encabezados de columna ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Col Código',
            position: { x: 0, y: 0 },
            size: { width: 34, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'CÓDIGO'
          },
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Col Descripción',
            position: { x: 34, y: 0 },
            size: { width: 67, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'DESCRIPCIÓN'
          },
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Col Cantidad',
            position: { x: 101, y: 0 },
            size: { width: 18, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'center' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'CANT.'
          },
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Col Unitario',
            position: { x: 119, y: 0 },
            size: { width: 26, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'UNITARIO'
          },
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Col Descuento',
            position: { x: 145, y: 0 },
            size: { width: 18, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'DESC'
          },
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Col Importe',
            position: { x: 163, y: 0 },
            size: { width: 27, height: 6 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'IMPORTE'
          },

          // ── Línea bajo encabezados de columna ──
          {
            id: uuid(),
            type: 'line' as const,
            name: 'Línea Columnas',
            position: { x: 0, y: 7 },
            size: { width: 190, height: 0 },
            style: {},
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 1,
            printOnly: false,
            screenOnly: false,
            direction: 'horizontal' as const,
            lineStyle: { width: 0.5, style: 'solid' as const, color: '#b1b1b1' }
          },

          // ── Campos de datos de artículo (fila de datos) ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Dato Código',
            position: { x: 0, y: 8 },
            size: { width: 34, height: 6 },
            style: {
              font: { family: 'Arial', size: 9, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: { source: 'Articulo.Codigo' }
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Dato Descripción',
            position: { x: 34, y: 8 },
            size: { width: 67, height: 6 },
            style: {
              font: { family: 'Arial', size: 9, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: { source: 'Articulo.Nombre' }
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Dato Cantidad',
            position: { x: 101, y: 8 },
            size: { width: 18, height: 6 },
            style: {
              font: { family: 'Arial', size: 9, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'center' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: { source: 'Cantidad', format: { type: 'number' as const, decimals: 0 } }
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Dato Unitario',
            position: { x: 119, y: 8 },
            size: { width: 26, height: 6 },
            style: {
              font: { family: 'Arial', size: 9, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: { source: 'PrecioUnitario', format: { type: 'number' as const, decimals: 2 } }
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Dato Descuento',
            position: { x: 145, y: 8 },
            size: { width: 18, height: 6 },
            style: {
              font: { family: 'Arial', size: 9, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: { source: 'Descuento', format: { type: 'percentage' as const, decimals: 0 } }
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Dato Importe',
            position: { x: 163, y: 8 },
            size: { width: 27, height: 6 },
            style: {
              font: { family: 'Arial', size: 9, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: { source: 'SubTotal', format: { type: 'number' as const, decimals: 2 } }
          }
        ],
        printOnFirstPage: true,
        printOnLastPage: true,
        printOnEveryPage: false,
        dataSource: 'invoiceLines',
        rowHeight: 8,
        autoGrow: false,
        showGridLines: true,
        gridLineColor: '#e8e8e8',
        gridLineWidth: 0.15
      },

      // ─── FOOTER: 52mm ───
      footer: {
        height: 52,
        elements: [
          // ── Moneda ──
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Moneda',
            position: { x: 0, y: 0 },
            size: { width: 40, height: 5 },
            style: {
              font: { family: 'Arial', size: 9, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'Moneda.ISO4217',
              defaultValue: 'UYU'
            }
          },

          // ── Subtotal ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label Subtotal',
            position: { x: 120, y: 0 },
            size: { width: 35, height: 5 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'Subtotal:'
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Subtotal Valor',
            position: { x: 156, y: 0 },
            size: { width: 34, height: 5 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'Subtotal',
              format: { type: 'number' as const, decimals: 2 }
            }
          },

          // ── IVA ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label IVA',
            position: { x: 105, y: 6 },
            size: { width: 50, height: 5 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'IVA Tasa Básica :'
          },
          {
            id: uuid(),
            type: 'formula' as const,
            name: 'IVA Valor',
            position: { x: 156, y: 6 },
            size: { width: 34, height: 5 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            expression: 'Impuestos && Impuestos.length > 0 ? Impuestos[0].Valor : 0',
            format: { type: 'number' as const, decimals: 2 }
          },

          // ── Línea sobre Total ──
          {
            id: uuid(),
            type: 'line' as const,
            name: 'Línea Total',
            position: { x: 120, y: 12 },
            size: { width: 70, height: 0 },
            style: {},
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 1,
            printOnly: false,
            screenOnly: false,
            direction: 'horizontal' as const,
            lineStyle: { width: 0.5, style: 'solid' as const, color: '#333333' }
          },

          // ── Total ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label Total',
            position: { x: 120, y: 14 },
            size: { width: 35, height: 7 },
            style: {
              font: { family: 'Arial', size: 12, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'Total:'
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Total Valor',
            position: { x: 156, y: 14 },
            size: { width: 34, height: 7 },
            style: {
              font: { family: 'Arial', size: 12, weight: 'bold' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'right' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'Total',
              format: { type: 'currency' as const, currencyCode: 'UYU', decimals: 2 }
            }
          },

          // ── Línea sobre Comentario ──
          {
            id: uuid(),
            type: 'line' as const,
            name: 'Línea Comentario Top',
            position: { x: 0, y: 26 },
            size: { width: 190, height: 0 },
            style: {},
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 1,
            printOnly: false,
            screenOnly: false,
            direction: 'horizontal' as const,
            lineStyle: { width: 0.3, style: 'solid' as const, color: '#b1b1b1' }
          },

          // ── Comentario ──
          {
            id: uuid(),
            type: 'text' as const,
            name: 'Label Comentario',
            position: { x: 0, y: 28 },
            size: { width: 30, height: 5 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            content: 'Comentario:'
          },
          {
            id: uuid(),
            type: 'dataField' as const,
            name: 'Comentario Valor',
            position: { x: 0, y: 34 },
            size: { width: 190, height: 10 },
            style: {
              font: { family: 'Arial', size: 10, weight: 'normal' as const, style: 'normal' as const, color: '#000000' },
              textAlign: 'left' as const,
              overflow: 'hidden' as const
            },
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 2,
            printOnly: false,
            screenOnly: false,
            binding: {
              source: 'invoice.Comentario',
              defaultValue: ''
            }
          },

          // ── Línea bajo Comentario ──
          {
            id: uuid(),
            type: 'line' as const,
            name: 'Línea Comentario Bottom',
            position: { x: 0, y: 46 },
            size: { width: 190, height: 0 },
            style: {},
            visibility: { type: 'always' as const },
            locked: false,
            zIndex: 1,
            printOnly: false,
            screenOnly: false,
            direction: 'horizontal' as const,
            lineStyle: { width: 0.3, style: 'solid' as const, color: '#b1b1b1' }
          }
        ],
        printOnFirstPage: true,
        printOnLastPage: true,
        printOnEveryPage: true
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // DATA SOURCES
    // ═══════════════════════════════════════════════════════════════
    dataSources: {
      primary: {
        entity: 'invoice',
        fields: [
          { key: 'tipoNombre', path: 'invoice.Tipo.Nombre', label: 'Tipo Comprobante', dataType: 'string', category: 'Comprobante' },
          { key: 'numero', path: 'invoice.Numero.Numero', label: 'Número', dataType: 'string', category: 'Comprobante' },
          { key: 'serie', path: 'invoice.Numero.Serie', label: 'Serie', dataType: 'string', category: 'Comprobante' },
          { key: 'fecha', path: 'invoice.Fecha', label: 'Fecha', dataType: 'date', category: 'Comprobante' },
          { key: 'comentario', path: 'invoice.Comentario', label: 'Comentario', dataType: 'string', category: 'Comprobante' },
          { key: 'empresaNombre', path: 'invoice.Empresa.Parametros.EFA_Emisor_Nombre', label: 'Empresa', dataType: 'string', category: 'Empresa' },
          { key: 'empresaRUT', path: 'invoice.Empresa.Parametros.EFA_Emisor_RUT', label: 'RUT Empresa', dataType: 'string', category: 'Empresa' },
          { key: 'empresaDireccion', path: 'invoice.Empresa.Parametros.EFA_Emisor_Direccion', label: 'Dirección', dataType: 'string', category: 'Empresa' },
          { key: 'empresaCiudad', path: 'invoice.Empresa.Parametros.EFA_Emisor_Ciudad', label: 'Ciudad', dataType: 'string', category: 'Empresa' },
          { key: 'clienteNombre', path: 'Contacto.GuardarComo', label: 'Cliente', dataType: 'string', category: 'Cliente' },
          { key: 'clienteDireccion', path: 'invoice.DireccionFactura.Domicilio', label: 'Dirección Cliente', dataType: 'string', category: 'Cliente' },
          { key: 'moneda', path: 'Moneda.ISO4217', label: 'Moneda', dataType: 'string', category: 'Totales' },
          { key: 'subtotal', path: 'Subtotal', label: 'Subtotal', dataType: 'number', category: 'Totales' },
          { key: 'total', path: 'Total', label: 'Total', dataType: 'number', category: 'Totales' }
        ]
      },
      detail: {
        entity: 'invoiceLine',
        fields: [
          { key: 'codigo', path: 'Articulo.Codigo', label: 'Código', dataType: 'string', category: 'Artículo' },
          { key: 'nombre', path: 'Articulo.Nombre', label: 'Descripción', dataType: 'string', category: 'Artículo' },
          { key: 'cantidad', path: 'Cantidad', label: 'Cantidad', dataType: 'number', category: 'Artículo' },
          { key: 'precioUnitario', path: 'PrecioUnitario', label: 'Precio Unitario', dataType: 'number', category: 'Artículo' },
          { key: 'descuento', path: 'Descuento', label: 'Descuento', dataType: 'number', category: 'Artículo' },
          { key: 'subtotal', path: 'SubTotal', label: 'Importe', dataType: 'number', category: 'Artículo' }
        ],
        parentKey: 'invoiceId'
      },
      lookups: {}
    },
    styles: {},
    variables: []
  };
}
