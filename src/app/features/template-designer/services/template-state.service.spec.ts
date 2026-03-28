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
});
