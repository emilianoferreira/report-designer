/**
 * Selection Service
 * Manages which elements are currently selected in the designer
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import { TemplateElement } from '../../../core/models/template.model';
import { TemplateStateService } from './template-state.service';

@Injectable({
  providedIn: 'root'
})
export class SelectionService {
  private selectedIdsSubject = new BehaviorSubject<Set<string>>(new Set());
  public selectedIds$ = this.selectedIdsSubject.asObservable();

  private activeSectionSubject = new BehaviorSubject<'header' | 'detail' | 'footer'>('header');
  public activeSection$ = this.activeSectionSubject.asObservable();

  /**
   * Observable of all currently selected elements
   * Combines selected IDs with actual element data from template state
   */
  public selectedElements$: Observable<TemplateElement[]>;

  constructor(private templateStateService: TemplateStateService) {
    this.selectedElements$ = combineLatest([
      this.selectedIds$,
      this.activeSection$,
      this.templateStateService.template$
    ]).pipe(
      map(([selectedIds, activeSection, template]) => {
        const section = template.sections[activeSection];
        if (!section) return [];
        return section.elements.filter(el => selectedIds.has(el.id));
      })
    );
  }

  /**
   * Get current selected IDs as a snapshot
   */
  getSelectedIds(): Set<string> {
    return new Set(this.selectedIdsSubject.getValue());
  }

  /**
   * Get current active section
   */
  getActiveSection(): 'header' | 'detail' | 'footer' {
    return this.activeSectionSubject.getValue();
  }

  /**
   * Select a single element, deselecting others
   */
  select(elementId: string, section?: 'header' | 'detail' | 'footer'): void {
    if (section) {
      this.activeSectionSubject.next(section);
    }
    this.selectedIdsSubject.next(new Set([elementId]));
  }

  /**
   * Toggle selection of an element (Shift+Click behavior)
   */
  toggleSelect(elementId: string, section?: 'header' | 'detail' | 'footer'): void {
    if (section) {
      this.activeSectionSubject.next(section);
    }

    const current = this.getSelectedIds();
    if (current.has(elementId)) {
      current.delete(elementId);
    } else {
      current.add(elementId);
    }
    this.selectedIdsSubject.next(new Set(current));
  }

  /**
   * Select multiple elements
   */
  selectMultiple(elementIds: string[], section?: 'header' | 'detail' | 'footer'): void {
    if (section) {
      this.activeSectionSubject.next(section);
    }
    this.selectedIdsSubject.next(new Set(elementIds));
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.selectedIdsSubject.next(new Set());
  }

  /**
   * Check if a specific element is selected
   */
  isSelected(elementId: string): boolean {
    return this.getSelectedIds().has(elementId);
  }

  /**
   * Check if any elements are selected
   */
  hasSelection(): boolean {
    return this.getSelectedIds().size > 0;
  }

  /**
   * Get the primary (first) selected element
   */
  getPrimarySelected(): string | null {
    const ids = this.getSelectedIds();
    return ids.size > 0 ? Array.from(ids)[0] : null;
  }

  /**
   * Set active section (for context switching)
   */
  setActiveSection(section: 'header' | 'detail' | 'footer'): void {
    this.activeSectionSubject.next(section);
  }

  /**
   * Select all elements in a section
   */
  selectAll(section?: 'header' | 'detail' | 'footer'): void {
    const activeSection = section || this.getActiveSection();
    const elements = this.templateStateService.getElements(activeSection);
    this.selectMultiple(
      elements.map(el => el.id),
      activeSection
    );
  }
}
