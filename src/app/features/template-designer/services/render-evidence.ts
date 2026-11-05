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
  qrPayloads?: Array<{ elementId: string; payload: string }>;
  diagnostics: RenderDiagnostic[];
}
export interface RenderArtifact { html: string; evidence: RenderEvidence; inputSnapshot: string; }
