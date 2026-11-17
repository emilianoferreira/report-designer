import { ValidationContext } from '../../../core/models/fiscal.model';
import { ReportTemplate } from '../../../core/models/template.model';
import { RenderEvidence } from '../services/render-evidence';
import { paginateFiscalPrint } from './paginate-fiscal-print';
import { inspectFiscalPrint, RenderedFiscalReport } from './rendered-fiscal-rules';

export interface PreparedBrowserPrint {
  resourcesReady: boolean;
  pages: number;
  paginationPending?: string;
  report: RenderedFiscalReport;
}

/** Common preparation for the designer and the actual print iframe. No cross-document result reuse. */
export async function prepareBrowserPrint(doc: Document, template: ReportTemplate, context: ValidationContext,
  evidence: RenderEvidence, isCurrent: () => boolean, timeoutMs = 5000): Promise<PreparedBrowserPrint | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resources = Promise.all([doc.fonts.ready, ...Array.from(doc.images).map(async image => {
      try { await image.decode(); }
      catch {
        if (isCurrent()) evidence.diagnostics.push({ code: 'resource-error',
          elementId: image.closest('[data-render-element]')?.getAttribute('data-render-element') ?? undefined,
          message: 'No se pudo cargar o decodificar una imagen.' });
        throw new Error('image-resource');
      }
    })]).then(() => true).catch(() => false);
    const ready = await Promise.race([resources, new Promise<boolean>(resolve => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    })]);
    if (!isCurrent()) return undefined;
    if (!ready && !evidence.diagnostics.some(d => d.code === 'resource-error')) evidence.diagnostics.push({
      code: 'resource-error', message: 'Fuentes o imágenes no finalizaron en el tiempo de espera.' });
    const fiscal = context.facts.isCfe;
    const pagination = ready && fiscal.state === 'known' && fiscal.value === true
      ? paginateFiscalPrint(doc, template) : { pages: 1 };
    if (!isCurrent()) return undefined;
    return { resourcesReady: ready, pages: pagination.pages, paginationPending: pagination.pending,
      report: inspectFiscalPrint(template, context, doc, evidence, ready, pagination.pending) };
  } finally { if (timer) clearTimeout(timer); }
}
