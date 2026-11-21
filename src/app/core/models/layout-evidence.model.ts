import { ContentIdentity } from './validation.model';

/** CSS pixels relative to the page, before preview zoom. No fiscal semantics. */
export interface LayoutBox { x: number; y: number; width: number; height: number; }
export interface LayoutContent extends ContentIdentity {
  page: number;
  bounds: LayoutBox;
  /** Opaque painted runs, excluding whitespace and transparent interiors. */
  ink: LayoutBox[];
  kind: 'text' | 'decoration' | 'graphic';
  order: number;
  paintGroup?: string;
  certainty: 'measured' | 'unsupported';
  clipped: boolean;
}
export interface LayoutEvidence {
  output: 'browser';
  ready: boolean;
  content: LayoutContent[];
  pending: string[];
}
export interface LayoutConflict {
  id: string;
  kind: 'overlap' | 'clipped';
  status: 'fail' | 'pending';
  page: number;
  contentIds: string[];
  bounds: LayoutBox;
}
