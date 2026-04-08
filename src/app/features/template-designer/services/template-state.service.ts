/**
 * Template State Service
 * Central state management for the template designer
 * Uses RxJS BehaviorSubject for reactive updates
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  ReportTemplate,
  TemplateElement,
  TemplateSections,
  SectionDefinition,
  PageSettings
} from '../../../core/models/template.model';
import { cloneElement, updateElement } from '../utils/element-factory';
import { createDefaultTemplate } from '../data/default-template';
import { PAPER_PRESETS, PaperPreset } from '../utils/coordinate-utils';

/** Valid section keys for element operations */
type SectionKey = 'header' | 'detail' | 'footer';

@Injectable({
  providedIn: 'root'
})
export class TemplateStateService {
  private templateSubject: BehaviorSubject<ReportTemplate>;
  public template$: Observable<ReportTemplate>;

  // ─── Undo/Redo ───
  private undoStack: ReportTemplate[] = [];
  private redoStack: ReportTemplate[] = [];
  private readonly MAX_UNDO = 50;
  /** When true, setTemplate does NOT push to undo stack (used by undo/redo itself) */
  private skipUndoPush = false;

  constructor() {
    // Initialize with a blank template
    this.templateSubject = new BehaviorSubject<ReportTemplate>(
      this.createBlankTemplate()
    );
    this.template$ = this.templateSubject.asObservable();
  }

  /**
   * Get current template snapshot
   */
  getCurrentTemplate(): ReportTemplate {
    return this.templateSubject.getValue();
  }

  /**
   * Update the entire template.
   * Pushes the previous state to the undo stack (unless called from undo/redo).
   */
  setTemplate(template: ReportTemplate): void {
    if (!this.skipUndoPush) {
      // Save current state to undo stack before replacing
      this.undoStack.push(this.deepClone(this.templateSubject.getValue()));
      if (this.undoStack.length > this.MAX_UNDO) {
        this.undoStack.shift(); // drop oldest
      }
      // Any new change clears the redo stack
      this.redoStack = [];
    }
    this.templateSubject.next({ ...template });
  }

