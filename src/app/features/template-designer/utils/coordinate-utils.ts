/**
 * Coordinate Conversion Utilities
 * Handles conversion between different measurement units used in the template designer
 *
 * Critical constant: 1mm = 3.7795275591px @ 96 DPI (CSS standard)
 */

/**
 * Standard DPI for CSS/web rendering
 */
const CSS_DPI = 96;

/**
 * Conversion factor: millimeters to pixels at 96 DPI
 * Formula: mm * (DPI / 25.4) = mm * (96 / 25.4) = mm * 3.7795275591
 */
const MM_TO_PX_RATIO = CSS_DPI / 25.4;

/**
 * Conversion factor: pixels to millimeters
 */
const PX_TO_MM_RATIO = 25.4 / CSS_DPI;

/**
 * Convert millimeters to pixels
 * Used for positioning and sizing elements on screen
 * @param mm - Distance in millimeters
 * @param dpi - Optional custom DPI (defaults to CSS 96 DPI)
 * @returns Distance in pixels
 */
export function mmToPx(mm: number, dpi: number = CSS_DPI): number {
  return mm * (dpi / 25.4);
}

/**
 * Convert pixels to millimeters
 * Used when reading mouse positions and calculating layout changes
 * @param px - Distance in pixels
 * @param dpi - Optional custom DPI (defaults to CSS 96 DPI)
 * @returns Distance in millimeters
 */
export function pxToMm(px: number, dpi: number = CSS_DPI): number {
  return px * (25.4 / dpi);
}

/**
 * Convert points to millimeters
 * Font sizes are typically specified in points
 * 1 point = 1/72 inch = 0.35278 mm
 * @param pt - Size in points
 * @returns Size in millimeters
 */
export function ptToMm(pt: number): number {
  return pt * 0.35278;
}

/**
 * Convert millimeters to points
 * @param mm - Size in millimeters
 * @returns Size in points
 */
export function mmToPt(mm: number): number {
  return mm / 0.35278;
}

/**
 * Snap a value (in mm) to the nearest grid line
 * @param valueMm - Value in millimeters
 * @param gridSizeMm - Grid size in millimeters (e.g., 5 for 5mm grid)
 * @returns Snapped value in millimeters
 */
export function snapToGrid(valueMm: number, gridSizeMm: number = 5): number {
  if (gridSizeMm <= 0) return valueMm;
  return Math.round(valueMm / gridSizeMm) * gridSizeMm;
}

/**
 * Constrain a position to stay within page boundaries
 * @param position - Current position {x, y} in mm
 * @param size - Element size {width, height} in mm
 * @param pageWidth - Page width in mm
 * @param pageHeight - Page height in mm
 * @param margins - Page margins
 * @returns Constrained position
 */
export function constrainToPage(
  position: { x: number; y: number },
  size: { width: number; height: number },
  pageWidth: number,
  pageHeight: number,
  margins: { top: number; right: number; bottom: number; left: number }
): { x: number; y: number } {
  const minX = margins.left;
  const maxX = pageWidth - margins.right - size.width;
  const minY = margins.top;
  const maxY = pageHeight - margins.bottom - size.height;

  return {
    x: Math.max(minX, Math.min(position.x, maxX)),
    y: Math.max(minY, Math.min(position.y, maxY))
  };
}

/**
 * Calculate the aspect ratio of a size
 * @param width - Width in any unit
 * @param height - Height in same unit
 * @returns Aspect ratio (width / height)
 */
export function calculateAspectRatio(width: number, height: number): number {
  if (height === 0) return 1;
  return width / height;
}

/**
 * Apply aspect ratio constraint when resizing
 * @param currentSize - Current {width, height}
 * @param delta - Change in size (dx, dy)
 * @param aspectRatio - Target aspect ratio
 * @param corner - Which corner/edge was dragged ('nw', 'ne', 'sw', 'se', etc.)
 * @returns Adjusted size maintaining aspect ratio
 */
