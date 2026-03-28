import {
  mmToPx,
  pxToMm,
  ptToMm,
  mmToPt,
  snapToGrid,
  constrainToPage,
  calculateAspectRatio,
  applyAspectRatio,
  formatMm,
  parseMm,
  PAGE_SIZES,
  DEFAULT_MARGINS,
  A4_DIMENSIONS_PX
} from './coordinate-utils';

describe('coordinate-utils', () => {

  // ─── mmToPx / pxToMm ───

  describe('mmToPx', () => {
    it('should convert 25.4mm to 96px at 96 DPI (1 inch)', () => {
      expect(mmToPx(25.4)).toBeCloseTo(96, 1);
    });

    it('should return 0 for 0mm', () => {
      expect(mmToPx(0)).toBe(0);
    });

    it('should handle negative values', () => {
      expect(mmToPx(-10)).toBeCloseTo(-37.795, 1);
    });

    it('should support custom DPI', () => {
      expect(mmToPx(25.4, 72)).toBeCloseTo(72, 1);
    });
  });

  describe('pxToMm', () => {
    it('should convert 96px to 25.4mm at 96 DPI', () => {
      expect(pxToMm(96)).toBeCloseTo(25.4, 1);
    });

    it('should return 0 for 0px', () => {
      expect(pxToMm(0)).toBe(0);
    });

    it('should support custom DPI', () => {
      expect(pxToMm(72, 72)).toBeCloseTo(25.4, 1);
    });
  });

  describe('mmToPx / pxToMm round-trip', () => {
    it('should be identity for positive values', () => {
      expect(pxToMm(mmToPx(42.5))).toBeCloseTo(42.5, 6);
    });

    it('should be identity for negative values', () => {
      expect(pxToMm(mmToPx(-15))).toBeCloseTo(-15, 6);
    });
  });

  // ─── ptToMm / mmToPt ───

  describe('ptToMm', () => {
    it('should convert 1pt to ~0.35278mm', () => {
      expect(ptToMm(1)).toBeCloseTo(0.35278, 4);
    });

    it('should convert 72pt to ~25.4mm (1 inch)', () => {
      expect(ptToMm(72)).toBeCloseTo(25.4, 0);
    });
  });

  describe('mmToPt', () => {
    it('should convert 0.35278mm to ~1pt', () => {
      expect(mmToPt(0.35278)).toBeCloseTo(1, 2);
    });
  });

  describe('ptToMm / mmToPt round-trip', () => {
    it('should be identity', () => {
      expect(mmToPt(ptToMm(12))).toBeCloseTo(12, 4);
    });
  });

  // ─── snapToGrid ───

  describe('snapToGrid', () => {
    it('should return value on grid unchanged', () => {
      expect(snapToGrid(10, 5)).toBe(10);
    });

    it('should round down when closer to lower grid line', () => {
      expect(snapToGrid(7, 5)).toBe(5);
    });

    it('should round up when closer to upper grid line', () => {
      expect(snapToGrid(8, 5)).toBe(10);
    });

    it('should use default grid size of 5', () => {
      expect(snapToGrid(12)).toBe(10);
      expect(snapToGrid(13)).toBe(15);
    });

    it('should return original value when grid size is 0', () => {
      expect(snapToGrid(7.3, 0)).toBe(7.3);
    });

    it('should return original value when grid size is negative', () => {
      expect(snapToGrid(7.3, -1)).toBe(7.3);
    });
  });

  // ─── constrainToPage ───

  describe('constrainToPage', () => {
    const margins = { top: 10, right: 10, bottom: 10, left: 10 };

    it('should not change position already within bounds', () => {
      const result = constrainToPage({ x: 50, y: 50 }, { width: 20, height: 10 }, 210, 297, margins);
      expect(result).toEqual({ x: 50, y: 50 });
    });

    it('should clamp position to left margin', () => {
      const result = constrainToPage({ x: 2, y: 50 }, { width: 20, height: 10 }, 210, 297, margins);
      expect(result.x).toBe(10);
    });

    it('should clamp position to top margin', () => {
      const result = constrainToPage({ x: 50, y: 2 }, { width: 20, height: 10 }, 210, 297, margins);
      expect(result.y).toBe(10);
    });

    it('should clamp when element extends past right margin', () => {
      const result = constrainToPage({ x: 195, y: 50 }, { width: 20, height: 10 }, 210, 297, margins);
      expect(result.x).toBe(180); // 210 - 10 - 20
    });

    it('should clamp when element extends past bottom margin', () => {
      const result = constrainToPage({ x: 50, y: 290 }, { width: 20, height: 10 }, 210, 297, margins);
      expect(result.y).toBe(277); // 297 - 10 - 10
    });
  });

  // ─── calculateAspectRatio ───

  describe('calculateAspectRatio', () => {
    it('should return correct ratio for 16:9', () => {
      expect(calculateAspectRatio(16, 9)).toBeCloseTo(16 / 9, 4);
    });

    it('should return 1 for square', () => {
      expect(calculateAspectRatio(100, 100)).toBe(1);
    });

    it('should return 1 when height is 0 (guard)', () => {
      expect(calculateAspectRatio(16, 0)).toBe(1);
    });
  });

  // ─── applyAspectRatio ───

  describe('applyAspectRatio', () => {
    it('should maintain aspect ratio based on width delta', () => {
      const result = applyAspectRatio({ width: 100, height: 50 }, { dx: 20, dy: 5 }, 2);
      expect(result.width).toBe(120);
      expect(result.height).toBeCloseTo(60, 4);
    });

    it('should use height delta when abs(dy) > abs(dx)', () => {
      const result = applyAspectRatio({ width: 100, height: 50 }, { dx: 5, dy: 20 }, 2);
      expect(result.height).toBe(70);
      expect(result.width).toBeCloseTo(140, 4);
    });

    it('should enforce minimum dimension of 1', () => {
      const result = applyAspectRatio({ width: 10, height: 5 }, { dx: -20, dy: 0 }, 2);
      expect(result.width).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── formatMm ───

  describe('formatMm', () => {
    it('should format with 1 decimal and mm suffix', () => {
      expect(formatMm(12.345)).toBe('12.3mm');
    });

    it('should format zero', () => {
      expect(formatMm(0)).toBe('0.0mm');
    });

    it('should format negative values', () => {
      expect(formatMm(-3.2)).toBe('-3.2mm');
    });
  });

  // ─── parseMm ───

  describe('parseMm', () => {
    it('should parse "12.5mm"', () => {
      expect(parseMm('12.5mm')).toBe(12.5);
    });

    it('should parse "12.5" without suffix', () => {
      expect(parseMm('12.5')).toBe(12.5);
    });

    it('should parse negative values', () => {
      expect(parseMm('-3.2mm')).toBe(-3.2);
    });

    it('should return 0 for invalid input', () => {
      expect(parseMm('abc')).toBe(0);
    });

    it('should return 0 for empty string', () => {
      expect(parseMm('')).toBe(0);
    });
  });

  // ─── Constants ───

  describe('PAGE_SIZES', () => {
    it('should have correct A4 portrait dimensions', () => {
      expect(PAGE_SIZES.A4_PORTRAIT).toEqual({ width: 210, height: 297 });
    });

    it('should have correct A4 landscape dimensions', () => {
      expect(PAGE_SIZES.A4_LANDSCAPE).toEqual({ width: 297, height: 210 });
    });

    it('should have correct Letter dimensions', () => {
      expect(PAGE_SIZES.LETTER).toEqual({ width: 215.9, height: 279.4 });
    });
  });

  describe('DEFAULT_MARGINS', () => {
    it('should have 10mm on all sides', () => {
      expect(DEFAULT_MARGINS).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    });
  });

  describe('A4_DIMENSIONS_PX', () => {
    it('should match mmToPx conversion of A4', () => {
      expect(A4_DIMENSIONS_PX.width).toBeCloseTo(mmToPx(210), 2);
      expect(A4_DIMENSIONS_PX.height).toBeCloseTo(mmToPx(297), 2);
    });
  });
});
