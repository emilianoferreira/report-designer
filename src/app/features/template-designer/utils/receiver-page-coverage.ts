import { ValidationContext } from '../../../core/models/fiscal.model';
import { LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { detectContentConflicts } from '../../../shared/utils/content-overlap';
import { RenderEvidence } from '../services/render-evidence';
import { fiscalFieldFact, ReceiverPageCoverage } from './fiscal-field-evidence';
import { hasPlainPrintedText, observePrintedFields } from './printed-field-observations';
import { ReceiverRequirements } from './receiver-requirements';

const normalize = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
const hasDirectText = (node: Node) => Array.from(node.childNodes).some(child => child.nodeType === 3 && child.textContent?.trim());
const noGeneratedContent = ['none', 'normal', '""'];

function containsExpectedText(text: string, expected: string): boolean {
  if (text === expected) return true;
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text);
}

export function hasUninterpretedPrintStyles(doc: Document): boolean {
  if (doc.querySelector('link[rel~="stylesheet"], style[media], script')) return true;
  return [...Array.from(doc.styleSheets), ...(doc.adoptedStyleSheets ?? [])].some(sheet => {
    try {
      return !sheet.ownerNode || Array.from(sheet.cssRules).some(rule => {
        if (rule.type === CSSRule.STYLE_RULE) return false;
        return rule.type !== CSSRule.PAGE_RULE || (rule as CSSPageRule).cssRules.length > 0;
      });
    } catch {
      return true;
    }
  });
}

export function hasUninterpretedGeneratedContent(node: Element, view: Window, style: CSSStyleDeclaration): boolean {
  return style.backgroundImage !== 'none' || style.maskImage !== 'none' || !noGeneratedContent.includes(style.content) ||
    !!node.shadowRoot || node.matches('img,svg,canvas,object,iframe,video,input,textarea,select') ||
    ['::before', '::after'].some(pseudo => {
      const generated = view.getComputedStyle(node, pseudo);
      return !noGeneratedContent.includes(generated.content) || (generated.content === '""' &&
        (generated.backgroundImage !== 'none' || generated.maskImage !== 'none'));
    }) || style.display === 'list-item';
}

