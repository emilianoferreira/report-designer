import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { RenderEvidence } from '../services/render-evidence';
import { FieldEvidence } from './fiscal-field-evidence';
import { detectContentConflicts } from '../../../shared/utils/content-overlap';

export interface PrintedFieldObservation {
  page: number;
  content: LayoutContent[];
  entry: NonNullable<RenderEvidence['content']>[number];
  field: FieldEvidence;
  node: Element;
}

/** The renderer's scalar fields contain direct text. Descendants may contribute hidden
 * text, line breaks or a different field; generated CSS content is outside the text measurement. */
export function hasPlainPrintedText(node: Element): boolean {
  const view = node.ownerDocument.defaultView;
  return !!view && node.childElementCount === 0 &&
    ['::before', '::after'].every(pseudo => ['none', 'normal', '""'].includes(view.getComputedStyle(node, pseudo).content));
}

/** Whole, uniquely attributable text only. No obligation, value or fiscal role is inferred. */
export function observePrintedFields(doc: Document | undefined, evidence: RenderEvidence,
  layout: LayoutEvidence | undefined, paginationPending?: string): PrintedFieldObservation[] {
  if (!doc || !layout?.ready || paginationPending) return [];
  const observations: PrintedFieldObservation[] = [], conflicts = detectContentConflicts(layout);
  const entries = evidence.content ?? [];
  for (const [index, root] of Array.from(doc.querySelectorAll('body > .page')).entries()) {
    const nodes = Array.from(root.querySelectorAll('[data-render-element], [data-render-content]'));
    for (const entry of entries) {
      if (!entry.emitted || entry.fields?.length !== 1 || entry.fields[0].association !== 'whole' ||
          entries.filter(other => other.instanceId === entry.instanceId).length !== 1 ||
          (entry.elementId && entries.filter(other => other.elementId === entry.elementId).length !== 1)) continue;
      const matches = nodes.filter(node => entry.elementId ? node.getAttribute('data-render-element') === entry.elementId :
        node.getAttribute('data-render-content') === entry.instanceId);
      if (matches.length !== 1 || !hasPlainPrintedText(matches[0]) ||
          (entry.elementId && evidence.elements.filter(e => e.id === entry.elementId).length !== 1)) continue;
      const content = layout.content.filter(c => c.page === index + 1 && c.kind === 'text' &&
        (entry.elementId ? c.elementId === entry.elementId : !c.elementId && c.origin === 'generated' &&
          c.instanceId.startsWith(`page:${index + 1}:${entry.instanceId}:`)));
      if (!content.length || content.some(c => !c.roles.some(role => entry.roles.includes(role)) || c.certainty !== 'measured' ||
          c.clipped || !c.ink.length || conflicts.some(conflict => conflict.page === index + 1 && conflict.contentIds.includes(c.instanceId)))) continue;
      observations.push({ page: index + 1, content, entry, field: entry.fields[0], node: matches[0] });
    }
  }
  return observations;
}
