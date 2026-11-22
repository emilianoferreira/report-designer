/**
 * Template List Component
 * Displays all saved template molds as cards with CRUD operations.
 * Entry point of the application — user picks a mold to edit or creates a new one.
 */
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TemplateMold, DOCUMENT_TYPE_LABELS, CompanyDocumentType } from '../../../../core/models/template.model';
import { TemplateStorageService } from '../../services/template-storage.service';
import { MoldFormComponent, MoldFormData } from '../mold-form/mold-form.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { LabelTemplate } from '../../../../core/models/price-label-template.model';
import { PriceLabelStorageService } from '../../../price-label-designer/services/price-label-storage.service';
import { isThermalCalibration, labelCalibrations } from '../../../price-label-designer/data/label-calibration';
import { labelSheetName } from '../../../price-label-designer/utils/label-layout';

@Component({
  selector: 'app-template-list',
  standalone: true,
  imports: [CommonModule, MoldFormComponent, RouterLink],
  templateUrl: './template-list.component.html',
  styleUrl: './template-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateListComponent implements OnInit, OnDestroy {
  molds: TemplateMold[] = [];
  labels: LabelTemplate[] = [];
  filter = 'all';
  loading = true;
  choosingType = false;
  readonly calibrations = labelCalibrations;
  readonly filters = [
    { value: 'all', label: 'Todos' },
    { value: 'report', label: 'Comprobantes' },
    { value: 'price-label', label: 'Etiquetas' }
  ];
  showForm = false;
  editingMold: TemplateMold | null = null;
  confirmDeleteId: string | null = null;
  labelToDelete?: { name: string; revision: number };
  labelActionPending = false;
  labelActionError = '';
  @ViewChild('cancelDeleteButton') set cancelDeleteButton(button: ElementRef<HTMLButtonElement> | undefined) {
    button?.nativeElement.focus();
  }

  private sub = new Subscription();

  constructor(
    public storage: TemplateStorageService,
    public labelStorage: PriceLabelStorageService,
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.sub.add(this.storage.molds$.subscribe(molds => {
      this.molds = molds;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.labelStorage.templates$.subscribe(labels => {
      this.labels = labels;
      this.cdr.markForCheck();
    }));
    this.sub.add(this.route.queryParamMap.subscribe(params => {
      const type = params.get('type');
      this.filter = type === 'report' || type === 'price-label' ? type : 'all';
      this.cdr.markForCheck();
    }));
    this.sub.add(this.auth.session$.subscribe(() => this.cdr.markForCheck()));
    void this.finishLoading(Promise.all([this.storage.ready, this.labelStorage.ready]));
  }

  get canEdit(): boolean { return this.auth.session?.role === 'editor'; }
  get visibleReports(): TemplateMold[] { return this.filter === 'price-label' ? [] : this.molds; }
  get visibleLabels(): LabelTemplate[] { return this.filter === 'report' ? [] : this.labels; }

  labelSupports(label: LabelTemplate): string {
    if (isThermalCalibration(label.calibration)) return 'Rollo térmico';
    if (!label.page) return '';
    return labelSheetName(label) + (label.printProfiles?.thermal ? ' · Rollo térmico' : '');
  }

  async retryCatalog(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    await this.finishLoading(Promise.all([this.storage.refresh(), this.labelStorage.refresh()]));
  }

  private async finishLoading(request: Promise<unknown>): Promise<void> {
    try { await request; }
    finally {
      this.loading = false;
      if (!this.sub.closed) this.cdr.markForCheck();
    }
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
    this.choosingType = false;
    this.editingMold = null;
    this.showForm = true;
  }

  openEditForm(mold: TemplateMold): void {
    this.editingMold = mold;
    this.showForm = true;
  }

  async onFormSaved(data: MoldFormData): Promise<void> {
    if (this.editingMold) {
      // Edit mode
      await this.storage.updateMetadata(this.editingMold.id, {
        name: data.name,
        documentType: data.documentType,
        description: data.description
      });
    } else {
      // Create mode — stay on the list so the user can see the new mold
      // alongside the existing ones and decide when to open it.
      await this.storage.create(data.name, data.documentType, data.description);
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

  async duplicateMold(mold: TemplateMold): Promise<void> {
    await this.storage.duplicate(mold.id);
  }

  requestDelete(mold: TemplateMold): void {
    this.labelToDelete = undefined;
    this.confirmDeleteId = mold.id;
  }

  async duplicateLabel(label: LabelTemplate): Promise<void> {
    if (!this.canEdit || this.labelActionPending) return;
    this.labelActionError = '';
    this.labelActionPending = true;
    try { await this.labelStorage.duplicate(label.id); }
    catch { this.labelActionError = 'No se pudo duplicar el molde.'; }
    finally { this.labelActionPending = false; this.cdr.markForCheck(); }
  }

  requestLabelDelete(label: LabelTemplate): void {
    if (!this.canEdit || this.labelActionPending) return;
    const revision = this.labelStorage.revision(label.id);
    if (revision === undefined) {
      this.labelActionError = 'No se pudo comprobar la revisión del molde. Reintentá la carga.';
      return;
    }
    this.labelActionError = '';
    this.labelToDelete = { name: label.name, revision };
    this.confirmDeleteId = label.id;
  }

  async confirmDelete(): Promise<void> {
    if (!this.canEdit || !this.confirmDeleteId || this.labelActionPending) return;
    const id = this.confirmDeleteId;
    if (!this.labelToDelete) {
      await this.storage.delete(id);
      this.cancelDelete();
      return;
    }
    this.labelActionPending = true;
    try { await this.labelStorage.delete(id, this.labelToDelete.revision); }
    catch (error) {
      if ((error as { status?: number })?.status === 409) {
        this.labelActionError = 'El molde cambió en el servidor. Revisá la versión actual antes de eliminarlo.';
        await this.labelStorage.refresh();
      } else {
        this.labelActionError = 'No se pudo eliminar el molde.';
      }
    } finally {
      this.labelActionPending = false;
      this.cancelDelete();
      this.cdr.markForCheck();
    }
  }

  cancelDelete(): void {
    if (this.labelActionPending) return;
    this.confirmDeleteId = null;
    this.labelToDelete = undefined;
  }

  cycleDeleteFocus(event: KeyboardEvent, cancel: HTMLButtonElement, confirm: HTMLButtonElement): void {
    if (event.key !== 'Tab') return;
    if (this.labelActionPending) { event.preventDefault(); return; }
    if (event.shiftKey && event.target === cancel) {
      event.preventDefault();
      confirm.focus();
    } else if (!event.shiftKey && event.target === confirm) {
      event.preventDefault();
      cancel.focus();
    }
  }
}
