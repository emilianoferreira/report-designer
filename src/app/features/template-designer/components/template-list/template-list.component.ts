/**
 * Template List Component
 * Displays all saved template molds as cards with CRUD operations.
 * Entry point of the application — user picks a mold to edit or creates a new one.
 */
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TemplateMold, DOCUMENT_TYPE_LABELS, CompanyDocumentType } from '../../../../core/models/template.model';
import { TemplateStorageService } from '../../services/template-storage.service';
import { MoldFormComponent, MoldFormData } from '../mold-form/mold-form.component';

@Component({
  selector: 'app-template-list',
  standalone: true,
  imports: [CommonModule, MoldFormComponent],
  templateUrl: './template-list.component.html',
  styleUrl: './template-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateListComponent implements OnInit, OnDestroy {
  molds: TemplateMold[] = [];
  showForm = false;
  editingMold: TemplateMold | null = null;
  confirmDeleteId: string | null = null;

  private sub!: Subscription;

  constructor(
    private storage: TemplateStorageService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.sub = this.storage.molds$.subscribe(molds => {
      this.molds = molds;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  // ─── Labels ───

  getDocTypeLabel(type: CompanyDocumentType): string {
    return DOCUMENT_TYPE_LABELS[type] || type;
  }

  formatDate(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('es-UY', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }

  // ─── Actions ───

  openNewForm(): void {
    this.editingMold = null;
    this.showForm = true;
  }

  openEditForm(mold: TemplateMold): void {
    this.editingMold = mold;
    this.showForm = true;
  }

  onFormSaved(data: MoldFormData): void {
    if (this.editingMold) {
      // Edit mode
      this.storage.updateMetadata(this.editingMold.id, {
        name: data.name,
        documentType: data.documentType,
        description: data.description
      });
    } else {
      // Create mode
      const created = this.storage.create(data.name, data.documentType, data.description);
      // Navigate to the designer with the new mold
      this.router.navigate(['/designer', created.id]);
    }
    this.showForm = false;
    this.editingMold = null;
  }

  onFormCancelled(): void {
    this.showForm = false;
    this.editingMold = null;
  }

  openDesigner(mold: TemplateMold): void {
    this.router.navigate(['/designer', mold.id]);
  }

  duplicateMold(mold: TemplateMold): void {
    this.storage.duplicate(mold.id);
  }

  requestDelete(mold: TemplateMold): void {
    this.confirmDeleteId = mold.id;
  }

  confirmDelete(): void {
    if (this.confirmDeleteId) {
      this.storage.delete(this.confirmDeleteId);
      this.confirmDeleteId = null;
    }
  }

  cancelDelete(): void {
    this.confirmDeleteId = null;
  }
}
