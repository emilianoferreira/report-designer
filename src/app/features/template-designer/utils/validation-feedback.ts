import { CFE_TYPES, ValidationContext } from '../../../core/models/fiscal.model';
import { RuleResult } from './static-fiscal-rules';
import { ReceiverPageCoverage } from './fiscal-field-evidence';
import { RECEIVER_OMISSION_RULE } from './receiver-omissions';
import type { ReceiverRequirements } from './receiver-requirements';
import { confirmedPrintFailures, decideBrowserPrint, isContentValidationFinding, PrintReport } from './print-validation-policy';

export interface FeedbackFinding {
  finding: RuleResult;
  label: string;
  target: string;
  confirmed: boolean;
  blocking: boolean;
  prominent: boolean;
  elements: RuleResult['elements'];
}
export interface FeedbackGroup {
  key: 'receiver' | 'amounts' | 'references';
  title: string;
  findings: FeedbackFinding[];
  confirmed: number;
  pending: number;
  verified: number;
}
export interface ValidationFeedback {
  state: 'allow' | 'block' | 'refresh';
  message: string;
  typeLabel: string;
  matrixVersion?: string;
  blockingCount: number;
  groups: FeedbackGroup[];
  receiverCoverage?: ReceiverPageCoverage[];
  receiverMode?: string;
}

const receiverModes: Record<ReceiverRequirements['branch'], string> = {
  'ruc-buyer': 'RUC del comprador',
  'final-consumer': 'Consumo final',
  export: 'Excepción por exportación',
  withholding: 'Excepción por retención o percepción',
  nonresident: 'Alternativa para entidad no residente sin RUT',
  unresolved: 'Modalidad o excepción pendiente de resolver'
};

export function findingTarget(finding: RuleResult): string {
  const path = finding.fieldPath ?? '';
  const lineTax = /^lines\.(\d+)\.taxes\.(\d+)/.exec(path);
  if (lineTax) return `Ítem ${Number(lineTax[1]) + 1} · tributo ${Number(lineTax[2]) + 1}`;
  const match = /^(lines|references|taxes|adjustments)\.(\d+)/.exec(path);
  const labels: Record<string, string> = { lines: 'Ítem', references: 'Referencia', taxes: 'Tributo', adjustments: 'Ajuste' };
  return match ? `${labels[match[1]]} ${Number(match[2]) + 1}` : '';
}
export function printFailureLabel(finding: RuleResult): string {
  return [finding.id, finding.title, findingTarget(finding), finding.page ? `página ${finding.page}` : ''].filter(Boolean).join(' · ');
}

/** Presentation only. Each consumer supplies the freshness of its own artifact, never another iframe's report. */
export function buildValidationFeedback(context: ValidationContext,
  report: PrintReport & { obligationMatrix?: { version: string }; receiverCoverage?: ReceiverPageCoverage[];
    receiverObligations?: ReceiverRequirements },
  artifactSnapshot: string, currentSnapshot: string): ValidationFeedback {
  const decision = decideBrowserPrint(context, report, artifactSnapshot, currentSnapshot);
  const type = context.facts.cfeType;
  const typeLabel = type.state === 'known' ? CFE_TYPES.find(candidate => candidate.value === type.value)?.label ?? `Tipo ${type.value} sin cobertura` : 'Tipo de CFE sin determinar';
  const groups: FeedbackGroup[] = [
    { key: 'receiver', title: 'Receptor', findings: [], confirmed: 0, pending: 0, verified: 0 },
    { key: 'amounts', title: 'Importes, moneda y signos', findings: [], confirmed: 0, pending: 0, verified: 0 },
    { key: 'references', title: 'Referencias', findings: [], confirmed: 0, pending: 0, verified: 0 }
  ];
  if (decision.state !== 'refresh') {
    const confirmed = new Set(confirmedPrintFailures(report)), blocking = new Set(decision.failures);
    for (const finding of report.results.filter(finding => finding.output === 'browser' && isContentValidationFinding(finding))) {
      const group = groups.find(group => group.key === (finding.ruleId.startsWith('REC-') ? 'receiver' : finding.ruleId.startsWith('AMT-') ? 'amounts' : 'references'))!;
      const isConfirmed = confirmed.has(finding), isBlocking = blocking.has(finding);
      const confirmation = finding.ruleId === RECEIVER_OMISSION_RULE ? 'Omisión confirmada' : 'Confirmado';
      const label = isConfirmed ? `${confirmation} · ${isBlocking ? 'bloquea impresión del navegador' : 'no activa bloqueo fiscal'}` :
        finding.status === 'pass' ? finding.category === 'technical' ? 'Dato del origen verificado' : 'Verificado en este escenario' :
          finding.status === 'not-applicable' ? 'No aplica' : finding.status === 'fail' ? 'Sin confirmación suficiente · no bloquea' : 'Pendiente · no bloquea';
      group.findings.push({ finding, target: findingTarget(finding), confirmed: isConfirmed, blocking: isBlocking, label,
        prominent: finding.status === 'fail' || (finding.status === 'pending' && finding.severity === 'warning'),
        elements: finding.elements.filter((element, index, array) => array.findIndex(other => other.id === element.id && other.section === element.section) === index) });
      if (isConfirmed) group.confirmed++;
      else if (finding.status === 'pending' || finding.status === 'fail') group.pending++;
      else if (finding.status === 'pass') group.verified++;
    }
  }
  return { state: decision.state, typeLabel, matrixVersion: report.obligationMatrix?.version,
    receiverCoverage: decision.state === 'refresh' ? undefined : report.receiverCoverage,
    receiverMode: decision.state !== 'refresh' && report.receiverObligations ? receiverModes[report.receiverObligations.branch] : undefined,
    blockingCount: decision.failures.length, groups: decision.state === 'refresh' ? [] : groups.filter(group => group.findings.length),
    message: decision.state === 'refresh' ? 'El informe requiere actualización antes de imprimir.' : decision.state === 'block' ?
      `Impresión del navegador bloqueada por ${decision.failures.length} hallazgo(s) confirmado(s).` :
      'Sin fallos que bloqueen la impresión del navegador en este contexto. La cobertura puede estar incompleta.' };
}
