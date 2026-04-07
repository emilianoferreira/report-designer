import { TestBed } from '@angular/core/testing';
import { SelectionService } from './selection.service';
import { TemplateStateService } from './template-state.service';

describe('SelectionService', () => {
  let service: SelectionService;
  let templateState: TemplateStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SelectionService);
    templateState = TestBed.inject(TemplateStateService);
  });

  // ─── Initial State ───

  describe('initial state', () => {
    it('should have empty selection', () => {
      expect(service.getSelectedIds().size).toBe(0);
    });

    it('should report no selection', () => {
      expect(service.hasSelection()).toBe(false);
    });

    it('should have "header" as default active section', () => {
      expect(service.getActiveSection()).toBe('header');
    });

    it('should return null for primary selected', () => {
      expect(service.getPrimarySelected()).toBeNull();
    });
  });

  // ─── select ───

  describe('select', () => {
    it('should select a single element', () => {
      service.select('el-1');
      expect(service.isSelected('el-1')).toBe(true);
      expect(service.getSelectedIds().size).toBe(1);
    });

    it('should replace previous selection', () => {
      service.select('el-1');
      service.select('el-2');
      expect(service.isSelected('el-1')).toBe(false);
      expect(service.isSelected('el-2')).toBe(true);
    });

    it('should set active section when provided', () => {
      service.select('el-1', 'detail');
      expect(service.getActiveSection()).toBe('detail');
    });
  });

  // ─── toggleSelect ───

  describe('toggleSelect', () => {
    it('should add element if not selected', () => {
      service.toggleSelect('el-1');
      expect(service.isSelected('el-1')).toBe(true);
    });

    it('should remove element if already selected', () => {
      service.select('el-1');
      service.toggleSelect('el-1');
      expect(service.isSelected('el-1')).toBe(false);
    });

    it('should allow multi-selection via toggle', () => {
      service.select('el-1');
      service.toggleSelect('el-2');
      expect(service.isSelected('el-1')).toBe(true);
      expect(service.isSelected('el-2')).toBe(true);
      expect(service.getSelectedIds().size).toBe(2);
    });

    it('should set active section when provided', () => {
      service.toggleSelect('el-1', 'footer');
      expect(service.getActiveSection()).toBe('footer');
    });
  });

  // ─── selectMultiple ───

  describe('selectMultiple', () => {
    it('should select exact list of IDs', () => {
      service.selectMultiple(['a', 'b', 'c']);
      expect(service.getSelectedIds().size).toBe(3);
      expect(service.isSelected('a')).toBe(true);
      expect(service.isSelected('b')).toBe(true);
      expect(service.isSelected('c')).toBe(true);
    });

    it('should replace previous selection', () => {
      service.select('old');
      service.selectMultiple(['new-1', 'new-2']);
      expect(service.isSelected('old')).toBe(false);
      expect(service.getSelectedIds().size).toBe(2);
    });
  });

  // ─── clearSelection ───

  describe('clearSelection', () => {
    it('should empty the selection', () => {
      service.select('el-1');
      service.clearSelection();
      expect(service.hasSelection()).toBe(false);
      expect(service.getSelectedIds().size).toBe(0);
    });
  });

  // ─── isSelected ───

  describe('isSelected', () => {
    it('should return true for selected element', () => {
      service.select('el-1');
      expect(service.isSelected('el-1')).toBe(true);
    });

    it('should return false for unselected element', () => {
      expect(service.isSelected('el-1')).toBe(false);
    });
  });

  // ─── hasSelection ───

  describe('hasSelection', () => {
    it('should return true when something is selected', () => {
      service.select('el-1');
      expect(service.hasSelection()).toBe(true);
    });

    it('should return false when nothing is selected', () => {
      expect(service.hasSelection()).toBe(false);
    });
  });

  // ─── getPrimarySelected ───

  describe('getPrimarySelected', () => {
    it('should return the first selected ID', () => {
      service.select('el-1');
      expect(service.getPrimarySelected()).toBe('el-1');
    });

    it('should return null when empty', () => {
      expect(service.getPrimarySelected()).toBeNull();
    });
  });

  // ─── setActiveSection ───

  describe('setActiveSection', () => {
    it('should change to detail', () => {
      service.setActiveSection('detail');
      expect(service.getActiveSection()).toBe('detail');
    });

    it('should change to footer', () => {
      service.setActiveSection('footer');
      expect(service.getActiveSection()).toBe('footer');
    });
  });

  // ─── selectAll ───

  describe('selectAll', () => {
    it('should select all elements in the active section', () => {
      const elements = templateState.getElements('header');
      service.selectAll('header');
      expect(service.getSelectedIds().size).toBe(elements.length);
    });

    it('should use explicit section parameter', () => {
      const footerElements = templateState.getElements('footer');
      service.selectAll('footer');
      expect(service.getSelectedIds().size).toBe(footerElements.length);
      expect(service.getActiveSection()).toBe('footer');
    });
  });

  // ─── selectedElements$ observable ───

  describe('selectedElements$', () => {
    it('should emit selected elements', (done) => {
      const elements = templateState.getElements('header');
      if (elements.length === 0) {
        done();
        return;
      }
      const firstId = elements[0].id;
      service.select(firstId, 'header');

      service.selectedElements$.subscribe(selected => {
        if (selected.length > 0) {
          expect(selected[0].id).toBe(firstId);
          done();
        }
      });
    });
  });
});
