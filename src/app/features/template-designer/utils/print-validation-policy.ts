import { ValidationContext } from '../../../core/models/fiscal.model';
import { RuleResult } from './static-fiscal-rules';

export interface PrintReport { scope: string; results: RuleResult[]; }
export type PrintDecision =
  | { state: 'allow'; failures: RuleResult[] }
  | { state: 'block'; failures: RuleResult[] }
  | { state: 'refresh'; failures: RuleResult[] };

/** Candidate failures only. Fiscal applicability and artifact freshness are checked by decideBrowserPrint. */
export function confirmedPrintFailures(report: PrintReport): RuleResult[] {
  if (report.scope !== 'rendered-browser') return [];
  return report.results.filter(result => result.output === 'browser' && result.status === 'fail' &&
    (result.category === 'normative' ||
      (result.category === 'technical' && ['TEC-OVERLAP', 'TEC-CLIP'].includes(result.ruleId) && result.evidenceIds.length > 0)));
}

/** Pure, shared policy. A missing/stale report requires preparation, not a fiscal violation. */
export function decideBrowserPrint(context: ValidationContext, report: PrintReport | undefined,
  artifactSnapshot: string, currentSnapshot: string): PrintDecision {
  if (!report || report.scope !== 'rendered-browser' || !artifactSnapshot || artifactSnapshot !== currentSnapshot) {
    return { state: 'refresh', failures: [] };
  }
  const fiscal = context.facts.isCfe;
  const failures = fiscal.state === 'known' && fiscal.value === true ? confirmedPrintFailures(report) : [];
  return { state: failures.length ? 'block' : 'allow', failures };
}
