/**
 * Template Storage Service
 * Persists template molds to localStorage.
 * Designed with a clean interface so it can be swapped to a REST API backend later.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { TemplateMold, CompanyDocumentType, ReportTemplate } from '../../../core/models/template.model';
import { createDefaultTemplate } from '../data/default-template';

const STORAGE_KEY = 'zureo_template_molds';

@Injectable({
  providedIn: 'root'
})
export class TemplateStorageService {

  private moldsSubject = new BehaviorSubject<TemplateMold[]>(this.loadAll());
  public molds$: Observable<TemplateMold[]> = this.moldsSubject.asObservable();

  // ─── Read ───

  /** Get all molds from storage */
  getAll(): TemplateMold[] {
    return this.moldsSubject.getValue();
  }

  /** Get a single mold by ID */
  getById(id: string): TemplateMold | undefined {
    return this.getAll().find(m => m.id === id);
  }

  // ─── Create ───

  /** Create a new mold with a blank template */
  create(
    name: string,
    documentType: CompanyDocumentType,
    description: string = '',
    companyId: string = 'default'
  ): TemplateMold {
    const now = new Date().toISOString();
    const template = createDefaultTemplate();

    // Sync template metadata with mold
    template.metadata.name = name;
    template.metadata.companyId = companyId;

    const mold: TemplateMold = {
      id: uuidv4(),
      name,
      documentType,
      description,
      companyId,
      createdAt: now,
      updatedAt: now,
      template
    };

    const molds = [...this.getAll(), mold];
    this.persist(molds);
    return mold;
  }

  // ─── Update ───

  /** Update mold metadata (name, description, documentType) */
  updateMetadata(
    id: string,
    changes: Partial<Pick<TemplateMold, 'name' | 'description' | 'documentType'>>
  ): TemplateMold | undefined {
    const molds = this.getAll();
    const index = molds.findIndex(m => m.id === id);
    if (index === -1) return undefined;

    const updated: TemplateMold = {
      ...molds[index],
      ...changes,
      updatedAt: new Date().toISOString()
    };

    // Sync template metadata name
    if (changes.name) {
      updated.template = {
        ...updated.template,
        metadata: { ...updated.template.metadata, name: changes.name }
      };
    }

    molds[index] = updated;
    this.persist([...molds]);
    return updated;
  }

  /** Save the current template design into a mold */
  saveTemplate(id: string, template: ReportTemplate): TemplateMold | undefined {
    const molds = this.getAll();
    const index = molds.findIndex(m => m.id === id);
    if (index === -1) return undefined;

    const updated: TemplateMold = {
      ...molds[index],
      template: { ...template },
      updatedAt: new Date().toISOString()
    };

    molds[index] = updated;
    this.persist([...molds]);
    return updated;
  }

  // ─── Delete ───

  /** Remove a mold */
  delete(id: string): boolean {
    const molds = this.getAll();
    const filtered = molds.filter(m => m.id !== id);
    if (filtered.length === molds.length) return false;
    this.persist(filtered);
    return true;
  }

  // ─── Duplicate ───

  /** Clone an existing mold with a new ID and name */
  duplicate(id: string): TemplateMold | undefined {
    const original = this.getById(id);
    if (!original) return undefined;

    const now = new Date().toISOString();
    const cloned: TemplateMold = {
      ...JSON.parse(JSON.stringify(original)),
      id: uuidv4(),
      name: `${original.name} (copia)`,
      createdAt: now,
      updatedAt: now
    };

    // Update template metadata
    cloned.template.metadata.id = cloned.id;
    cloned.template.metadata.name = cloned.name;

    const molds = [...this.getAll(), cloned];
    this.persist(molds);
    return cloned;
  }

  // ─── Internal ───

  private loadAll(): TemplateMold[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as TemplateMold[];
    } catch {
      console.error('Failed to load molds from localStorage');
      return [];
    }
  }

  private persist(molds: TemplateMold[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(molds));
      this.moldsSubject.next(molds);
    } catch (e) {
      console.error('Failed to save molds to localStorage', e);
    }
  }
}
