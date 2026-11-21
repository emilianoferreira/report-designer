import '@angular/compiler';
import { HtmlRendererService } from '../../src/app/features/template-designer/services/html-renderer.service';

// Bundled only by the test runner, never by the product build.
const renderer = new HtmlRendererService();
(window as any).renderInvoice = (template: any, data: any) => ({
  html: renderer.renderToHtml(template, data, { resolveData: true }),
  preview: renderer.renderPreview(template, data),
  evidence: renderer.renderWithEvidence(template, data).evidence,
  formattedTotal: renderer.formatNumber(data.Total),
});
