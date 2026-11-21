import { ContentIdentity } from '../../../core/models/validation.model';
import { LayoutBox, LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { intersection } from '../../../shared/utils/content-overlap';
import { RenderEvidence } from '../services/render-evidence';

export interface LayoutInspectionOptions {
  resourcesReady: boolean;
  pageWidthPx?: number;
  pageHeightPx?: number;
  paginationPending?: string;
}

/** Read-only DOM adapter. Geometry is observation, never a normative verdict. */
export function inspectRenderedLayout(doc: Document, evidence: RenderEvidence, options: LayoutInspectionOptions): LayoutEvidence {
  const result: LayoutEvidence = { output: 'browser', ready: options.resourcesReady, content: [], pending: [] };
  const view = doc.defaultView;
  if (!view || !options.resourcesReady) {
    result.pending.push('Recursos o documento pendientes.');
    return result;
  }
  if (options.paginationPending) result.pending.push(options.paginationPending);
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rasterRuns = (left: number, top: number): LayoutBox[] => {
    if (!ctx) return [];
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const runs: LayoutBox[] = [];
    for (let y = 0; y < canvas.height; y++) {
      let start = -1;
      for (let x = 0; x <= canvas.width; x++) {
        const painted = x < canvas.width && pixels[(y * canvas.width + x) * 4 + 3] > 240;
        if (painted && start < 0) start = x;
        if (!painted && start >= 0) {
          runs.push({ x: left + start, y: top + y, width: x - start, height: 1 });
          start = -1;
        }
      }
    }
    return runs;
  };
  const pages = Array.from(doc.querySelectorAll<HTMLElement>('body > .page'));
  if (!pages.length) result.pending.push('No se encontró una superficie de página.');
  for (const [pageIndex, page] of pages.entries()) {
    const pageRect = page.getBoundingClientRect();
    const pageBox: LayoutBox = { x: 0, y: 0, width: options.pageWidthPx ?? pageRect.width,
      height: options.paginationPending ? pageRect.height : options.pageHeightPx ?? pageRect.height };
    const local = (r: { left: number; top: number; width: number; height: number }): LayoutBox =>
      ({ x: r.left - pageRect.left, y: r.top - pageRect.top, width: r.width, height: r.height });
    const elements = Array.from(page.querySelectorAll<HTMLElement>('*'));
    const visible = (node: Element) => {
      for (let current: Element | null = node; current; current = current.parentElement) {
        const style = view.getComputedStyle(current);
        if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
      }
      return true;
    };
    const identity = (node: Element, suffix: string): ContentIdentity => {
      const owner = node.closest('[data-render-content], [data-render-element]');
      const contentId = owner?.getAttribute('data-render-content');
      const elementId = owner?.getAttribute('data-render-element') ?? undefined;
      const candidates = owner ? evidence.content?.filter(c => contentId ? c.instanceId === contentId : c.elementId === elementId) ?? [] : [];
      const ambiguous = !!elementId && (evidence.elements.filter(c => c.id === elementId).length > 1 ||
        elements.filter(c => c.getAttribute('data-render-element') === elementId).length > 1);
      const semantic = candidates.length === 1 && !ambiguous ? candidates[0] : undefined;
      if (ambiguous && !result.pending.includes('Hay identificadores ambiguos; no se atribuyen roles a sus instancias.'))
        result.pending.push('Hay identificadores ambiguos; no se atribuyen roles a sus instancias.');
      return { origin: semantic?.origin ?? (elementId ? 'template' : 'generated'),
        elementId, section: semantic?.section ?? owner?.getAttribute('data-render-section') ?? undefined,
        sourcePaths: semantic?.sourcePaths ?? [], roles: semantic?.roles ?? [], zones: semantic?.zones ?? [],
        instanceId: `page:${pageIndex + 1}:${contentId ?? elementId ?? 'anonymous'}:${suffix}` };
    };
    // Renderer siblings use positioned z-index; complex external stacking is reported as unsupported below.
    const paintOrder = (node: Element) => {
      const positioned = node.closest('[data-render-element]') ?? node;
      return (Number(view.getComputedStyle(positioned).zIndex) || 0) * (elements.length + 1) + elements.indexOf(node as HTMLElement);
    };
    const supported = (node: Element) => {
      for (let current: Element | null = node; current && current !== page.parentElement; current = current.parentElement) {
        const style = view.getComputedStyle(current);
        if (style.transform !== 'none' || style.filter !== 'none' || style.clipPath !== 'none' ||
            Number(style.opacity) !== 1 || style.mixBlendMode !== 'normal' || parseFloat(style.borderRadius) !== 0 ||
            style.boxShadow !== 'none' || style.isolation === 'isolate' ||
            (current !== node.closest('[data-render-element]') && style.position !== 'static' && style.zIndex !== 'auto')) return false;
      }
      return true;
    };
    const add = (node: Element, suffix: string, kind: LayoutContent['kind'], bounds: LayoutBox,
      ink: LayoutBox[], measured: boolean) => {
      let clipped = false;
      const clips: LayoutBox[] = [pageBox];
      for (let current: Element | null = node; current && current !== page; current = current.parentElement) {
        const style = view.getComputedStyle(current);
        const rect = current.getBoundingClientRect();
        const box = local(rect);
        if (/hidden|clip|scroll|auto/.test(style.overflowX)) clips.push({ x: box.x + current.clientLeft, y: -1e9,
          width: current.clientWidth, height: 2e9 });
        if (/hidden|clip|scroll|auto/.test(style.overflowY)) clips.push({ x: -1e9, y: box.y + current.clientTop,
          width: 2e9, height: current.clientHeight });
      }
      let lostArea = 0;
      const painted = ink.flatMap(run => {
        let visibleRun: LayoutBox | undefined = run;
        for (const clip of clips) if (visibleRun) visibleRun = intersection(visibleRun, clip);
        lostArea += run.width * run.height - (visibleRun ? visibleRun.width * visibleRun.height : 0);
        return visibleRun ? [visibleRun] : [];
      });
      clipped = lostArea > 2 || (!measured && clips.some(clip => {
        const hit = intersection(bounds, clip);
        return !hit || hit.width * hit.height < bounds.width * bounds.height - 2;
      }));
      result.content.push({ ...identity(node, suffix), page: pageIndex + 1, kind, bounds, ink: painted,
        paintGroup: `page:${pageIndex + 1}:node:${elements.indexOf(node as HTMLElement)}`,
        clipped, order: paintOrder(node) + (kind === 'text' ? 0.5 : 0), certainty: measured && supported(node) ? 'measured' : 'unsupported' });
    };
    for (const [index, node] of elements.entries()) {
      if (!visible(node) || node.closest('svg, script, style')) continue;
      const style = view.getComputedStyle(node);
      const bounds = local(node.getBoundingClientRect());
      // Rectangular fills and straight borders are paint, not the whole decorative box.
      const alpha = (color: string) => color === 'transparent' || !color ? 0 :
        color.startsWith('rgba(') ? Number(color.slice(5, -1).split(',').pop()) : 1;
      const opaque = (color: string) => alpha(color) === 1;
      const decoration: LayoutBox[] = [];
      if (opaque(style.backgroundColor)) decoration.push(bounds);
      for (const [side, box] of [
        ['Top', { ...bounds, height: parseFloat(style.borderTopWidth) }],
        ['Bottom', { ...bounds, y: bounds.y + bounds.height - parseFloat(style.borderBottomWidth), height: parseFloat(style.borderBottomWidth) }],
        ['Left', { ...bounds, y: bounds.y + parseFloat(style.borderTopWidth), height: Math.max(0, bounds.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)), width: parseFloat(style.borderLeftWidth) }],
        ['Right', { ...bounds, y: bounds.y + parseFloat(style.borderTopWidth), height: Math.max(0, bounds.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)), x: bounds.x + bounds.width - parseFloat(style.borderRightWidth), width: parseFloat(style.borderRightWidth) }]
      ] as Array<[string, LayoutBox]>) {
        const borderStyle = style.getPropertyValue(`border-${side.toLowerCase()}-style`);
        if (!opaque(style.backgroundColor) && borderStyle === 'solid' && opaque(style.getPropertyValue(`border-${side.toLowerCase()}-color`)) && box.width && box.height) decoration.push(box);
      }
      if (decoration.length && node.matches('[data-render-element]')) add(node, `paint:${index}`, 'decoration', bounds, decoration,
        parseFloat(style.borderRadius) === 0 && style.backgroundImage === 'none');
      else if (node.matches('[data-render-element]') && (alpha(style.backgroundColor) > 0 || style.backgroundImage !== 'none')) {
        add(node, `paint:${index}`, 'decoration', bounds, [], false);
      }
      if (bounds.width > 0 && bounds.height > 0 && (node.matches('img,canvas,object') || node.querySelector(':scope > svg'))) {
        let ink: LayoutBox[] = [], measured = false;
        if (node.tagName === 'IMG' && ctx && bounds.width * bounds.height < 1_000_000) {
          const image = node as HTMLImageElement;
          if (image.complete && image.naturalWidth && image.naturalHeight && style.objectPosition === '50% 50%') {
            try {
              canvas.width = Math.ceil(bounds.width); canvas.height = Math.ceil(bounds.height);
              const fit = style.objectFit;
              const scale = fit === 'contain' ? Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight) :
                fit === 'cover' ? Math.max(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight) : 1;
              const width = fit === 'fill' ? bounds.width : image.naturalWidth * scale;
              const height = fit === 'fill' ? bounds.height : image.naturalHeight * scale;
              ctx.drawImage(image, (bounds.width - width) / 2, (bounds.height - height) / 2, width, height);
              ink = rasterRuns(bounds.x, bounds.y);
              measured = ['fill', 'contain', 'cover', 'none'].includes(fit) &&
                ['Top', 'Bottom', 'Left', 'Right'].every(side =>
                  parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) === 0 &&
                  parseFloat(style.getPropertyValue(`padding-${side.toLowerCase()}`)) === 0);
              const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              for (let offset = 3; offset < pixels.length; offset += 4) {
                if (pixels[offset] > 0 && pixels[offset] < 255) { measured = false; break; }
              }
            } catch { /* Cross-origin pixel access remains pending. */ }
          }
        }
        const qrBackground = node.querySelector('svg[data-qr-modules] > rect');
        if (qrBackground && view.getComputedStyle(qrBackground).fill === 'rgb(255, 255, 255)' &&
            view.getComputedStyle(qrBackground).fillOpacity === '1') {
          ink = [local(qrBackground.getBoundingClientRect())]; measured = true;
        }
        add(node, `graphic:${index}`, 'graphic', bounds, ink, measured);
      }
      const textChildren = Array.from(node.childNodes).filter(child => child.nodeType === 3 && child.textContent?.trim());
      for (const [textIndex, text] of textChildren.entries()) {
        if (alpha(style.color) === 0) continue;
        const range = doc.createRange();
        range.selectNodeContents(text);
        const textBounds = local(range.getBoundingClientRect());
        const runs: LayoutBox[] = [];
        const simple = !!ctx && opaque(style.color) && style.textShadow === 'none' && style.letterSpacing === 'normal' &&
          style.writingMode === 'horizontal-tb' && style.direction === 'ltr' && style.textDecorationLine === 'none' &&
          style.fontVariantCaps === 'normal' && style.textTransform === 'none' && style.textOverflow !== 'ellipsis';
        if (simple && ctx) {
          // Paint resolved lines as a whole to retain kerning and ligatures.
          const lineRanges: Array<{ start: number; end: number; top: number }> = [];
          const value = text.textContent ?? '';
          for (let offset = 0; offset < value.length;) {
            const length = (value.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
            range.setStart(text, offset); range.setEnd(text, offset + length);
            const r = range.getBoundingClientRect();
            if (r.width > 0.05 && r.height > 0.05) {
              const previous = lineRanges[lineRanges.length - 1];
              if (previous && Math.abs(previous.top - r.top) < 0.5) previous.end = offset + length;
              else lineRanges.push({ start: offset, end: offset + length, top: r.top });
            }
            offset += length;
          }
          let allLinesMeasured = lineRanges.length > 0;
          for (const line of lineRanges) {
            range.setStart(text, line.start); range.setEnd(text, line.end);
            const lineBounds = local(range.getBoundingClientRect());
            if (lineBounds.width > 4096 || lineBounds.height > 512) { allLinesMeasured = false; continue; }
            const lineText = value.slice(line.start, line.end);
            canvas.width = Math.ceil(lineBounds.width) + 16;
            canvas.height = Math.ceil(lineBounds.height) + 16;
            ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            ctx.textBaseline = 'alphabetic';
            const metrics = ctx.measureText(lineText);
            const ascent = metrics.fontBoundingBoxAscent, descent = metrics.fontBoundingBoxDescent;
            if (Number.isFinite(ascent) && Math.abs(ascent + descent - lineBounds.height) < 2 &&
                Math.abs(metrics.width - lineBounds.width) < 1) {
              ctx.fillText(lineText, 8, 8 + ascent);
              runs.push(...rasterRuns(lineBounds.x - 8, lineBounds.y - 8));
            } else allLinesMeasured = false;
          }
          if (!allLinesMeasured) runs.length = 0;
        }
        add(node, `text:${index}:${textIndex}`, 'text', textBounds, runs, runs.length > 0);
      }
    }
  }
  if (result.content.some(c => c.certainty === 'unsupported')) result.pending.push('Hay gráficos o estilos cuya tinta visible requiere revisión.');
  return result;
}
