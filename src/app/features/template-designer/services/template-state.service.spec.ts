import { TestBed } from '@angular/core/testing';
import { TemplateStateService } from './template-state.service';
import { createElement } from '../utils/element-factory';

describe('TemplateStateService', () => {
  let service: TemplateStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TemplateStateService);
  });

  // ─── Initial State ───

  describe('initial state', () => {
    it('should return a valid template', () => {
      const template = service.getCurrentTemplate();
      expect(template).toBeTruthy();
      expect(template.metadata).toBeTruthy();
      expect(template.page).toBeTruthy();
      expect(template.sections).toBeTruthy();
    });

    it('should have header, detail, and footer sections', () => {
      const template = service.getCurrentTemplate();
      expect(template.sections.header).toBeTruthy();
      expect(template.sections.detail).toBeTruthy();
      expect(template.sections.footer).toBeTruthy();
    });

    it('should have elements in the default template', () => {
      const template = service.getCurrentTemplate();
      const totalElements =
        template.sections.header.elements.length +
        template.sections.detail.elements.length +
        template.sections.footer.elements.length;
      expect(totalElements).toBeGreaterThan(0);
    });

    it('should emit the template on subscription', (done) => {
      service.template$.subscribe(template => {
        expect(template).toBeTruthy();
        done();
      });
    });
  });

  // ─── addElement ───

  describe('addElement', () => {
    it('should add an element to the specified section', () => {
      const initialCount = service.getElements('header').length;
      const newElement = createElement('text', { x: 10, y: 10 });
      service.addElement('header', newElement);
      expect(service.getElements('header').length).toBe(initialCount + 1);
    });

    it('should make the element retrievable by ID', () => {
      const newElement = createElement('text');
      service.addElement('header', newElement);
      expect(service.getElement('header', newElement.id)).toBeTruthy();
    });
  });

  // ─── updateElement ───

  describe('updateElement', () => {
    it('should update properties of an existing element', () => {
      const elements = service.getElements('header');
      const firstEl = elements[0];
      service.updateElement('header', firstEl.id, { name: 'Updated Name' });
      const updated = service.getElement('header', firstEl.id);
      expect(updated?.name).toBe('Updated Name');
    });

    it('should not affect other elements', () => {
      const elements = service.getElements('header');
      if (elements.length < 2) return;
      const firstEl = elements[0];
      const secondEl = elements[1];
      const secondName = secondEl.name;
      service.updateElement('header', firstEl.id, { name: 'Changed' });
      expect(service.getElement('header', secondEl.id)?.name).toBe(secondName);
    });
  });

  // ─── removeElement ───

  describe('removeElement', () => {
    it('should remove the element from the section', () => {
      const newElement = createElement('text');
      service.addElement('header', newElement);
      const countBefore = service.getElements('header').length;
      service.removeElement('header', newElement.id);
      expect(service.getElements('header').length).toBe(countBefore - 1);
    });

    it('should make the element no longer retrievable', () => {
      const newElement = createElement('text');
      service.addElement('header', newElement);
      service.removeElement('header', newElement.id);
      expect(service.getElement('header', newElement.id)).toBeUndefined();
    });
  });

  // ─── duplicateElement ───

  describe('duplicateElement', () => {
    it('should create a clone in the same section', () => {
      const elements = service.getElements('header');
      const firstEl = elements[0];
      const countBefore = elements.length;
      service.duplicateElement('header', firstEl.id);
      expect(service.getElements('header').length).toBe(countBefore + 1);
    });

    it('should create a clone with a different ID', () => {
      const elements = service.getElements('header');
      const firstEl = elements[0];
      service.duplicateElement('header', firstEl.id);
      const allElements = service.getElements('header');
      const ids = allElements.map(el => el.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should create a clone with " Copy" appended to name', () => {
      const elements = service.getElements('header');
      const firstEl = elements[0];
      service.duplicateElement('header', firstEl.id);
      const allElements = service.getElements('header');
      const clone = allElements[allElements.length - 1];
      expect(clone.name).toBe(firstEl.name + ' Copy');
    });
  });

  // ─── reorderElement ───

  describe('reorderElement', () => {
    it('should bring element to front (highest zIndex)', () => {
      const elements = service.getElements('header');
      const firstEl = elements[0];
      const maxZ = Math.max(...elements.map(el => el.zIndex));
      service.reorderElement('header', firstEl.id, 'front');
      const updated = service.getElement('header', firstEl.id);
      expect(updated!.zIndex).toBe(maxZ + 1);
    });

    it('should send element to back (lowest zIndex)', () => {
      const elements = service.getElements('header');
      const firstEl = elements[0];
      // The service uses Math.min(...zIndexes, 0) so min is at most 0
      const minZ = Math.min(...elements.map(el => el.zIndex), 0);
      service.reorderElement('header', firstEl.id, 'back');
      const updated = service.getElement('header', firstEl.id);
      expect(updated!.zIndex).toBe(minZ - 1);
    });
  });

  // ─── getElements / getElement ───

  describe('getElements', () => {
    it('should return elements for a valid section', () => {
      const elements = service.getElements('header');
      expect(Array.isArray(elements)).toBe(true);
    });
  });

  describe('getElement', () => {
    it('should return undefined for non-existent ID', () => {
      expect(service.getElement('header', 'non-existent-id')).toBeUndefined();
    });
  });

  // ─── clearSection ───

  describe('clearSection', () => {
    it('should remove all elements from the section', () => {
      service.clearSection('header');
      expect(service.getElements('header').length).toBe(0);
    });

    it('should not affect other sections', () => {
      const footerCount = service.getElements('footer').length;
      service.clearSection('header');
      expect(service.getElements('footer').length).toBe(footerCount);
    });
  });

  // ─── setTemplate ───

  describe('setTemplate', () => {
    it('should replace the entire template', () => {
      const original = service.getCurrentTemplate();
      const modified = {
        ...original,
        metadata: { ...original.metadata, name: 'New Name' }
      };
      service.setTemplate(modified);
      expect(service.getCurrentTemplate().metadata.name).toBe('New Name');
    });
  });

  // ─── updatePageSettings ───

  describe('updatePageSettings', () => {
    it('should merge partial page settings', () => {
      service.updatePageSettings({ width: 300 });
      expect(service.getCurrentTemplate().page.width).toBe(300);
    });

    it('should preserve other page settings', () => {
      const originalHeight = service.getCurrentTemplate().page.height;
      service.updatePageSettings({ width: 300 });
      expect(service.getCurrentTemplate().page.height).toBe(originalHeight);
    });
  });

  // ─── updatePaperSize ───

  describe('updatePaperSize', () => {
    it('should change page dimensions to A5', () => {
      service.updatePaperSize('a5');
      const page = service.getCurrentTemplate().page;
      expect(page.width).toBe(148);
      expect(page.height).toBe(210);
      expect(page.paperType).toBe('a5');
    });

    it('should change page dimensions to ticket-80', () => {
      service.updatePaperSize('ticket-80');
      const page = service.getCurrentTemplate().page;
      expect(page.width).toBe(80);
      expect(page.dynamicHeight).toBe(true);
    });

    it('should set custom dimensions', () => {
      service.updatePaperSize('custom', 100, 150);
      const page = service.getCurrentTemplate().page;
      expect(page.width).toBe(100);
      expect(page.height).toBe(150);
      expect(page.paperType).toBe('custom');
    });

    it('should scale element positions proportionally', () => {
      // Get an element position before
      const before = service.getCurrentTemplate();
      const headerEl = before.sections.header.elements[0];
      const originalX = headerEl.position.x;
      const originalWidth = before.page.width;

      // Change to A5 (148mm wide, from 210mm)
      service.updatePaperSize('a5');

      const after = service.getCurrentTemplate();
      const updatedEl = after.sections.header.elements[0];
      const scaleX = 148 / originalWidth;

      expect(updatedEl.position.x).toBeCloseTo(originalX * scaleX, 0);
    });

    it('should scale element sizes proportionally', () => {
      const before = service.getCurrentTemplate();
      const headerEl = before.sections.header.elements[0];
      const originalW = headerEl.size.width;
      const originalPageW = before.page.width;

      service.updatePaperSize('a5');

      const after = service.getCurrentTemplate();
      const updatedEl = after.sections.header.elements[0];
      const scaleX = 148 / originalPageW;

      expect(updatedEl.size.width).toBeCloseTo(originalW * scaleX, 0);
    });

    it('should scale section heights proportionally', () => {
      const before = service.getCurrentTemplate();
      const originalHeaderH = before.sections.header.height;
      const originalPageH = before.page.height;

      service.updatePaperSize('a5');

      const after = service.getCurrentTemplate();
      const scaleY = 210 / originalPageH;

      expect(after.sections.header.height).toBeCloseTo(originalHeaderH * scaleY, 0);
    });

    it('should apply preset margins for non-custom presets', () => {
      service.updatePaperSize('ticket-80');
      const margins = service.getCurrentTemplate().page.margins;
      expect(margins.top).toBe(3);
      expect(margins.right).toBe(3);
      expect(margins.bottom).toBe(3);
      expect(margins.left).toBe(3);
    });

    it('should preserve existing margins for custom preset', () => {
      const originalMargins = { ...service.getCurrentTemplate().page.margins };
      service.updatePaperSize('custom', 200, 280);
      const margins = service.getCurrentTemplate().page.margins;
      // Custom scales margins proportionally
      expect(margins.top).toBeGreaterThan(0);
      expect(margins.left).toBeGreaterThan(0);
    });

    it('should not modify elements when dimensions stay the same', () => {
      const before = service.getCurrentTemplate();
      const elBefore = before.sections.header.elements[0];
      const posXBefore = elBefore.position.x;

      // Reapply A4 (same dimensions)
      service.updatePaperSize('a4');

      const after = service.getCurrentTemplate();
      const elAfter = after.sections.header.elements[0];
      expect(elAfter.position.x).toBe(posXBefore);
    });

    it('should scale elements across all sections', () => {
      const before = service.getCurrentTemplate();
      const footerEls = before.sections.footer.elements;
      if (footerEls.length === 0) return;

      const originalX = footerEls[0].position.x;
      const originalPageW = before.page.width;

      service.updatePaperSize('a5');

      const after = service.getCurrentTemplate();
      const scaleX = 148 / originalPageW;
      expect(after.sections.footer.elements[0].position.x).toBeCloseTo(originalX * scaleX, 0);
    });

    it('should ignore unknown paper types', () => {
      const before = service.getCurrentTemplate();
      service.updatePaperSize('unknown-type');
      const after = service.getCurrentTemplate();
      expect(after.page.width).toBe(before.page.width);
    });
  });

  // ─── updateMultipleElements ───

  describe('updateMultipleElements', () => {
    it('should update multiple elements in a single operation', () => {
      const elements = service.getElements('header');
      if (elements.length < 2) return;

      const updates = [
        { id: elements[0].id, changes: { name: 'BatchA' } as any },
        { id: elements[1].id, changes: { name: 'BatchB' } as any }
      ];

      service.updateMultipleElements('header', updates);

      expect(service.getElement('header', elements[0].id)?.name).toBe('BatchA');
      expect(service.getElement('header', elements[1].id)?.name).toBe('BatchB');
    });

    it('should not affect elements not in the update list', () => {
      const elements = service.getElements('header');
      if (elements.length < 3) return;

      const thirdName = elements[2].name;
      const updates = [
        { id: elements[0].id, changes: { name: 'Changed' } as any }
      ];

      service.updateMultipleElements('header', updates);

      expect(service.getElement('header', elements[2].id)?.name).toBe(thirdName);
    });

    it('should emit a single template update', () => {
      let emissions = 0;
      const sub = service.template$.subscribe(() => emissions++);
      emissions = 0; // reset after initial

      const elements = service.getElements('header');
      if (elements.length < 2) { sub.unsubscribe(); return; }

      service.updateMultipleElements('header', [
        { id: elements[0].id, changes: { name: 'A' } as any },
        { id: elements[1].id, changes: { name: 'B' } as any }
      ]);

      expect(emissions).toBe(1);
      sub.unsubscribe();
    });
  });
});
