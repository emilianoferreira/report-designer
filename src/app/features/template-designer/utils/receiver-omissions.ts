import { FISCAL_ROLE_LABELS, ValidationContext } from '../../../core/models/fiscal.model';
import { ReceiverPageCoverage } from './fiscal-field-evidence';
import { supportsFiscalBrowserRules } from './fiscal-context';
import { hasUnidentifiedTicketDocument, ReceiverRequirements } from './receiver-requirements';
import type { RuleResult } from './static-fiscal-rules';

export const RECEIVER_OMISSION_RULE = 'REC-OMISSION';

function provesBrowserAbsence(coverage: ReceiverPageCoverage): boolean {
  return coverage.scope === 'browser-html' && coverage.inspected && coverage.state === 'complete' &&
    !coverage.reasons.length && !coverage.evidenceIds.length;
}

/** Absence is proven by the coverage record for this field and page. */
export function isConfirmedReceiverOmission(finding: RuleResult): boolean {
  const omission = finding.omission;
  if (finding.ruleId !== RECEIVER_OMISSION_RULE || finding.status !== 'fail' ||
      finding.output !== 'browser' || finding.category !== 'normative' || !omission) return false;
  const { coverage, requirement } = omission;
  const page = finding.page;
  return page !== undefined && Number.isSafeInteger(page) && page > 0 && coverage.page === page &&
    coverage.role === requirement.role && coverage.fiscalPath === (requirement.field ?? requirement.role) &&
    coverage.fiscalPath === finding.fieldPath && provesBrowserAbsence(coverage) &&
    requirement.applicability === 'required' && !!requirement.expected?.trim() &&
    requirement.locations.length === 1 && requirement.locations[0] === 'receiver-zone';
}

/** In a multipage document only resolved repetition duties are checked on each CFE sheet. */
export function evaluateReceiverOmissions(context: ValidationContext, requirements: ReceiverRequirements,
  coverage: readonly ReceiverPageCoverage[], verifiedPages: readonly number[], receiverFindings: readonly RuleResult[]): RuleResult[] {
  const { cfeType: type, issueDate, exportOperation } = context.facts;
  if (!verifiedPages.length || !supportsFiscalBrowserRules(context) || type.state !== 'known' || requirements.secrecy !== false ||
      issueDate.state !== 'known' || exportOperation.state !== 'known') return [];
  const invoice = [111, 112, 113].includes(type.value) && requirements.branch === 'ruc-buyer';
  const ticket = [101, 102, 103].includes(type.value) && requirements.branch === 'final-consumer';
  const exception = requirements.branch === 'export' || requirements.branch === 'withholding' || requirements.branch === 'nonresident';
  if ((!invoice && !ticket && !exception) || (exportOperation.value && requirements.branch !== 'export')) return [];
  // An unidentified document kind could be the special e-Ticket with a RUC.
  if ((ticket || requirements.branch === 'nonresident') && hasUnidentifiedTicketDocument(context)) return [];

  const results: RuleResult[] = [];
  for (const page of verifiedPages) for (const field of requirements.fields) {
    if (field.applicability !== 'required' || !field.expected?.trim() ||
        (verifiedPages.length > 1 && field.repetition !== 'each-cfe-page') ||
        field.locations.length !== 1 || field.locations[0] !== 'receiver-zone') continue;
    const fieldPath = field.field ?? field.role;
    const records = coverage.filter(row => row.role === field.role && row.fiscalPath === fieldPath && row.page === page);
    if (records.length !== 1) continue;
    const record = records[0];
    if (!provesBrowserAbsence(record)) continue;

    const correspondence = 'REC-FIELD.' + field.role.slice('recipient.'.length);
    if (receiverFindings.some(result => result.ruleId === correspondence && result.page === page &&
        (result.status === 'pass' || result.status === 'fail' || result.evidenceIds.length > 0))) continue;

    results.push({
      id: RECEIVER_OMISSION_RULE, ruleId: RECEIVER_OMISSION_RULE, findingId: `${RECEIVER_OMISSION_RULE}:${field.role}:page:${page}`,
      fieldPath, page, status: 'fail', severity: 'warning', category: 'normative', output: 'browser',
      title: FISCAL_ROLE_LABELS[field.role],
      message: 'El campo obligatorio está ausente del HTML de la página inspeccionada con cobertura completa para el soporte declarado.',
      action: 'Revisar la representación del campo obligatorio en esta página.',
      source: field.basis.source, reference: [field.basis.reference, verifiedPages.length > 1 ? field.repetitionReference : undefined].filter(Boolean).join(' · '),
      evidenceIds: [], elements: [], omission: { coverage: record, requirement: field }
    });
  }
  return results;
}
