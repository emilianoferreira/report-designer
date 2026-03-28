import { TestBed } from '@angular/core/testing';
import { HtmlRendererService } from './html-renderer.service';
import { SAMPLE_INVOICE_DATA } from '../data/sample-invoice';
import { createDefaultTemplate } from '../data/default-template';
import { ReportTemplate } from '../../../core/models/template.model';

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
});
