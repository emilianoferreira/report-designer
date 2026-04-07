import { TestBed } from '@angular/core/testing';
import { HtmlRendererService } from './html-renderer.service';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';
import { createDefaultTemplate } from '../data/default-template';
import { ReportTemplate, QRCodeElement, BarcodeElement, RectangleElement, ShapeType } from '../../../core/models/template.model';
import { createElement } from '../utils/element-factory';

describe('HtmlRendererService', () => {
  let service: HtmlRendererService;
  let template: ReportTemplate;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HtmlRendererService);
    template = createDefaultTemplate();
  });

  // ─── formatNumber ───

  describe('formatNumber', () => {
    it('should format with 2 decimals by default', () => {
      const result = service.formatNumber(1234.5);
      // es-UY locale: dot for thousands, comma for decimals -> "1.234,50"
      expect(result).toMatch(/1\.?234/);
      expect(result).toMatch(/50/);
    });

    it('should return "0,00" for 0', () => {
      const result = service.formatNumber(0);
      expect(result).toMatch(/0[,.]00/);
    });

    it('should return "0,00" for NaN', () => {
      const result = service.formatNumber(NaN);
      expect(result).toBe('0,00');
    });

    it('should respect custom decimals', () => {
      const result = service.formatNumber(1.23456, 4);
      expect(result).toContain('2346'); // rounded to 4 decimals
    });

    it('should handle negative numbers', () => {
      const result = service.formatNumber(-500);
      expect(result).toContain('500');
      expect(result).toContain('-');
    });
  });

  // ─── formatDate ───

  describe('formatDate', () => {
    it('should format date with dd/MM/yyyy pattern', () => {
      const result = service.formatDate('2026-02-25T17:39:00.000Z', 'dd/MM/yyyy');
      // Date parsing depends on timezone, but should contain year
      expect(result).toContain('2026');
      expect(result).toContain('/');
    });

    it('should return empty string for empty input', () => {
      expect(service.formatDate('')).toBe('');
    });

    it('should support HH:mm pattern', () => {
      const result = service.formatDate('2026-02-25T17:39:00.000Z', 'HH:mm');
      expect(result).toContain(':');
    });

    it('should support combined pattern', () => {
      const result = service.formatDate('2026-02-25T17:39:00.000Z', 'dd/MM/yyyy HH:mm');
      expect(result).toContain('2026');
      expect(result).toContain(':');
    });
  });

  // ─── resolveBinding ───

  describe('resolveBinding', () => {
    it('should resolve dot-notation path', () => {
      const result = service.resolveBinding('invoice.Tipo.Nombre', SAMPLE_INVOICE_DATA);
      expect(result).toBe('Venta Contado');
    });

    it('should resolve "comp." prefix as alias for "invoice."', () => {
      const result = service.resolveBinding('comp.Tipo.Nombre', SAMPLE_INVOICE_DATA);
      expect(result).toBe('Venta Contado');
    });

    it('should strip "data." prefix', () => {
      const result = service.resolveBinding('data.invoice.Tipo.Nombre', SAMPLE_INVOICE_DATA);
      expect(result).toBe('Venta Contado');
    });

    it('should return undefined for non-existent path', () => {
      const result = service.resolveBinding('invoice.NonExistent.Path', SAMPLE_INVOICE_DATA);
      expect(result).toBeUndefined();
    });

    it('should return undefined for null data', () => {
      const result = service.resolveBinding('invoice.Tipo', null as any);
      expect(result).toBeUndefined();
    });

    it('should return undefined for empty path', () => {
      const result = service.resolveBinding('', SAMPLE_INVOICE_DATA);
      expect(result).toBeUndefined();
    });

    it('should resolve Moneda fields', () => {
      const result = service.resolveBinding('Moneda.Simbolo', SAMPLE_INVOICE_DATA);
      expect(result).toBe('$');
    });

    it('should resolve top-level computed values', () => {
      const result = service.resolveBinding('Total', SAMPLE_INVOICE_DATA);
      expect(result).toBe(122.00);
    });
  });

  // ─── renderToHtml ───

  describe('renderToHtml', () => {
    it('should return a string starting with <!DOCTYPE html>', () => {
      const html = service.renderToHtml(template, SAMPLE_INVOICE_DATA);
      expect(html.trim().startsWith('<!DOCTYPE html>')).toBe(true);
    });

    it('should contain the template name in title', () => {
      const html = service.renderToHtml(template, SAMPLE_INVOICE_DATA);
      expect(html).toContain(`<title>${template.metadata.name}</title>`);
    });

    it('should contain section divs', () => {
      const html = service.renderToHtml(template, SAMPLE_INVOICE_DATA);
      expect(html).toContain('section-header');
      expect(html).toContain('section-detail');
      expect(html).toContain('section-footer');
    });

    it('should resolve data bindings when resolveData is true', () => {
      const html = service.renderToHtml(template, SAMPLE_INVOICE_DATA, { resolveData: true });
      expect(html).toContain('Venta Contado');
    });

    it('should output z-code directives when resolveData is false', () => {
      const html = service.renderToHtml(template, SAMPLE_INVOICE_DATA, { resolveData: false });
      expect(html).toContain('z-code');
    });
  });

  // ─── renderPreview ───

  describe('renderPreview', () => {
    it('should return valid HTML', () => {
      const html = service.renderPreview(template, SAMPLE_INVOICE_DATA);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('should resolve data bindings', () => {
      const html = service.renderPreview(template, SAMPLE_INVOICE_DATA);
      expect(html).toContain('Venta Contado');
    });
  });

  // ─── exportAsZureoTemplate ───

  describe('exportAsZureoTemplate', () => {
    it('should output z-code directives', () => {
      const html = service.exportAsZureoTemplate(template);
      expect(html).toContain('z-code');
    });

    it('should not resolve data bindings', () => {
      const html = service.exportAsZureoTemplate(template);
      // The binding source paths should appear raw, not resolved
      expect(html).toContain('invoice.');
    });
  });

  // ─── QR Code rendering ───

  describe('QR code rendering', () => {
    let qrTemplate: ReportTemplate;
    let qrElement: QRCodeElement;

    beforeEach(() => {
      qrTemplate = createDefaultTemplate();
      qrElement = createElement('qrCode', { x: 10, y: 10 }) as QRCodeElement;
      qrElement.dataBinding = 'QRBase64';
      qrTemplate.sections.header.elements.push(qrElement);
    });

    it('should render QR as SVG with viewBox when resolveData is true', () => {
      const html = service.renderToHtml(qrTemplate, SAMPLE_INVOICE_DATA, { resolveData: true });
      expect(html).toContain('element-qrcode');
      expect(html).toContain('<svg');
      expect(html).toContain('viewBox');
    });

    it('should render QR as z-code directive when resolveData is false', () => {
      const html = service.renderToHtml(qrTemplate, SAMPLE_INVOICE_DATA, { resolveData: false });
      expect(html).toContain('z-code="true"');
      expect(html).toContain('QRBase64');
    });
  });

  // ─── Barcode rendering ───

  describe('barcode rendering', () => {
    let barcodeTemplate: ReportTemplate;
    let barcodeElement: BarcodeElement;

    beforeEach(() => {
      barcodeTemplate = createDefaultTemplate();
      barcodeElement = createElement('barcode', { x: 10, y: 10 }) as BarcodeElement;
      barcodeElement.dataBinding = 'invoice.Numero';
      barcodeElement.barcodeType = 'CODE128';
      barcodeElement.showText = true;
      barcodeTemplate.sections.header.elements.push(barcodeElement);
    });

    it('should render barcode as SVG when resolveData is true', () => {
      const html = service.renderToHtml(barcodeTemplate, SAMPLE_INVOICE_DATA, { resolveData: true });
      expect(html).toContain('element-barcode');
      expect(html).toContain('<svg');
    });

    it('should render barcode as z-code directive when resolveData is false', () => {
      const html = service.renderToHtml(barcodeTemplate, SAMPLE_INVOICE_DATA, { resolveData: false });
      expect(html).toContain('z-code="true"');
      expect(html).toContain('JsBarcode');
      expect(html).toContain('CODE128');
    });
  });

  // ─── Ticket format rendering ───

  describe('ticket format rendering', () => {
    let ticketTemplate: ReportTemplate;

    beforeEach(() => {
      ticketTemplate = createDefaultTemplate();
      ticketTemplate.page.paperType = 'ticket-80';
      ticketTemplate.page.width = 80;
      ticketTemplate.page.height = 200;
      ticketTemplate.page.dynamicHeight = true;
    });

    it('should detect ticket format from paperType', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('ticket-detail-header');
    });

    it('should detect ticket format from dynamicHeight', () => {
      const customTicket = createDefaultTemplate();
      customTicket.page.dynamicHeight = true;
      customTicket.page.paperType = 'custom' as any;
      const html = service.renderPreview(customTicket, SAMPLE_INVOICE_DATA);
      expect(html).toContain('ticket-detail-header');
    });

    it('should NOT use ticket format for A4', () => {
      const html = service.renderPreview(template, SAMPLE_INVOICE_DATA);
      // The CSS will contain ticket classes, but the HTML body should use detail-table not ticket-item
      expect(html).toContain('<table class="detail-table">');
      expect(html).not.toContain('<div class="ticket-item">');
    });

    it('should render DESCRIPCIÓN and SUBTOTAL headers', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('DESCRIPCI');
      expect(html).toContain('SUBTOTAL');
    });

    it('should render article name with code in ticket format', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('(Art1)');
      expect(html).toContain('Articulo 1');
    });

    it('should render article date when available', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      // Date rendering depends on timezone; just check for ticket-item-date class and year
      expect(html).toContain('ticket-item-date');
      expect(html).toContain('2025');
    });

    it('should render quantity with x prefix', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('x1');
    });

    it('should render ticket subtotals', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('ticket-subtotals-table');
      expect(html).toContain('Subtotal:');
      expect(html).toContain('Total:');
    });

    it('should render ticket item subtotal value', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('ticket-item-subtotal');
    });

    it('should NOT render 6-column detail table for tickets', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      // Should not have the columnar headers as positioned elements
      // The detail-table class should not appear in the detail section
      expect(html).not.toContain('<table class="detail-table">');
    });

    it('should use ticket directives for z-code export', () => {
      const html = service.exportAsZureoTemplate(ticketTemplate);
      expect(html).toContain('ticket-item');
      expect(html).toContain('Articulos.map');
    });

    it('should render ticket CSS classes', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('.ticket-detail-header');
      expect(html).toContain('.ticket-item');
      expect(html).toContain('.ticket-item-qty-row');
    });

    it('should render IVA in ticket subtotals', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('IVA Tasa');
    });

    it('should render currency in ticket total', () => {
      const html = service.renderPreview(ticketTemplate, SAMPLE_INVOICE_DATA);
      expect(html).toContain('$');
    });
  });

  // ─── Geometric shapes rendering ───

  describe('geometric shapes rendering', () => {
    function createShapeTemplate(shapeType: ShapeType, props: Partial<RectangleElement> = {}): ReportTemplate {
      const t = createDefaultTemplate();
      const el = createElement('rectangle', { x: 10, y: 10 }, { shapeType }) as RectangleElement;
      // Apply properties directly since factory doesn't spread all overrides
      Object.assign(el, props);
      t.sections.header.elements.push(el);
      return t;
    }

    // ─── Rectangle (default) ───

    it('should render rectangle with border', () => {
      const t = createShapeTemplate('rectangle', {
        strokeColor: '#333333',
        strokeWidth: 0.5,
        strokeStyle: 'solid',
      });
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('element-rectangle');
      expect(html).toContain('border:');
      expect(html).toContain('#333333');
    });

    it('should render rectangle with fillColor', () => {
      const t = createShapeTemplate('rectangle', {
        fillColor: '#ff0000',
      });
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('background-color: #ff0000');
    });

    it('should render rectangle without stroke when strokeColor cleared', () => {
      const t = createShapeTemplate('rectangle', {
        strokeColor: undefined,
      });
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('element-rectangle');
    });

    // ─── Ellipse ───

    it('should render ellipse with border-radius 50%', () => {
      const t = createShapeTemplate('ellipse');
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('border-radius: 50%');
    });

    it('should render ellipse with fillColor and strokeColor', () => {
      const t = createShapeTemplate('ellipse', {
        fillColor: '#00ff00',
        strokeColor: '#0000ff',
        strokeWidth: 0.5,
      });
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('border-radius: 50%');
      expect(html).toContain('background-color: #00ff00');
      expect(html).toContain('#0000ff');
      expect(html).toContain('border:');
    });

    // ─── Triangle ───

    it('should render triangle with clip-path polygon', () => {
      const t = createShapeTemplate('triangle');
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('clip-path: polygon(50% 0%, 0% 100%, 100% 100%)');
    });

    it('should render triangle with SVG stroke overlay', () => {
      const t = createShapeTemplate('triangle', {
        strokeColor: '#ff0000',
        strokeWidth: 0.5,
      });
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('<svg');
      expect(html).toContain('M 50,0 L 100,100 L 0,100 Z');
      expect(html).toContain('stroke="#ff0000"');
      expect(html).toContain('vector-effect="non-scaling-stroke"');
    });

    it('should render triangle with fill but no SVG when no stroke', () => {
      const t = createShapeTemplate('triangle', {
        fillColor: '#ffcc00',
        strokeColor: undefined,
      });
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('clip-path: polygon');
      expect(html).toContain('background-color: #ffcc00');
      expect(html).not.toContain('<svg');
    });

    // ─── Diamond ───

    it('should render diamond with clip-path polygon', () => {
      const t = createShapeTemplate('diamond');
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)');
    });

    it('should render diamond with SVG stroke overlay', () => {
      const t = createShapeTemplate('diamond', {
        strokeColor: '#0000ff',
        strokeWidth: 1,
      });
      const html = service.renderPreview(t, SAMPLE_INVOICE_DATA);
      expect(html).toContain('<svg');
      expect(html).toContain('M 50,0 L 100,50 L 50,100 L 0,50 Z');
      expect(html).toContain('stroke="#0000ff"');
    });
  });

  // ─── Edge cases ───

  describe('edge cases', () => {
    it('should render template with zero invoice lines', () => {
      const emptyData = {
        ...SAMPLE_INVOICE_DATA,
        invoiceLines: [],
        Articulos: [],
      };
      const html = service.renderPreview(template, emptyData);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('detail-table');
    });

    it('should render template with many invoice lines', () => {
      const manyLines = Array.from({ length: 20 }, (_, i) => ({
        Articulo: { Codigo: `A${i}`, Nombre: `Articulo ${i}` },
        Cantidad: i + 1,
        PrecioUnitario: 10 * (i + 1),
        PrecioUnitarioNeto: 12.2 * (i + 1),
        Descuento: 0,
        SubTotal: 10 * (i + 1) * (i + 1),
      }));
      const manyData = {
        ...SAMPLE_INVOICE_DATA,
        invoiceLines: manyLines,
        Articulos: manyLines,
      };
      const html = service.renderPreview(template, manyData);
      expect(html).toContain('A19'); // last article code
      expect(html).toContain('Articulo 19');
    });

    it('should handle empty commentary gracefully', () => {
      const noComment = {
        ...SAMPLE_INVOICE_DATA,
        invoice: { ...SAMPLE_INVOICE_DATA.invoice, Comentario: '' },
      };
      const html = service.renderPreview(template, noComment);
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('should render z-code export preserving all element types', () => {
      // Create template with one of each type
      const fullTemplate = createDefaultTemplate();
      fullTemplate.sections.header.elements.push(
        createElement('text', { x: 10, y: 10 }),
        createElement('rectangle', { x: 50, y: 10 }, { shapeType: 'triangle' }) as any,
        createElement('line', { x: 10, y: 30 }),
      );
      const html = service.exportAsZureoTemplate(fullTemplate);
      expect(html).toContain('element-text');
      expect(html).toContain('element-rectangle');
      expect(html).toContain('element-line');
    });
  });
});
