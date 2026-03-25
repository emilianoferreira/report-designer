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
 * A4 page dimensions in millimeters
 */
export const PAGE_SIZES = {
  A4_PORTRAIT: { width: 210, height: 297 },
  A4_LANDSCAPE: { width: 297, height: 210 },
  A3_PORTRAIT: { width: 297, height: 420 },
  A3_LANDSCAPE: { width: 420, height: 297 },
  LETTER: { width: 215.9, height: 279.4 }
};

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
