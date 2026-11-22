import { FiscalRole, FISCAL_ROLE_LABELS, ValidationContext } from '../../../core/models/fiscal.model';
import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { RenderEvidence } from '../services/render-evidence';
import { RuleResult } from './static-fiscal-rules';
import { detectContentConflicts } from '../../../shared/utils/content-overlap';
import { mmToPx } from './coordinate-utils';
import { hasPlainPrintedText } from './printed-field-observations';
import { isAdendaContent } from './receiver-adenda';

import { RECEIVER_SOURCE, ReceiverRequirement, receiverRequirements } from './receiver-requirements';
import { borderFitsBrowserPage } from './print-border';
export { receiverRequirements, receiverThreshold } from './receiver-requirements';

const normalize = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es-UY');

export function evaluateReceiverPrint(context: ValidationContext, doc: Document | undefined,
  evidence: RenderEvidence, layout: LayoutEvidence | undefined, paginationPending?: string,
  requirements = receiverRequirements(context), verifiedPages: readonly number[] = []): RuleResult[] {
  const results: RuleResult[] = [];
  const add = (id: string, status: RuleResult['status'], message: string, page?: number, contents: LayoutContent[] = [], instance?: string) => {
    const elements = contents.flatMap(c => c.elementId && ['header', 'detail', 'footer'].includes(c.section ?? '') ?
      [{ id: c.elementId, section: c.section as 'header' | 'detail' | 'footer' }] : []);
    const titles: Record<string, string> = { 'REC-THRESHOLD': 'Umbral de identificación del receptor', 'REC-BOX': 'Recuadro del receptor',
      'REC-SECRECY': 'Identificación amparada en secreto profesional', 'REC-CHARACTERS': 'Altura de caracteres del receptor' };
    const requirement = requirements.fields.find(field => id === 'REC-FIELD.' + field.role.slice(10) ||
      (id === 'REC-BOX' && field.role === 'recipient.boundary'));
    results.push({ id, ruleId: id, findingId: `${id}${instance ? ':' + instance : ''}:page:${page ?? 'document'}`, page, status,
      fieldPath: requirement?.field,
      title: titles[id] ?? FISCAL_ROLE_LABELS[('recipient.' + id.slice('REC-FIELD.'.length)) as FiscalRole] ?? id, message, severity: status === 'fail' ? 'error' : 'info',
      category: 'normative', source: RECEIVER_SOURCE, reference: requirement?.basis.reference ?? '14º, Identificación del receptor y excepciones', output: 'browser',
      evidenceIds: contents.map(c => c.instanceId), elements, action: 'Revisar datos del receptor y su representación; no completar por inferencia.' });
  };
  add('REC-THRESHOLD', requirements.threshold.status, requirements.threshold.reason);
  const conflicts = layout ? detectContentConflicts(layout) : [];
  const adendaFrames = layout?.content.filter(item => item.kind === 'decoration' && item.roles.includes('adenda.boundary')) ?? [];
  const pages = Array.from(doc?.querySelectorAll('body > .page') ?? []);
  for (let index = 0; index < Math.max(pages.length, 1); index++) {
    const page = index + 1, root = pages[index];
    const safe = (c: LayoutContent) => c.page === page && c.certainty === 'measured' && !c.clipped &&
      c.ink.length > 0 && !conflicts.some(conflict => conflict.page === page && conflict.contentIds.includes(c.instanceId));
    const nodes = Array.from(root?.querySelectorAll('[data-render-element], [data-render-content]') ?? []);
    const cache = new Map<LayoutContent, Element | undefined>();
    const nodeFor = (c: LayoutContent) => {
      if (cache.has(c)) return cache.get(c);
      const matches = nodes.filter(node => c.elementId ? node.getAttribute('data-render-element') === c.elementId :
        evidence.content?.some(entry => entry.instanceId === node.getAttribute('data-render-content') && c.instanceId.startsWith(`page:${page}:${entry.instanceId}:`)));
      const node = matches.length === 1 ? matches[0] : undefined;
      cache.set(c, node); return node;
    };
    const safeText = (c: LayoutContent) => safe(c) && c.kind === 'text' && !!nodeFor(c) && hasPlainPrintedText(nodeFor(c)!) &&
      layout!.content.filter(other => other.page === page && other.kind === 'text' && nodeFor(other) === nodeFor(c)).every(safe);
    const candidatesFor = (requirement: ReceiverRequirement) => layout?.content.filter(c => c.roles.includes(requirement.role) &&
      (requirements.secrecy === true || !isAdendaContent(c, adendaFrames)) &&
      safeText(c) && !c.sourcePaths.some(path => path.startsWith('fiscal.') && path !== 'fiscal.' + requirement.field)) ?? [];
    for (const requirement of requirements.fields.filter(field => field.role !== 'recipient.boundary')) {
      const id = 'REC-FIELD.' + requirement.role.slice(10);
      if (requirement.applicability !== 'required') {
        add(id, requirement.applicability === 'not-applicable' ? 'not-applicable' : 'pending',
          requirement.applicability === 'optional' ? 'Campo opcional para esta operación. ' + requirement.reason : requirement.reason, page); continue;
      }
      if (!doc || !layout?.ready || !root || paginationPending || requirement.expected === undefined || !requirement.locations.length) {
        add(id, 'pending', requirement.reason + ' Falta dato o salida verificable.', page); continue;
      }
      const candidates = candidatesFor(requirement);
      if (!candidates.length) add(id, 'pending', requirement.reason + ' Falta una correspondencia inequívoca entre campo y valor visible.', page);
      for (const node of new Set(candidates.map(c => nodeFor(c)!))) {
        const elementId = node.getAttribute('data-render-element');
        const entries = evidence.content?.filter(entry => elementId ? entry.elementId === elementId :
          entry.instanceId === node.getAttribute('data-render-content')) ?? [];
        const entry = entries[0];
        const bound = candidates.filter(c => nodeFor(c) === node);
        const printed = normalize(node.textContent ?? '');
        const expected = normalize(requirement.expected);
        if (printed === expected && entries.length === 1 && entry.emitted) {
          add(id, 'pass', requirement.reason + ' Valor visible coincidente con el origen.', page, bound, entry.instanceId);
          continue;
        }
        const explicit = !!requirement.field && entries.length === 1 && entry.emitted && entry.fields?.length === 1 &&
          entry.fields[0].fiscalPath === requirement.field && entry.fields[0].association === 'whole' && entry.fields[0].presentation === 'raw';
        const punctuationOnly = requirement.field === 'receiverDocumentNumber' &&
          printed.replace(/[.\s-]/g, '') === expected.replace(/[.\s-]/g, '');
        const countryAlias = requirement.field === 'receiverCountry' && !(/^[A-Z]{2}$/.test(printed) && /^[A-Z]{2}$/.test(expected));
        const requiredHere = pages.length === 1 || (verifiedPages.includes(page) && requirement.repetition === 'each-cfe-page');
        const confirmed = requiredHere && explicit && printed && !/[*•…]/.test(printed) && !punctuationOnly && !countryAlias &&
          !layout.pending.length && requirements.secrecy === false;
        add(id, confirmed ? 'fail' : 'pending', confirmed ? 'El campo fiscal explícito del receptor imprime un valor diferente del origen conocido.' :
          requirement.reason + ' La evidencia disponible no permite confirmar la correspondencia.', page, bound, entry?.instanceId);
      }
    }
    const labelRequirement = requirements.fields.find(field => field.role === 'recipient.label')!;
    const labels = candidatesFor(labelRequirement).filter(c =>
      labelRequirement.expected && normalize(nodeFor(c)?.textContent ?? '') === normalize(labelRequirement.expected));
    const label = labels.length === 1 ? labels[0] : undefined;
    const documentRequirement = requirements.fields.find(field => field.role === 'recipient.document')!;
    const documents = candidatesFor(documentRequirement).filter(c =>
      documentRequirement.expected && normalize(nodeFor(c)?.textContent ?? '') === normalize(documentRequirement.expected));
    const documentContent = documents.length === 1 ? documents[0] : undefined;
    const inside = (inner: LayoutContent, outer: LayoutContent) => inner.bounds.x >= outer.bounds.x && inner.bounds.y >= outer.bounds.y &&
      inner.bounds.x + inner.bounds.width <= outer.bounds.x + outer.bounds.width && inner.bounds.y + inner.bounds.height <= outer.bounds.y + outer.bounds.height;
    const alternativeBox = requirements.alternative?.anyOf.some(group => group.includes('recipient.label') && group.includes('recipient.boundary'));
    const boxes = layout?.content.filter(c => {
      if (c.page !== page || c.kind !== 'decoration' || !label || !inside(label, c) || isAdendaContent(c, adendaFrames)) return false;
      if (labelRequirement.expected === 'RUC COMPRADOR' && (!documentContent || !inside(documentContent, c) ||
          documentContent.bounds.y < label.bounds.y + label.bounds.height)) return false;
      const node = nodeFor(c), view = doc?.defaultView, style = node && view?.getComputedStyle(node);
      const alternativeBorder = alternativeBox && node && root && view && c.certainty === 'measured' &&
        !conflicts.some(conflict => conflict.page === page && conflict.contentIds.includes(c.instanceId)) &&
        borderFitsBrowserPage(node, root, view);
      if (!safe(c) && !alternativeBorder) return false;
      return style && ['Top', 'Right', 'Bottom', 'Left'].every(edge =>
        style.getPropertyValue('border-' + edge.toLowerCase() + '-style') === 'solid' &&
        parseFloat(style.getPropertyValue('border-' + edge.toLowerCase() + '-width')) > 0 &&
        /^rgb\(/.test(style.getPropertyValue('border-' + edge.toLowerCase() + '-color'))) &&
        parseFloat(style.borderRadius || '0') === 0;
    }) ?? [];
    if (!paginationPending && layout?.ready && requirements.secrecy === false && (labelRequirement.applicability === 'required' || alternativeBox) &&
        labelRequirement.locations.length && boxes.length === 1 &&
        boxes[0].roles.includes('recipient.boundary') && !layout.pending.length) {
      const box = boxes[0], fits = box.bounds.width + 0.05 >= mmToPx(40) && box.bounds.height + 0.05 >= mmToPx(10);
      add('REC-BOX', fits ? 'pass' : alternativeBox || pages.length > 1 ? 'pending' : 'fail', fits ? 'Recuadro rectangular medido de al menos 40 × 10 mm con contenido asociado; altura física de caracteres pendiente.' :
        alternativeBox ? 'Este recuadro no acredita la alternativa; también se admite nombre y domicilio.' : pages.length > 1 ?
          'El recuadro es menor a 40 × 10 mm. Falta identificar la presentación exigible en el conjunto de hojas.' :
          'El único recuadro rectangular explícito que contiene la identificación mide menos de 40 × 10 mm.', page, [box, label!, ...(documentContent ? [documentContent] : [])]);
    } else add('REC-BOX', 'pending', 'Falta recuadro rectangular medible y asociación inequívoca; el rol no acredita dimensiones ni caracteres.', page);
    add('REC-CHARACTERS', 'pending', 'La altura física de caracteres de identificación no se deduce del tamaño de fuente CSS.', page);
  }
  return results;
}
