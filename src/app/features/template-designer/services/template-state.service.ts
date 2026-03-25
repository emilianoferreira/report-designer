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
  SectionDefinition,
  PageSettings
} from '../../../core/models/template.model';
import { cloneElement, updateElement } from '../utils/element-factory';

@Injectable({
  providedIn: 'root'
})
export class TemplateStateService {
  private templateSubject: BehaviorSubject<ReportTemplate>;
  public template$: Observable<ReportTemplate>;

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
   * Update the entire template
   */
  setTemplate(template: ReportTemplate): void {
    this.templateSubject.next({ ...template });
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
   * Add a new element to a section
   * @param sectionKey - 'header', 'detail', or 'footer'
   * @param element - Element to add
   */
  addElement(sectionKey: keyof 'header' | 'detail' | 'footer', element: TemplateElement): void {
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
    sectionKey: keyof 'header' | 'detail' | 'footer',
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
   * Remove an element
   */
  removeElement(sectionKey: keyof 'header' | 'detail' | 'footer', elementId: string): void {
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
  duplicateElement(sectionKey: keyof 'header' | 'detail' | 'footer', elementId: string): void {
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
    sectionKey: keyof 'header' | 'detail' | 'footer',
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
  getElements(sectionKey: keyof 'header' | 'detail' | 'footer'): TemplateElement[] {
    const section = this.getCurrentTemplate().sections[sectionKey];
    return section?.elements || [];
  }

  /**
   * Get a single element by ID
   */
  getElement(
    sectionKey: keyof 'header' | 'detail' | 'footer',
    elementId: string
  ): TemplateElement | undefined {
    return this.getElements(sectionKey).find(el => el.id === elementId);
  }

  /**
   * Clear all elements from a section
   */
  clearSection(sectionKey: keyof 'header' | 'detail' | 'footer'): void {
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
   * Create a blank template with default settings
   */
  private createBlankTemplate(): ReportTemplate {
    return {
      schemaVersion: '1.0',
      metadata: {
        id: '',
        name: 'Untitled Template',
        description: '',
        version: 1,
        author: 'unknown',
        companyId: 'default',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        status: 'draft'
      },
      page: {
        width: 210,
        height: 297,
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
        orientation: 'portrait',
        defaultFont: {
          family: 'Arial',
          size: 10,
          weight: 'normal',
          style: 'normal',
          color: '#000000'
        }
      },
      sections: {
        header: {
          height: 60,
          backgroundColor: undefined,
          elements: [],
          printOnFirstPage: true,
          printOnLastPage: true,
          printOnEveryPage: false
        },
        detail: {
          height: 180,
          backgroundColor: undefined,
          elements: [],
          printOnFirstPage: true,
          printOnLastPage: true,
          printOnEveryPage: false,
          dataSource: 'invoiceLines',
          rowHeight: 8,
          autoGrow: false,
          showGridLines: true,
          gridLineColor: '#e0e0e0',
          gridLineWidth: 0.2
        },
        footer: {
          height: 50,
          backgroundColor: undefined,
          elements: [],
          printOnFirstPage: true,
          printOnLastPage: true,
          printOnEveryPage: true
        }
      },
      dataSources: {
        primary: {
          entity: 'invoice',
          fields: []
        },
        detail: {
          entity: 'invoiceLine',
          fields: [],
          parentKey: 'invoiceId'
        },
        lookups: {}
      },
      styles: {},
      variables: []
    };
  }
}