/** Inventory of the inspected browser surface. Its coverage says nothing about a field's compliance. */
export function inspectReceiverCoverage(context: ValidationContext, requirements: ReceiverRequirements, doc: Document | undefined,
  evidence: RenderEvidence, layout: LayoutEvidence | undefined, paginationPending?: string): ReceiverPageCoverage[] {
  const fields = requirements.fields.filter(field => field.applicability === 'required' ||
    (requirements.branch !== 'unresolved' && field.applicability === 'pending'));
  if (!fields.length) return [];

  const report = (field: typeof fields[number], reasons: string[], inspected: boolean, page?: number, evidenceIds: string[] = []): ReceiverPageCoverage => ({
    role: field.role, fiscalPath: field.field ?? field.role, scope: 'browser-html', page, inspected, evidenceIds,
    state: reasons.length ? 'partial' : 'complete', reasons,
    reason: reasons.length ? reasons.join(' ') : 'Se interpretó el contenido relevante de esta página para el soporte declarado.'
  });

  const view = doc?.defaultView;
  const pages = Array.from(doc?.querySelectorAll('body > .page') ?? []);
  const support = context.printSupport;
  const supportReasons = (role: ReceiverPageCoverage['role'], page?: number): string[] => {
    if (support?.kind === 'blank') return [];
    const preprinted = support?.kind === 'preprinted' ? support.pages.find(entry => entry.page === page) : undefined;
    if (!preprinted) return ['El soporte de esta página es desconocido.'];
    return preprinted.roles.includes(role)
      ? ['El escenario declara un aporte preimpreso para este campo. Su contenido físico no se inspeccionó.'] : [];
  };
  if (!doc || !view || !layout?.ready || !evidence.printSurface || paginationPending || !pages.length) {
    return (pages.length ? pages.map((_, index) => index + 1) : [undefined]).flatMap(page =>
      fields.map(field => report(field, [paginationPending ?? 'Falta una superficie de impresión del navegador lista para inspeccionar.',
        ...supportReasons(field.role, page)], false, page)));
  }

  const outside = hasDirectText(doc.body) || Array.from(doc.body.children).some(node => !pages.includes(node)) ||
    [doc.documentElement, doc.body].some(node => hasUninterpretedGeneratedContent(node, view, view.getComputedStyle(node)));
  const sharedReasons: string[] = [];
  if (outside) sharedReasons.push('Hay contenido fuera de las páginas inspeccionadas.');
  if (pages.length > 1 && pages.some((page, index) => page.getAttribute('data-render-page') !== String(index + 1)))
    sharedReasons.push('La secuencia de páginas del navegador no está resuelta.');
  if (hasUninterpretedPrintStyles(doc)) sharedReasons.push('Hay estilos cuyo contenido puede cambiar al imprimir.');
  const diagnostics = evidence.diagnostics.filter(d => !d.coverageImpact || (d.coverageImpact === 'repetition' && pages.length > 1));
  const renderedIds = new Set(Array.from(doc.querySelectorAll('body > .page [data-render-element]'))
    .map(node => node.getAttribute('data-render-element')));
  const globalDiagnostic = diagnostics.some(d => !d.elementId || !renderedIds.has(d.elementId));
  if (globalDiagnostic) sharedReasons.push('El renderer informa alternativas cuya página no se pudo determinar.');

  const observed = new Map(observePrintedFields(doc, evidence, layout).map(observation => [observation.node, observation]));
  const conflictIds = new Set(detectContentConflicts(layout).flatMap(conflict => conflict.contentIds));
  return pages.flatMap((root, index) => {
    const page = index + 1;
    const surface = root.getBoundingClientRect();
    if (surface.width <= 0 || surface.height <= 0)
      return fields.map(field => report(field, ['La página no tiene una superficie medible.', ...supportReasons(field.role, page)], false, page));
    const reasons = new Set(sharedReasons);
    const identified = new Map<string, string[]>();
    const unresolvedFields = new Set<ReceiverPageCoverage['role']>();
    const possibleOtherBindings = new Set<ReceiverPageCoverage['role']>();
    const elements = Array.from(root.querySelectorAll('*'));
    const measured = new Map<string, typeof layout.content>();
    for (const item of layout.content) {
      if (item.page !== page || !item.paintGroup) continue;
      const items = measured.get(item.paintGroup) ?? [];
      items.push(item);
      measured.set(item.paintGroup, items);
    }
    const record = (key: string, ids: string[]) => identified.set(key, [...(identified.get(key) ?? []), ...ids]);
    const visibleNodes = new Set<Element>();
    for (const [i, node] of [root, ...elements].entries()) {
      const style = view.getComputedStyle(node);
      if ((node !== root && !visibleNodes.has(node.parentElement!)) || style.display === 'none' || Number(style.opacity) === 0) continue;
      visibleNodes.add(node);
      if (style.visibility !== 'visible') continue;
      const elementId = node.getAttribute('data-render-element');
      const nodeDiagnostics = elementId ? diagnostics.filter(d => d.elementId === elementId) : [];
      if (nodeDiagnostics.length) {
        const entries = evidence.content?.filter(entry => entry.elementId === elementId) ?? [];
        const entry = entries[0];
        const field = entry?.fields?.[0];
        const receiver = requirements.fields.find(candidate => candidate.field && candidate.field === field?.fiscalPath);
        if (nodeDiagnostics.every(d => d.code === 'missing-value') && entries.length === 1 && entry.fields?.length === 1 &&
            field?.association === 'whole' && receiver && entry.roles.includes(receiver.role)) {
          unresolvedFields.add(receiver.role);
        } else {
          reasons.add('El renderer informa una alternativa sin resolver en esta página.');
        }
      }
      const paint = measured.get(`page:${page}:node:${i - 1}`) ?? [];
      const usable = paint.every(item => item.certainty === 'measured' && !item.clipped && !conflictIds.has(item.instanceId));
      if (hasUninterpretedGeneratedContent(node, view, style))
        reasons.add('Hay gráficos, controles o contenido generado sin interpretación semántica.');
      if (node.matches('.element-formula')) reasons.add('Hay una fórmula visible sin contrato de campo.');
      if ((['top', 'right', 'bottom', 'left'].some(side => parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0) ||
          node.matches('.element-rectangle')) && node !== root) {
        const decoration = paint.find(item => item.kind === 'decoration' && item.roles.includes('recipient.boundary'));
        if (usable && decoration?.ink.length) record('recipient.boundary', [decoration.instanceId]);
        else record('unresolved-boundary', []);
      }
      if (!hasDirectText(node)) continue;
      const primitives = paint.filter(item => item.kind === 'text');
      if (!usable || !primitives.length || primitives.some(item => !item.ink.length) || !hasPlainPrintedText(node)) {
        reasons.add('Hay texto sin medición íntegra o con composición, recorte o superposición.');
        continue;
      }
      const text = normalize(node.textContent ?? '');
      const ids = primitives.map(item => item.instanceId);
      if (pages.length > 1 && node === root.lastElementChild && node.hasAttribute('data-render-page-label') &&
          !node.hasAttribute('data-render-element') && !node.hasAttribute('data-render-content') &&
          text === normalize(`Página ${page} de ${pages.length}`)) continue;
      const observation = observed.get(node);
      const path = observation?.field.fiscalPath;
      const fact = path ? fiscalFieldFact(context, path) : undefined;
      if (path && observation?.field.presentation === 'raw' && fact?.state === 'known' &&
          ['string', 'number'].includes(typeof fact.value) && text === normalize(String(fact.value)) &&
          !/^(adenda|references)(\.|$)|^(lines|adjustments)\.\d+\.(description|mandatoryLegend)$/.test(path)) {
        const receiver = requirements.fields.find(field => field.field === path);
        const recipientRoles = observation.entry.roles.filter(role => role.startsWith('recipient.'));
        const associated = receiver ? recipientRoles.length === 1 && recipientRoles[0] === receiver.role : !recipientRoles.length;
        if (associated) {
          record(path, ids);
          for (const field of fields) {
            const expected = normalize(field.expected ?? '');
            if (expected && field.field !== path && containsExpectedText(text, expected))
              possibleOtherBindings.add(field.role);
          }
          continue;
        }
      }
      const label = requirements.fields.find(field => field.role === 'recipient.label');
      if (label?.expected && text === normalize(label.expected) &&
          primitives.every(item => item.roles.length === 1 && item.roles[0] === 'recipient.label' && !item.sourcePaths.length)) {
        record('recipient.label', ids);
        continue;
      }
      reasons.add('Hay texto libre, compuesto, formateado o generado sin asociación verificable.');
    }

    return fields.map(field => {
      const pending = [...reasons, ...supportReasons(field.role, page)];
      if (field.applicability === 'pending') pending.push(field.reason);
      if (unresolvedFields.has(field.role)) pending.push('Un binding de este campo quedó sin valor resuelto en esta página.');
      const ids = identified.get(field.field ?? field.role);
      if (!ids?.length && possibleOtherBindings.has(field.role))
        pending.push('Otro campo visible contiene el valor esperado. Falta resolver si también representa este dato.');
      if (!field.locations.length || field.locations.includes('adenda'))
        pending.push('La ubicación del campo o su alternativa en adenda requiere revisión.');
      if (field.role === 'recipient.boundary' && identified.has('unresolved-boundary'))
        pending.push('Hay un posible recuadro sin asociación verificable.');
      return report(field, pending, true, page, ids);
    });
  });
}
