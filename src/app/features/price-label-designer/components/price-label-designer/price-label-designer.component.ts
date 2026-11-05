import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  LabelElement,
  LabelElementType,
  LabelTemplate
} from '../../../../core/models/price-label-template.model';
import { PriceLabelCanvasComponent } from '../price-label-canvas/price-label-canvas.component';
import { PriceLabelPreviewComponent } from '../price-label-preview/price-label-preview.component';
import { PriceLabelPropertiesComponent } from '../price-label-properties/price-label-properties.component';
import {
  SAMPLE_PRICE_LABEL_ARTICLES,
  SAMPLE_PRICE_LABEL_COMPANY
} from '../../data/sample-price-label-data';
import { createDefaultPriceLabelTemplate } from '../../data/default-price-label-template';
import { PriceLabelStateService } from '../../services/price-label-state.service';
import { PriceLabelStorageService } from '../../services/price-label-storage.service';

import { labelLayoutError } from '../../utils/label-layout';
import { AuthService } from '../../../../core/auth/auth.service';

type ViewMode = 'design' | 'preview';

interface ToolItem {
  type: LabelElementType;
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-price-label-designer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PriceLabelCanvasComponent,
    PriceLabelPreviewComponent,
    PriceLabelPropertiesComponent
  ],
  templateUrl: './price-label-designer.component.html',
  styleUrl: './price-label-designer.component.scss'
})
export class PriceLabelDesignerComponent implements OnInit, OnDestroy {
  @ViewChild(PriceLabelCanvasComponent) canvas?: PriceLabelCanvasComponent;
  template = createDefaultPriceLabelTemplate();
  savedTemplates: LabelTemplate[] = [];
  selectedElementId: string | null = null;
  viewMode: ViewMode = 'design';
  saveStatus = '';
  settingsOpen = false;
  leftPanelCollapsed = false;
  rightPanelCollapsed = false;
  saving = false;
  private baseline = '';
  private destroyed = false;

  readonly sampleArticles = SAMPLE_PRICE_LABEL_ARTICLES;
  readonly sampleCompany = SAMPLE_PRICE_LABEL_COMPANY;

  readonly tools: ToolItem[] = [
    { type: 'text', label: 'Texto', description: 'Agregar nombre de artículo o texto fijo', icon: 'T' },
    { type: 'price', label: 'Precio', description: 'Agregar precio del artículo', icon: '$' },
    { type: 'barcode', label: 'Código', description: 'Agregar código de barras', icon: '▥' },
    { type: 'image', label: 'Imagen', description: 'Agregar logo o imagen', icon: '▧' }
  ];

  readonly labelPresets = [
    { id: '50x30', label: '50 x 30 mm', width: 50, height: 30, columns: 4, rows: 8 },
    { id: '60x40', label: '60 x 40 mm', width: 60, height: 40, columns: 3, rows: 6 },
    { id: '40x25', label: '40 x 25 mm', width: 40, height: 25, columns: 4, rows: 10 },
    { id: 'custom', label: 'Personalizado', width: 0, height: 0, columns: 0, rows: 0 }
  ];
  selectedPreset = '50x30';

  private sub = new Subscription();
  private saveStatusTimer: any;

  constructor(
    private state: PriceLabelStateService,
    private storage: PriceLabelStorageService,
    private router: Router,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.baseline = this.fingerprint(this.state.getCurrentTemplate());
    this.sub.add(
      this.state.template$.subscribe(template => {
        this.saveStatus = '';
        this.template = template;
        this.selectedPreset = this.detectPreset(template);
        if (this.selectedElementId && !template.elements.some(el => el.id === this.selectedElementId)) {
          this.selectedElementId = null;
        }
      })
    );

    this.sub.add(
      this.storage.templates$.subscribe(templates => {
        this.savedTemplates = templates;
      })
    );
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sub.unsubscribe();
    // A successful route departure has already confirmed discarding the draft.
    this.state.setTemplate(createDefaultPriceLabelTemplate());
    if (this.saveStatusTimer) clearTimeout(this.saveStatusTimer);
  }

  get selectedElement(): LabelElement | null {
    if (!this.selectedElementId) return null;
    return this.template.elements.find(el => el.id === this.selectedElementId) || null;
  }

