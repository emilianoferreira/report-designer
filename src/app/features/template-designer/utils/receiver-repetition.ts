import { FISCAL_ROLE_LABELS, ValidationContext } from '../../../core/models/fiscal.model';
import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { detectContentConflicts } from '../../../shared/utils/content-overlap';
import { ReceiverPageCoverage } from './fiscal-field-evidence';
import { supportsFiscalBrowserRules } from './fiscal-context';
import { hasPlainPrintedText } from './printed-field-observations';
import { isAdendaContent } from './receiver-adenda';
import { RECEIVER_SOURCE, ReceiverRequirements } from './receiver-requirements';
import type { RuleResult } from './static-fiscal-rules';

/** Accept the numbered sheets produced by the browser paginator. Unclassified or extra sheets stay pending. */
export function verifiedReceiverPages(doc: Document | undefined, findings: readonly RuleResult[],
  layout: LayoutEvidence | undefined, cfeIdentity: readonly LayoutContent[]): number[] {
  const pages = Array.from(doc?.querySelectorAll('body > .page') ?? []);
  const inspected = (page?: number) => findings.some(finding =>
    finding.ruleId === 'TEC-04' && finding.status === 'pass' && finding.page === page);
  if (pages.length === 1) {
    const [page] = pages;
    const number = page.getAttribute('data-render-page');
    const label = page.querySelector('[data-render-page-label]')?.textContent?.trim();
    if ((number !== null && number !== '1') || (label && label !== 'Página 1 de 1')) return [];
    return inspected() || inspected(1) ? [1] : [];
  }
  if (!layout?.ready) return [];
  const conflicts = new Set(detectContentConflicts(layout).flatMap(conflict => conflict.contentIds));
  const frames = layout.content.filter(item => item.kind === 'decoration' && item.roles.includes('adenda.boundary'));
  const numbered = pages.every((page, index) => {
    const number = index + 1;
    const labels = page.querySelectorAll('[data-render-page-label]');
    const label = labels[0];
    if (labels.length !== 1 || label !== page.lastElementChild || label.matches('[data-render-element], [data-render-content]') ||
        !hasPlainPrintedText(label) || label.textContent?.trim() !== `Página ${number} de ${pages.length}`) return false;
    const paintGroup = `page:${number}:node:${Array.from(page.querySelectorAll('*')).indexOf(label)}`;
    const ink = layout.content.filter(item => item.paintGroup === paintGroup && item.kind === 'text');
    if (!ink.length || ink.some(item => item.certainty !== 'measured' || item.clipped ||
        !item.ink.length || conflicts.has(item.instanceId))) return false;
    if (layout.content.some(item => item.page === number && isAdendaContent(item, frames)) &&
        !cfeIdentity.some(item => item.page === number)) return false;
    return page.getAttribute('data-render-page') === String(number) && page.querySelector(':scope > .section-header') &&
      page.querySelector(':scope > .section-detail') && page.querySelector(':scope > .section-footer') &&
      inspected(number);
  });
  return numbered ? pages.map((_, index) => index + 1) : [];
}

export function evaluateReceiverAlternatives(context: ValidationContext, requirements: ReceiverRequirements,
  coverage: readonly ReceiverPageCoverage[], pages: readonly number[], pageCount: number,
  receiverFindings: readonly RuleResult[], omissions: readonly RuleResult[], layout: LayoutEvidence | undefined): RuleResult[] {
  if (!supportsFiscalBrowserRules(context)) return [];
  const results: RuleResult[] = [];
  const add = (ruleId: string, title: string, status: 'pass' | 'pending', message: string, reference: string,
    page?: number, ids: string[] = [], role?: string) => results.push({
      id: ruleId, ruleId, findingId: `${ruleId}:${role ?? 'receiver'}:page:${page ?? 'document'}`, title, status,
      severity: 'info', category: 'normative', output: 'browser', message, page, evidenceIds: ids,
      elements: [], reference, source: RECEIVER_SOURCE, action: 'Revisar la identificación y el contexto normativo del receptor.'
    });
  const frames = layout?.content.filter(item => item.kind === 'decoration' && item.roles.includes('adenda.boundary')) ?? [];
  const bodyIds = new Set(layout?.content.filter(item => !isAdendaContent(item, frames)).map(item => item.instanceId));
  const present = (role: ReceiverPageCoverage['role'], page: number) => (coverage.find(record =>
    record.inspected && record.role === role && record.page === page)?.evidenceIds ?? []).filter(id => bodyIds.has(id));
  const alternative = requirements.alternative;
  if (alternative) {
    let represented = false;
    if (requirements.secrecy === false) for (const page of pages) {
      const name = present('recipient.name', page), address = present('recipient.address', page);
      const box = receiverFindings.find(finding => finding.ruleId === 'REC-BOX' && finding.status === 'pass' && finding.page === page &&
        finding.evidenceIds.every(id => bodyIds.has(id)));
      const ids = name.length && address.length ? [...name, ...address] : box?.evidenceIds;
      if (!ids?.length) continue;
      add('REC-EXCEPTION', 'Alternativa del receptor no residente', 'pass',
        name.length && address.length ? 'Se identificaron nombre y domicilio en una misma página.' :
          'Se verificaron el rótulo y las dimensiones del recuadro. La altura física de los caracteres conserva su revisión.',
        alternative.basis.reference, page, ids);
      represented = true;
      break;
    }
    if (!represented) add('REC-EXCEPTION', 'Alternativa del receptor no residente', 'pending',
      'Falta verificar en conjunto el rótulo y el recuadro, o el nombre y domicilio.', alternative.basis.reference);
  } else if (requirements.branch === 'unresolved') {
    add('REC-EXCEPTION', 'Modalidad o excepción del receptor', 'pending', requirements.fields[0].reason,
      '14º.8–12 y excepciones. Numerales 1º y 20º cuando corresponda');
  }
  if (pageCount <= 1) return results;

  const repeated = requirements.fields.filter(field => field.applicability === 'required' && field.repetition === 'each-cfe-page');
  const unresolved = requirements.fields.some(field => field.applicability === 'required' && field.repetition === 'pending');
  if (unresolved || (repeated.length > 0 && !pages.length)) {
    add('REC-REPEAT', 'Repetición del receptor por hoja', 'pending',
      'Falta verificar la secuencia de hojas del CFE o resolver la interacción con una ubicación alternativa.', '14º, representación en varias hojas');
    return results;
  }
  for (const page of pages) for (const field of repeated) {
    if (omissions.some(finding => finding.omission?.coverage.role === field.role && finding.page === page)) continue;
    const ids = present(field.role, page);
    add('REC-REPEAT', FISCAL_ROLE_LABELS[field.role], ids.length ? 'pass' : 'pending',
      ids.length ? 'El campo exigible por hoja coincide con su dato de origen en esta página.' :
        'La repetición del campo exigible en esta página conserva alternativas o evidencia por resolver.',
      field.repetitionReference ?? field.basis.reference, page, ids, field.role);
  }
  return results;
}
