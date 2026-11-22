import { ReportTemplate } from '../../../core/models/template.model';
import { LayoutBox } from '../../../core/models/layout-evidence.model';
import { inspectRenderedLayout } from './rendered-layout-inspector';
import { mmToPx } from './coordinate-utils';

export interface DesignerPageBox extends LayoutBox { page: number; }
export interface DesignerObservation extends LayoutBox {
  key: string;
  page: number;
  label: string;
  source?: string;
  elementId?: string;
  section?: 'header' | 'detail' | 'footer';
  generated: boolean;
  primary: boolean;
  clipped: boolean;
  uncertainClip: boolean;
  outside: boolean;
}
export interface DesignerSurface {
  pages: DesignerPageBox[];
  blocks: DesignerObservation[];
  warnings: DesignerObservation[];
}

/** Read-only editor annotations. These observations never enter fiscal rules or template JSON. */
export function inspectDesignerSurface(doc: Document, template: ReportTemplate, resourcesReady: boolean): DesignerSurface {
  const result: DesignerSurface = { pages: [], blocks: [], warnings: [] };
  const pages = Array.from(doc.querySelectorAll<HTMLElement>('body > .page'));
  if (!pages.length) return result;
  const origin = pages[0].getBoundingClientRect();
  const dynamic = template.page.dynamicHeight || template.compliance?.medium === 'roll';
  const layout = inspectRenderedLayout(doc, { version: '1.0', elements: [], diagnostics: [] }, {
    resourcesReady, pageWidthPx: mmToPx(template.page.width),
    pageHeightPx: dynamic ? undefined : mmToPx(template.page.height)
  });
  const visible = (node: HTMLElement) => {
    for (let current: HTMLElement | null = node; current; current = current.parentElement) {
      const style = doc.defaultView!.getComputedStyle(current);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const labels: Record<string, string> = {
    'detail-table': 'Tabla de artículos', 'ticket-item': 'Artículo',
    'subtotals-block': 'Subtotales', 'ticket-subtotals-block': 'Subtotales',
    'ticket-detail-header': 'Encabezado de artículos'
  };
  for (const [index, page] of pages.entries()) {
    const rect = page.getBoundingClientRect();
    const pageNumber = index + 1;
    const height = dynamic ? rect.height : mmToPx(template.page.height);
    result.pages.push({ page: pageNumber, x: rect.left - origin.left, y: rect.top - origin.top,
      width: rect.width, height });
    const nodes = Array.from(page.querySelectorAll<HTMLElement>(
      '[data-render-element], [data-render-generated], .ticket-detail-header, [data-render-page-label]'));
    for (const [nodeIndex, node] of nodes.entries()) {
      if (!visible(node)) continue;
      const rects = [node.getBoundingClientRect()];
      if (!node.dataset['renderElement'] && node.tagName !== 'TR') {
        rects.push(...Array.from(node.querySelectorAll<HTMLElement>('*')).filter(visible)
          .map(child => child.getBoundingClientRect()));
      }
      const left = Math.min(...rects.map(rect => rect.left));
      const top = Math.min(...rects.map(rect => rect.top));
      const box = { left, top, width: Math.max(...rects.map(rect => rect.right)) - left,
        height: Math.max(...rects.map(rect => rect.bottom)) - top };
      const elementId = node.dataset['renderElement'];
      const generated = !elementId;
      const sectionKey = node.closest<HTMLElement>('.section')?.dataset['renderSection'];
      const section = sectionKey === 'header' || sectionKey === 'detail' || sectionKey === 'footer' ? sectionKey : undefined;
      const element = section && elementId ? template.sections[section].elements.find(el => el.id === elementId) : undefined;
      const contentIds = Array.from(node.querySelectorAll<HTMLElement>('[data-render-content]'))
        .map(child => child.dataset['renderContent']!);
      if (node.dataset['renderContent']) contentIds.push(node.dataset['renderContent']);
      const clips = layout.content.filter(item => item.page === pageNumber && item.clipped &&
        (elementId ? item.elementId === elementId : contentIds.some(id =>
          item.instanceId.startsWith('page:' + pageNumber + ':' + id + ':'))));
      const x = box.left - rect.left, y = box.top - rect.top;
      const margins = template.page.margins;
      const outside = x < mmToPx(margins.left) - .25 || y < mmToPx(margins.top) - .25 ||
        x + box.width > rect.width - mmToPx(margins.right) + .25 ||
        y + box.height > height - mmToPx(margins.bottom) + .25;
      const kind = Array.from(node.classList).find(cls => labels[cls]);
      const observation: DesignerObservation = {
        key: pageNumber + ':' + nodeIndex, page: pageNumber,
        label: element?.name || elementId || (kind ? labels[kind] :
          node.hasAttribute('data-render-page-label') ? 'Numeración de página' :
          node.closest('.subtotals-block, .ticket-subtotals-block') ? 'Fila de subtotales' : 'Fila de artículos'),
        source: node.dataset['renderSource'], elementId, section, generated,
        primary: generated && node.tagName !== 'TR',
        x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height,
        clipped: clips.some(item => item.certainty === 'measured'),
        uncertainClip: clips.some(item => item.certainty === 'unsupported'), outside
      };
      if (generated) result.blocks.push(observation);
      if (outside || observation.clipped || observation.uncertainClip) result.warnings.push(observation);
    }
  }
  return result;
}