  goToDocuments(): void {
    this.router.navigate(['/templates']);
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  get layoutError(): string { return labelLayoutError(this.template); }

  private fingerprint(template: LabelTemplate): string {
    const { version, ...content } = template;
    return JSON.stringify(content);
  }

  hasUnsavedChanges(): boolean {
    return !this.auth.leavingSession && (this.saving || this.fingerprint(this.template) !== this.baseline);
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing) return;
    const target = event.target as HTMLElement;
    const typing = !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') || target.isContentEditable;
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 's') {
      event.preventDefault();
      if (typing) target.blur();
      void this.saveTemplate();
      return;
    }
    if (typing || this.viewMode !== 'design') return;
    if (event.key === 'Escape') {
      if (this.state.interacting) this.canvas?.cancelInteraction();
      else this.selectedElementId = null;
      event.preventDefault();
      return;
    }
    if (this.state.interacting) return;
    if (modifier && (key === 'z' || key === 'y')) {
      event.preventDefault();
      if (key === 'y' || event.shiftKey) this.state.redo(); else this.state.undo();
      return;
    }
    const element = this.selectedElement;
    if (!element || element.locked) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault(); this.deleteElement(element.id);
    } else if (modifier && key === 'd') {
      event.preventDefault(); this.duplicateElement(element.id);
    } else if (!modifier && !event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 1 : 0.1;
      this.state.updateElement(element.id, { position: {
        x: element.position.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        y: element.position.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)
      } });
    }
  }

  private canDiscard(): boolean {
    return !this.saving && (!this.hasUnsavedChanges() || confirm('Hay cambios sin guardar. ¿Desea descartarlos?'));
  }

  private loadTemplate(template: LabelTemplate): void {
    this.selectedElementId = null;
    this.state.setTemplate(template);
    this.baseline = this.fingerprint(this.template);
  }

  createNewTemplate(): void {
    if (this.canDiscard()) this.loadTemplate(createDefaultPriceLabelTemplate());
  }

  openTemplate(templateId: string, select?: HTMLSelectElement): void {
    const template = this.storage.getById(templateId);
    if (!template || !this.canDiscard()) {
      if (select) select.value = this.template.id;
      return;
    }
    this.loadTemplate(template);
  }

  async saveTemplate(): Promise<void> {
    if (this.saving || this.layoutError || this.state.interacting) return;
    const sent = this.template;
    this.saving = true;
    try {
      const saved = await this.storage.save(sent);
      if (this.destroyed) return;
      this.auth.error$.next('');
      const unchanged = this.fingerprint(this.template) === this.fingerprint(sent);
      this.baseline = this.fingerprint(saved);
      this.state.acceptSaved(unchanged ? saved : { ...this.template, id: saved.id });
      this.showSaveStatus(unchanged ? 'Guardado' : 'Guardado; hay cambios nuevos pendientes');
    } catch {
      this.showSaveStatus('No se pudo guardar. Los cambios se conservaron.');
    } finally {
      this.saving = false;
    }
  }

  async deleteTemplate(): Promise<void> {
    if (!this.canDiscard()) return;
    if (this.storage.getById(this.template.id)) {
      await this.storage.delete(this.template.id);
    }
    this.loadTemplate(createDefaultPriceLabelTemplate());
    this.showSaveStatus('Eliminado');
  }

  updateName(name: string): void {
    this.state.updateName(name.trim() || 'Etiqueta sin nombre');
  }

  addTool(type: LabelElementType): void {
    this.onElementDropped({ type, position: { x: 2, y: 2 } });
    this.rightPanelCollapsed = false;
  }

  onToolDragStart(event: DragEvent, tool: ToolItem): void {
    event.dataTransfer?.setData('label-element-type', tool.type);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onElementDropped(event: { type: LabelElementType; position: { x: number; y: number } }): void {
    const element = this.state.addElement(event.type, event.position);
    this.selectedElementId = element.id;
  }

  onElementChanged(event: { id: string; changes: Partial<LabelElement> }): void {
    this.state.updateElement(event.id, event.changes);
  }

  selectElement(id: string | null): void {
    this.selectedElementId = id;
  }

  deleteElement(id: string): void {
    this.state.removeElement(id);
    this.selectedElementId = null;
  }

  duplicateElement(id: string): void {
    const duplicated = this.state.duplicateElement(id);
    if (duplicated) this.selectedElementId = duplicated.id;
  }

  applyPreset(presetId: string): void {
    const preset = this.labelPresets.find(item => item.id === presetId);
    if (!preset || preset.id === 'custom') return;
    this.state.updateLabel({
      width: preset.width,
      height: preset.height,
      columns: preset.columns,
      rows: preset.rows,
      gapX: preset.id === '50x30' ? 0 : 2
    });
  }

  updateLabelNumber(field: keyof LabelTemplate['label'], value: any): void {
    this.selectedPreset = 'custom';
    this.state.updateLabel({ [field]: Number(value) } as any);
  }

  updatePageNumber(field: keyof LabelTemplate['page'], value: any): void {
    this.state.updatePage({ [field]: Number(value) } as any);
  }

  private detectPreset(template: LabelTemplate): string {
    const match = this.labelPresets.find(preset =>
      preset.id !== 'custom' &&
      preset.width === template.label.width &&
      preset.height === template.label.height
    );
    return match?.id || 'custom';
  }

  private showSaveStatus(message: string): void {
    this.saveStatus = message;
    if (this.saveStatusTimer) clearTimeout(this.saveStatusTimer);
    this.saveStatusTimer = setTimeout(() => {
      this.saveStatus = '';
    }, 1800);
  }
}
