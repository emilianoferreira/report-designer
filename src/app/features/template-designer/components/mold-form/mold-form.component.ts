/**
 * Mold Form Component
 * Modal dialog for creating or editing mold metadata (name, type, description).
 */
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportStartingPoint } from '../../data/blank-report';
import {
  CompanyDocumentType,
  DOCUMENT_TYPE_LABELS,
  TemplateMold
} from '../../../../core/models/template.model';

export interface MoldFormData {
  name: string;
  documentType: CompanyDocumentType;
  description: string;
  startingPoint: ReportStartingPoint;
}

@Component({
  selector: 'app-mold-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mold-form.component.html',
  styleUrl: './mold-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MoldFormComponent implements AfterViewInit, OnDestroy {
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLDialogElement>;
  private opener?: HTMLElement;
  /** If set, the form is in edit mode */
  @Input() mold: TemplateMold | null = null;
  @Input() pending = false;
  @Input() error = '';

  @Output() saved = new EventEmitter<MoldFormData>();
  @Output() cancelled = new EventEmitter<void>();

  name = '';
  documentType: CompanyDocumentType = 'venta_contado';
  description = '';
  startingPoint: ReportStartingPoint = 'a4';

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

  ngAfterViewInit(): void {
    const dialog = this.dialog.nativeElement;
    const active = dialog.ownerDocument.activeElement;
    if (active instanceof HTMLElement) this.opener = active;
    dialog.showModal();
  }

  ngOnDestroy(): void {
    this.closeDialog();
  }

  onSubmit(): void {
    if (!this.isValid || this.pending) return;
    this.saved.emit({
      name: this.name.trim(),
      documentType: this.documentType,
      description: this.description.trim(),
      startingPoint: this.startingPoint
    });
  }

  onCancel(): void {
    if (this.pending) return;
    this.closeDialog();
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog.nativeElement) this.onCancel();
  }

  private closeDialog(): void {
    const dialog = this.dialog.nativeElement;
    if (!dialog.open) return;
    dialog.close();
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
  }
}
