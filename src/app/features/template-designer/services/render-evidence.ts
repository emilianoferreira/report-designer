import { ContentIdentity } from '../../../core/models/validation.model';
import { FieldCoverage, FieldEvidence } from '../utils/fiscal-field-evidence';
/** Renderer observations only. No normative verdicts or DOM measurements. */
export interface RenderDiagnostic {
  code: 'expression-error' | 'missing-value' | 'generation-error' | 'unsupported-feature' | 'omitted-element' | 'resource-error';
  message: string;
  elementId?: string;
  section?: string;
}
export interface RenderEvidence {
  version: '1.0';
  elements: Array<{ id: string; section: string; emitted: boolean; roles: string[] }>;
  generated?: Array<{ id: string; kind: string; sourcePath?: string }>;
  content?: Array<ContentIdentity & { emitted: boolean; semanticSource: 'declared' | 'renderer-contract'; association: 'whole' | 'composite'; fields?: FieldEvidence[] }>;
  /** Render output alone never claims complete semantic coverage. */
  fieldCoverage?: FieldCoverage[];
  qrPayloads?: Array<{ elementId: string; payload: string }>;
  diagnostics: RenderDiagnostic[];
}
export interface RenderArtifact { html: string; evidence: RenderEvidence; inputSnapshot: string; }
