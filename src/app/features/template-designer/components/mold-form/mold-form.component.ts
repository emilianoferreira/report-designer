/**
 * Mold Form Component
 * Modal dialog for creating or editing mold metadata (name, type, description).
 */
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CompanyDocumentType,
  DOCUMENT_TYPE_LABELS,
  TemplateMold
} from '../../../../core/models/template.model';

export interface MoldFormData {
  name: string;
  documentType: CompanyDocumentType;
  description: string;
}

@Component({
  selector: 'app-mold-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mold-form.component.html',
  styleUrl: './mold-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MoldFormComponent {
  /** If set, the form is in edit mode */
  @Input() mold: TemplateMold | null = null;

  @Output() saved = new EventEmitter<MoldFormData>();
  @Output() cancelled = new EventEmitter<void>();

  name = '';
  documentType: CompanyDocumentType = 'venta_contado';
  description = '';

  documentTypes = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
    value: value as CompanyDocumentType,
    label
  }));

  get isEdit(): boolean {
    return !!this.mold;
  }

  get title(): string {
    return this.isEdit ? 'Editar molde' : 'Nuevo molde de impresión';
  }

  get isValid(): boolean {
    return this.name.trim().length > 0;
  }

  ngOnInit(): void {
    if (this.mold) {
      this.name = this.mold.name;
      this.documentType = this.mold.documentType;
      this.description = this.mold.description;
    }
  }

  onSubmit(): void {
    if (!this.isValid) return;
    this.saved.emit({
      name: this.name.trim(),
      documentType: this.documentType,
      description: this.description.trim()
    });
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
