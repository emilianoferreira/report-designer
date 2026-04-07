import { createElement, cloneElement, updateElement } from './element-factory';
import { TemplateElement, ElementType } from '../../../core/models/template.model';

describe('element-factory', () => {

  // ─── createElement ───

  describe('createElement', () => {
    const allTypes: ElementType[] = ['text', 'dataField', 'formula', 'image', 'line', 'rectangle', 'qrCode', 'barcode'];

    allTypes.forEach(type => {
      it(`should create a "${type}" element with correct type`, () => {
        const el = createElement(type);
        expect(el.type).toBe(type);
      });

      it(`should create a "${type}" element with a unique ID`, () => {
        const el = createElement(type);
        expect(el.id).toBeTruthy();
        expect(typeof el.id).toBe('string');
      });
    });

    it('should use default position {x: 10, y: 10} when none provided', () => {
      const el = createElement('text');
      expect(el.position).toEqual({ x: 10, y: 10 });
    });

    it('should use custom position when provided', () => {
      const el = createElement('text', { x: 50, y: 75 });
      expect(el.position).toEqual({ x: 50, y: 75 });
    });

    it('should generate unique IDs for each element', () => {
      const el1 = createElement('text');
      const el2 = createElement('text');
      expect(el1.id).not.toBe(el2.id);
    });

    it('should apply name overrides', () => {
      const el = createElement('text', undefined, { name: 'Custom Name' });
      expect(el.name).toBe('Custom Name');
    });

    it('should throw for unknown type', () => {
      expect(() => createElement('unknown' as ElementType)).toThrowError(/Unknown element type/);
    });

    // Default sizes per type
    const expectedSizes: Record<string, { width: number; height: number }> = {
      text: { width: 40, height: 8 },
      dataField: { width: 40, height: 6 },
      formula: { width: 40, height: 6 },
      image: { width: 30, height: 20 },
      line: { width: 50, height: 0 },
      rectangle: { width: 40, height: 20 },
      qrCode: { width: 25, height: 25 },
      barcode: { width: 50, height: 15 },
    };

    Object.entries(expectedSizes).forEach(([type, size]) => {
      it(`should create "${type}" with default size ${size.width}x${size.height}mm`, () => {
        const el = createElement(type as ElementType);
        expect(el.size.width).toBe(size.width);
        expect(el.size.height).toBe(size.height);
      });
    });

    // Default names per type
    const expectedNames: Record<string, string> = {
      text: 'Text',
      dataField: 'Data Field',
      formula: 'Formula',
      image: 'Image',
      line: 'Line',
      rectangle: 'Rectangle',
      qrCode: 'QR Code',
      barcode: 'Barcode',
    };

    Object.entries(expectedNames).forEach(([type, name]) => {
      it(`should create "${type}" with default name "${name}"`, () => {
        const el = createElement(type as ElementType);
        expect(el.name).toBe(name);
      });
    });

    it('should merge size overrides', () => {
      const el = createElement('text', undefined, { size: { width: 100 } });
      expect(el.size.width).toBe(100);
      expect(el.size.height).toBe(8); // default height preserved
    });
  });

  // ─── cloneElement ───

  describe('cloneElement', () => {
    let original: TemplateElement;

    beforeEach(() => {
      original = createElement('text', { x: 20, y: 30 });
    });

    it('should return a new object (not same reference)', () => {
      const cloned = cloneElement(original);
      expect(cloned).not.toBe(original);
    });

    it('should have a different ID', () => {
      const cloned = cloneElement(original);
      expect(cloned.id).not.toBe(original.id);
      expect(cloned.id).toBeTruthy();
    });

    it('should append " Copy" to the name', () => {
      const cloned = cloneElement(original);
      expect(cloned.name).toBe(original.name + ' Copy');
    });

    it('should offset position by 2mm in both axes', () => {
      const cloned = cloneElement(original);
      expect(cloned.position.x).toBe(original.position.x + 2);
      expect(cloned.position.y).toBe(original.position.y + 2);
    });

    it('should create a deep copy (modifying clone does not affect original)', () => {
      const cloned = cloneElement(original);
      cloned.position.x = 999;
      expect(original.position.x).toBe(20);
    });

    it('should preserve the element type', () => {
      const cloned = cloneElement(original);
      expect(cloned.type).toBe(original.type);
    });
  });

  // ─── updateElement ───

  describe('updateElement', () => {
    it('should merge updates into element', () => {
      const el = createElement('text');
      const updated = updateElement(el, { name: 'Updated' } as any);
      expect(updated.name).toBe('Updated');
    });

    it('should not mutate the original element', () => {
      const el = createElement('text');
      const originalName = el.name;
      updateElement(el, { name: 'Updated' } as any);
      expect(el.name).toBe(originalName);
    });

    it('should preserve unmodified fields', () => {
      const el = createElement('text');
      const updated = updateElement(el, { name: 'Updated' } as any);
      expect(updated.type).toBe('text');
      expect(updated.position).toEqual(el.position);
      expect(updated.size).toEqual(el.size);
    });
  });
});