  // ─── Undo / Redo ───

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    if (!this.canUndo) return;
    const previous = this.undoStack.pop()!;
    // Save current state to redo stack
    this.redoStack.push(this.deepClone(this.templateSubject.getValue()));
    // Restore without pushing to undo
    this.skipUndoPush = true;
    this.setTemplate(previous);
    this.skipUndoPush = false;
  }

  redo(): void {
    if (!this.canRedo) return;
    const next = this.redoStack.pop()!;
    // Save current state to undo stack
    this.undoStack.push(this.deepClone(this.templateSubject.getValue()));
    // Restore without pushing to undo
    this.skipUndoPush = true;
    this.setTemplate(next);
    this.skipUndoPush = false;
  }

  /** Clear undo/redo history (e.g. when loading a new template) */
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private deepClone(template: ReportTemplate): ReportTemplate {
    return JSON.parse(JSON.stringify(template));
  }

  /**
   * Update page settings
   */
  updatePageSettings(settings: Partial<PageSettings>): void {
    const current = this.getCurrentTemplate();
    const updated: ReportTemplate = {
      ...current,
      page: { ...current.page, ...settings }
    };
    this.setTemplate(updated);
  }

  /**
   * Change paper size by preset or custom dimensions.
   * Proportionally scales ALL elements (positions + sizes), section heights,
   * and margins to maintain the same visual layout in the new page size.
   */
  updatePaperSize(
    paperType: string,
    customWidth?: number,
    customHeight?: number
  ): void {
    const current = this.getCurrentTemplate();
    const preset = PAPER_PRESETS.find(p => p.type === paperType);
    if (!preset) return;

    const newWidth = paperType === 'custom' && customWidth ? customWidth : preset.width;
    const newHeight = paperType === 'custom' && customHeight ? customHeight : preset.height;

    const oldWidth = current.page.width;
    const oldHeight = current.page.height;

    // Nothing to do if dimensions are identical
    if (newWidth === oldWidth && newHeight === oldHeight) {
      // Still update paperType in case it changed (e.g. a4 → custom with same dims)
      this.setTemplate({
        ...current,
        page: { ...current.page, paperType: paperType as any, dynamicHeight: preset.dynamicHeight }
      });
      return;
    }

    // Scale ratios
    const scaleX = newWidth / oldWidth;
    const scaleY = newHeight / oldHeight;

    // Scale margins
    const newMargins = preset.type !== 'custom' ? { ...preset.defaultMargins } : {
      top: Math.round(current.page.margins.top * scaleY * 10) / 10,
      bottom: Math.round(current.page.margins.bottom * scaleY * 10) / 10,
      left: Math.round(current.page.margins.left * scaleX * 10) / 10,
      right: Math.round(current.page.margins.right * scaleX * 10) / 10
    };

    // Scale section heights proportionally
    const headerH = Math.round(current.sections.header.height * scaleY * 10) / 10;
    const detailH = Math.round(current.sections.detail.height * scaleY * 10) / 10;
    const footerH = Math.round(current.sections.footer.height * scaleY * 10) / 10;

    // Helper: scale all elements within a section
    const scaleElements = (elements: TemplateElement[]): TemplateElement[] =>
      elements.map(el => ({
        ...el,
        position: {
          x: Math.round(el.position.x * scaleX * 10) / 10,
          y: Math.round(el.position.y * scaleY * 10) / 10
        },
        size: {
          width: Math.round(el.size.width * scaleX * 10) / 10,
          height: Math.round(el.size.height * scaleY * 10) / 10
        }
      }));

    const updated: ReportTemplate = {
      ...current,
      page: {
        ...current.page,
        paperType: paperType as any,
        width: newWidth,
        height: newHeight,
        dynamicHeight: preset.dynamicHeight,
        margins: newMargins
      },
      sections: {
        ...current.sections,
        header: {
          ...current.sections.header,
          height: headerH,
          elements: scaleElements(current.sections.header.elements)
        },
        detail: {
          ...current.sections.detail,
          height: detailH,
          elements: scaleElements(current.sections.detail.elements)
        },
        footer: {
          ...current.sections.footer,
          height: footerH,
          elements: scaleElements(current.sections.footer.elements)
        }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Add a new element to a section
   * @param sectionKey - 'header', 'detail', or 'footer'
   * @param element - Element to add
   */
  addElement(sectionKey: SectionKey, element: TemplateElement): void {
    const current = this.getCurrentTemplate();
    const section = current.sections[sectionKey];

    if (!section) {
      console.error(`Section ${sectionKey} not found`);
      return;
    }

    const updated: ReportTemplate = {
      ...current,
      sections: {
        ...current.sections,
        [sectionKey]: {
          ...section,
          elements: [...section.elements, element]
        }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Update an element in-place
   * @param sectionKey - Section containing the element
   * @param elementId - Element ID to update
   * @param updates - Partial element updates
   */
  updateElement(
    sectionKey: SectionKey,
    elementId: string,
    updates: Partial<TemplateElement>
  ): void {
    const current = this.getCurrentTemplate();
    const section = current.sections[sectionKey];

    if (!section) {
      console.error(`Section ${sectionKey} not found`);
      return;
    }

    const updated: ReportTemplate = {
      ...current,
      sections: {
        ...current.sections,
        [sectionKey]: {
          ...section,
          elements: section.elements.map(el =>
            el.id === elementId ? updateElement(el, updates) : el
          )
        }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Move an element from one section to another in a single atomic
   * operation (one history snapshot). If `fromSection === toSection`
   * this degrades to `updateElement` with the new position.
   *
   * The new position is applied in the **destination** section's local
   * coordinate space — callers are responsible for rebasing y from the
   * origin section to the destination section before invoking.
   */
  moveElementToSection(
    fromSection: SectionKey,
    toSection: SectionKey,
    elementId: string,
    newPosition: { x: number; y: number }
  ): void {
    const current = this.getCurrentTemplate();
    const from = current.sections[fromSection];
    const to = current.sections[toSection];

    if (!from || !to) {
      console.error(`moveElementToSection: section not found (${fromSection} or ${toSection})`);
      return;
    }

    const element = from.elements.find(el => el.id === elementId);
    if (!element) {
      console.error(`moveElementToSection: element ${elementId} not found in ${fromSection}`);
      return;
    }

    // Same section → delegate to updateElement (single snapshot, no reparent).
    if (fromSection === toSection) {
      this.updateElement(fromSection, elementId, { position: newPosition } as Partial<TemplateElement>);
      return;
    }

    const movedElement = updateElement(element, {
      position: newPosition
    } as Partial<TemplateElement>);

    const updated: ReportTemplate = {
      ...current,
      sections: {
        ...current.sections,
        [fromSection]: {
          ...from,
          elements: from.elements.filter(el => el.id !== elementId)
        },
        [toSection]: {
          ...to,
          elements: [...to.elements, movedElement]
        }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Remove an element
   */
  removeElement(sectionKey: SectionKey, elementId: string): void {
    const current = this.getCurrentTemplate();
    const section = current.sections[sectionKey];

    if (!section) {
      console.error(`Section ${sectionKey} not found`);
      return;
    }

    const updated: ReportTemplate = {
      ...current,
      sections: {
        ...current.sections,
        [sectionKey]: {
          ...section,
          elements: section.elements.filter(el => el.id !== elementId)
        }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Duplicate an element
   */
  duplicateElement(sectionKey: SectionKey, elementId: string): void {
    const current = this.getCurrentTemplate();
    const section = current.sections[sectionKey];
    const element = section?.elements.find(el => el.id === elementId);

    if (!element) {
      console.error(`Element ${elementId} not found`);
      return;
    }

    const cloned = cloneElement(element);
    this.addElement(sectionKey, cloned);
  }

  /**
   * Reorder element by z-index
   */
  reorderElement(
    sectionKey: SectionKey,
    elementId: string,
    direction: 'front' | 'back'
  ): void {
    const current = this.getCurrentTemplate();
    const section = current.sections[sectionKey];

    if (!section) {
      console.error(`Section ${sectionKey} not found`);
      return;
    }

    const maxZIndex = Math.max(...section.elements.map(el => el.zIndex), 0);
    const minZIndex = Math.min(...section.elements.map(el => el.zIndex), 0);

    const updated: ReportTemplate = {
      ...current,
      sections: {
        ...current.sections,
        [sectionKey]: {
          ...section,
          elements: section.elements.map(el => {
            if (el.id === elementId) {
              return {
                ...el,
                zIndex: direction === 'front' ? maxZIndex + 1 : minZIndex - 1
              };
            }
            return el;
          })
        }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Get elements from a specific section
   */
  getElements(sectionKey: SectionKey): TemplateElement[] {
    const section = this.getCurrentTemplate().sections[sectionKey];
    return section?.elements || [];
  }

  /**
   * Get a single element by ID
   */
  getElement(
    sectionKey: SectionKey,
    elementId: string
  ): TemplateElement | undefined {
    return this.getElements(sectionKey).find(el => el.id === elementId);
  }

  /**
   * Update multiple elements in a single emission (batch update).
   * Used by multi-drag and multi-property editing to avoid N separate emissions.
   */
  updateMultipleElements(
    sectionKey: SectionKey,
    updates: Array<{ id: string; changes: Partial<TemplateElement> }>
  ): void {
    const current = this.getCurrentTemplate();
    const section = current.sections[sectionKey];

    if (!section) {
      console.error(`Section ${sectionKey} not found`);
      return;
    }

    const updateMap = new Map(updates.map(u => [u.id, u.changes]));
    const updated: ReportTemplate = {
      ...current,
      sections: {
        ...current.sections,
        [sectionKey]: {
          ...section,
          elements: section.elements.map(el =>
            updateMap.has(el.id) ? updateElement(el, updateMap.get(el.id)!) : el
          )
        }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Move multiple elements from one section to another in a single atomic
   * operation. All elements must originate from `fromSection`. If
   * `fromSection === toSection`, degrades to `updateMultipleElements`.
   */
  moveMultipleElementsToSection(
    fromSection: SectionKey,
    toSection: SectionKey,
    updates: Array<{ id: string; position: { x: number; y: number } }>
  ): void {
    if (fromSection === toSection) {
      this.updateMultipleElements(
        fromSection,
        updates.map(u => ({ id: u.id, changes: { position: u.position } as Partial<TemplateElement> }))
      );
      return;
    }

    const current = this.getCurrentTemplate();
    const from = current.sections[fromSection];
    const to = current.sections[toSection];

    if (!from || !to) {
      console.error(`moveMultipleElementsToSection: section not found (${fromSection} or ${toSection})`);
      return;
    }

    const moveMap = new Map(updates.map(u => [u.id, u.position]));
    const moving: TemplateElement[] = [];
    const remaining: TemplateElement[] = [];
    for (const el of from.elements) {
      if (moveMap.has(el.id)) {
        moving.push(updateElement(el, { position: moveMap.get(el.id)! } as Partial<TemplateElement>));
      } else {
        remaining.push(el);
      }
    }

    if (moving.length === 0) return;

    const updated: ReportTemplate = {
      ...current,
      sections: {
        ...current.sections,
        [fromSection]: { ...from, elements: remaining },
        [toSection]: { ...to, elements: [...to.elements, ...moving] }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Clear all elements from a section
   */
  clearSection(sectionKey: SectionKey): void {
    const current = this.getCurrentTemplate();
    const updated: ReportTemplate = {
      ...current,
      sections: {
        ...current.sections,
        [sectionKey]: {
          ...current.sections[sectionKey],
          elements: []
        }
      }
    };
    this.setTemplate(updated);
  }

  /**
   * Create the initial template.
   * Uses the pre-built invoice template so the canvas is not empty.
   */
  private createBlankTemplate(): ReportTemplate {
    return createDefaultTemplate();
  }
}
