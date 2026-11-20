/** Output-independent contracts. No dependency on either designer or on geometry. */
export type ComplianceStatus = 'pass' | 'fail' | 'not-applicable' | 'pending';
export type FindingSeverity = 'error' | 'warning' | 'info';
export type ValidationOutput = 'browser' | 'zureo';
export interface ContentIdentity {
  instanceId: string;
  origin: 'template' | 'generated';
  elementId?: string;
  section?: string;
  sourcePaths: string[];
  /** Semantic claims, never evidence of visibility or legal compliance. */
  roles: string[];
  zones: string[];
}
export interface ValidationFinding {
  /** Canonical field/instance addressed by this finding, independent of rule identity. */
  fieldPath?: string;
  page?: number;
  findingId: string;
  ruleId: string;
  status: ComplianceStatus;
  severity: FindingSeverity;
  output: ValidationOutput;
  evidenceIds: string[];
}