export function applyAspectRatio(
  currentSize: { width: number; height: number },
  delta: { dx: number; dy: number },
  aspectRatio: number,
  corner: string = 'se'
): { width: number; height: number } {
  let newWidth = Math.max(currentSize.width + delta.dx, 1);
  let newHeight = newWidth / aspectRatio;

  // If height constraint is tighter, use it instead
  if (Math.abs(delta.dy) > Math.abs(delta.dx)) {
    newHeight = Math.max(currentSize.height + delta.dy, 1);
    newWidth = newHeight * aspectRatio;
  }

  return { width: newWidth, height: newHeight };
}

/**
 * Format a number as mm with 1 decimal place
 * Useful for display in UI
 * @param mm - Value in millimeters
 * @returns Formatted string
 */
export function formatMm(mm: number): string {
  return `${mm.toFixed(1)}mm`;
}

/**
 * Parse a string like "12.5mm" to a number
 * @param str - String to parse
 * @returns Numeric value, or 0 if invalid
 */
export function parseMm(str: string): number {
  const match = str.match(/^([-\d.]+)\s*(?:mm)?$/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Page dimensions in millimeters
 */
export const PAGE_SIZES = {
  A4_PORTRAIT: { width: 210, height: 297 },
  A4_LANDSCAPE: { width: 297, height: 210 },
  A3_PORTRAIT: { width: 297, height: 420 },
  A3_LANDSCAPE: { width: 420, height: 297 },
  LETTER: { width: 215.9, height: 279.4 }
};

/**
 * Paper presets for the paper-size selector
 */
export interface PaperPreset {
  type: string;
  label: string;
  width: number;        // mm
  height: number;       // mm
  dynamicHeight: boolean;
  defaultMargins: { top: number; right: number; bottom: number; left: number };
}

export const PAPER_PRESETS: PaperPreset[] = [
  {
    type: 'a4',
    label: 'A4 (210 × 297 mm)',
    width: 210, height: 297,
    dynamicHeight: false,
    defaultMargins: { top: 10, right: 10, bottom: 10, left: 10 }
  },
  {
    type: 'a5',
    label: 'A5 (148 × 210 mm)',
    width: 148, height: 210,
    dynamicHeight: false,
    defaultMargins: { top: 8, right: 8, bottom: 8, left: 8 }
  },
  {
    type: 'ticket-80',
    label: 'Ticket 80 mm',
    width: 80, height: 200,
    dynamicHeight: true,
    defaultMargins: { top: 3, right: 3, bottom: 3, left: 3 }
  },
  {
    type: 'ticket-58',
    label: 'Ticket 58 mm',
    width: 58, height: 200,
    dynamicHeight: true,
    defaultMargins: { top: 2, right: 2, bottom: 2, left: 2 }
  },
  {
    type: 'custom',
    label: 'Personalizado',
    width: 210, height: 297,
    dynamicHeight: false,
    defaultMargins: { top: 10, right: 10, bottom: 10, left: 10 }
  }
];

/**
 * Default page margins in millimeters
 */
export const DEFAULT_MARGINS = {
  top: 10,
  right: 10,
  bottom: 10,
  left: 10
};

/**
 * Convert A4 dimensions to CSS pixels (for printing)
 * A4: 210mm x 297mm = 595.28pt x 841.89pt @ 72 DPI
 * At 96 DPI: 793.7px x 1122.52px
 */
export const A4_DIMENSIONS_PX = {
  width: mmToPx(210),
  height: mmToPx(297)
};

// ============================================================================
// SNAP ENGINE
// ============================================================================

import { TemplateElement } from '../../../core/models/template.model';

export interface SnapCandidate {
  value: number;       // mm position of the snap target
  source: 'grid' | 'element';
}

export interface SnapLine {
  orientation: 'horizontal' | 'vertical';
  position: number;    // mm
  source: 'element';
}

export interface SnapResult {
  x: number;
  y: number;
  snapLines: SnapLine[];
}

export interface SnapSettings {
  snapToGrid: boolean;
  snapToElement: boolean;
  thresholdMm: number;
}

/**
 * Collect all snap candidates from sibling elements.
 * Horizontal candidates = Y-axis snap targets, Vertical candidates = X-axis snap targets.
 */
export function collectSnapCandidates(
  elements: TemplateElement[],
  excludeIds: Set<string>,
  settings: SnapSettings
): { horizontal: SnapCandidate[]; vertical: SnapCandidate[] } {
  const horizontal: SnapCandidate[] = [];
  const vertical: SnapCandidate[] = [];

  if (settings.snapToElement) {
    for (const el of elements) {
      if (excludeIds.has(el.id)) continue;
      // Vertical candidates (X axis): left edge, center, right edge
      vertical.push(
        { value: el.position.x, source: 'element' },
        { value: el.position.x + el.size.width / 2, source: 'element' },
        { value: el.position.x + el.size.width, source: 'element' }
      );
      // Horizontal candidates (Y axis): top edge, center, bottom edge
      horizontal.push(
        { value: el.position.y, source: 'element' },
        { value: el.position.y + el.size.height / 2, source: 'element' },
        { value: el.position.y + el.size.height, source: 'element' }
      );
    }
  }

  return { horizontal, vertical };
}

/**
 * Find the best snap match for a single axis.
 * Tests the element's start, center, and end edges against all candidates.
 * Returns the delta to apply and the matched candidate (if any).
 */
function findBestSnap(
  edgeStart: number,
  size: number,
  candidates: SnapCandidate[],
  thresholdMm: number
): { delta: number; matched: SnapCandidate | null } {
  const edges = [edgeStart, edgeStart + size / 2, edgeStart + size];
  let bestDelta = Infinity;
  let bestCandidate: SnapCandidate | null = null;

  for (const edge of edges) {
    for (const candidate of candidates) {
      const dist = Math.abs(edge - candidate.value);
      if (dist < Math.abs(bestDelta) && dist <= thresholdMm) {
        bestDelta = candidate.value - edge;
        bestCandidate = candidate;
      }
    }
  }

  return { delta: bestDelta === Infinity ? 0 : bestDelta, matched: bestCandidate };
}

/**
 * Compute snapped position for an element given all snap candidates.
 * Falls back to grid snap if no element snap matched.
 */
export function computeSnap(
  proposedPos: { x: number; y: number },
  elementSize: { width: number; height: number },
  candidates: { horizontal: SnapCandidate[]; vertical: SnapCandidate[] },
  thresholdMm: number,
  gridSizeMm: number,
  useGridSnap: boolean
): SnapResult {
  const snapLines: SnapLine[] = [];

  // X axis (vertical candidates)
  const xSnap = findBestSnap(proposedPos.x, elementSize.width, candidates.vertical, thresholdMm);
  let finalX = proposedPos.x;
  if (xSnap.matched) {
    finalX = proposedPos.x + xSnap.delta;
    snapLines.push({
      orientation: 'vertical',
      position: xSnap.matched.value,
      source: 'element'
    });
  } else if (useGridSnap) {
    finalX = snapToGrid(proposedPos.x, gridSizeMm);
  }

  // Y axis (horizontal candidates)
  const ySnap = findBestSnap(proposedPos.y, elementSize.height, candidates.horizontal, thresholdMm);
  let finalY = proposedPos.y;
  if (ySnap.matched) {
    finalY = proposedPos.y + ySnap.delta;
    snapLines.push({
      orientation: 'horizontal',
      position: ySnap.matched.value,
      source: 'element'
    });
  } else if (useGridSnap) {
    finalY = snapToGrid(proposedPos.y, gridSizeMm);
  }

  return { x: finalX, y: finalY, snapLines };
}
