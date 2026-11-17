import { TestBed } from '@angular/core/testing';
import { HtmlRendererService } from '../services/html-renderer.service';
import { createDefaultTemplate } from '../data/default-template';
import { sampleFiscalInvoice } from '../data/sample-fiscal-invoice';
import { createElement } from './element-factory';
import { paginateFiscalPrint } from './paginate-fiscal-print';

describe('Fiscal pagination seal continuity', () => {
  it('repeats a declared code together with a single footer QR without changing the mold', () => {
    const template = createDefaultTemplate();
    template.compliance = { schemaVersion: '1.0', jurisdiction: 'UY', output: 'browser', cfeType: 111, medium: 'sheet' };
    template.sections.header.elements = []; template.sections.detail.elements = [];
    template.sections.detail.maxRowsPerPage = 2;
    const qr = createElement('qrCode'), code = createElement('dataField');
    if (qr.type !== 'qrCode' || code.type !== 'dataField') throw new Error('fixture');
    qr.dataBinding = 'fiscal.qrPayload'; qr.position = { x: 0, y: 0 }; qr.size = { width: 28, height: 28 };
    code.binding.source = 'CFE.CodSeguridad'; code.fiscalRoles = ['security.code'];
    code.position = { x: 0, y: 30 }; code.size = { width: 40, height: 8 };
    template.sections.footer.elements = [qr, code]; template.sections.footer.height = 40;
    const before = JSON.stringify(template);
    const artifact = TestBed.inject(HtmlRendererService).renderWithEvidence(template, sampleFiscalInvoice(template.compliance, true), true);
    const frame = document.createElement('iframe'); document.body.append(frame);
    try {
      const doc = frame.contentDocument!;
      doc.open(); doc.write(artifact.html); doc.close();
      const result = paginateFiscalPrint(doc, template);
      expect(result.pages).toBe(3);
      expect(paginateFiscalPrint(doc, template).pages).toBe(3);
      for (const page of Array.from(doc.querySelectorAll('.page'))) {
        expect(Array.from(page.querySelectorAll('[data-render-element]')).some(node => node.getAttribute('data-render-element') === code.id)).toBeTrue();
        expect(page.querySelectorAll('svg[data-qr-modules]').length).toBe(1);
      }
      expect(JSON.stringify(template)).toBe(before);
    } finally { frame.remove(); }
  });
});
