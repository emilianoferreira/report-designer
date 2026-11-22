import { templateErrors } from '../../utils/label-validation';
import { CommonModule } from '@angular/common';
import { Component, HostListener, Injector, OnDestroy, OnInit, ViewChild, afterNextRender } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  LabelElement,
  LabelElementType,
  LabelTemplate,
  LabelOrientation,
  LabelCalibration,
  PriceLabelArticle,
  ThermalLabelProfile
} from '../../../../core/models/price-label-template.model';
import { PriceLabelCanvasComponent } from '../price-label-canvas/price-label-canvas.component';
import { PriceLabelPreviewComponent } from '../price-label-preview/price-label-preview.component';
import { PriceLabelPropertiesComponent } from '../price-label-properties/price-label-properties.component';
import { PriceLabelSetupComponent } from '../price-label-setup/price-label-setup.component';
import {
  SAMPLE_PRICE_LABEL_ARTICLES,
  SAMPLE_PRICE_LABEL_COMPANY,
  LABEL_SIMULATIONS
} from '../../data/sample-price-label-data';
import { createDefaultPriceLabelTemplate } from '../../data/default-price-label-template';
import { defaultThermalLabelProfile, PRICE_LABEL_PRESETS } from '../../data/new-label-template';
import { calibrationArticles, createCalibrationTemplate, isThermalCalibration } from '../../data/label-calibration';
import { PriceLabelStateService } from '../../services/price-label-state.service';
import { PriceLabelStorageService } from '../../services/price-label-storage.service';

import { defaultLabelPrintProfile, labelSheetName, resolveLabelLayout } from '../../utils/label-layout';
import { AuthService } from '../../../../core/auth/auth.service';
import { LabelPrintDraftService } from '../../../price-label-print/label-print-draft.service';

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
    PriceLabelPropertiesComponent,
    PriceLabelSetupComponent
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
  conflict = false;
  loadingTemplate = false;
  openError = '';
  showSetup = false;
  private loadRequest = 0;
  private serverVersion?: number;
  private baseline = '';
  private destroyed = false;

  sampleArticles = SAMPLE_PRICE_LABEL_ARTICLES;
  readonly simulations = LABEL_SIMULATIONS;
  simulationIndex = 0;
  private simulatedArticle?: PriceLabelArticle[];
  get previewArticles(): PriceLabelArticle[] {
    return this.template.calibration ? this.sampleArticles : this.simulatedArticle ?? this.sampleArticles;
  }
  private calibration?: LabelCalibration;
  readonly sampleCompany = SAMPLE_PRICE_LABEL_COMPANY;

  readonly tools: ToolItem[] = [
    { type: 'text', label: 'Texto', description: 'Agregar nombre de artículo o texto fijo', icon: 'T' },
    { type: 'price', label: 'Precio', description: 'Agregar precio del artículo', icon: '$' },
    { type: 'barcode', label: 'Código', description: 'Agregar código de barras', icon: '▥' },
    { type: 'image', label: 'Imagen', description: 'Agregar logo o imagen', icon: '▧' }
  ];

  readonly labelPresets = PRICE_LABEL_PRESETS;
  selectedPreset = '50x30';
  readonly thermalFields = [
    { key: 'width', label: 'Ancho del rollo' },
    { key: 'height', label: 'Alto de página en el controlador' },
    { key: 'printableWidth', label: 'Ancho imprimible' },
    { key: 'offsetX', label: 'Desplazamiento horizontal' },
    { key: 'offsetY', label: 'Desplazamiento vertical' }
  ] as const;

  private sub = new Subscription();
  private saveStatusTimer: any;

  constructor(
    private state: PriceLabelStateService,
    public storage: PriceLabelStorageService,
    private router: Router,
    private route: ActivatedRoute,
    private auth: AuthService,
    private injector: Injector,
    private printDrafts: LabelPrintDraftService
  ) {}

  ngOnInit(): void {
    this.baseline = this.fingerprint(this.state.getCurrentTemplate());
    this.sub.add(
      this.state.template$.subscribe(template => {
        this.saveStatus = '';
        this.template = template;
        if (template.calibration !== this.calibration) {
          this.calibration = template.calibration;
          this.sampleArticles = template.calibration ? calibrationArticles(template.calibration) : SAMPLE_PRICE_LABEL_ARTICLES;
        }
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
    if (!this.canEdit) this.viewMode = 'preview';
    this.sub.add(this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      this.showSetup = false;
      if (id && id !== this.template.id) {
        void this.openFromRoute(id);
      } else {
        this.loadRequest++;
        this.loadingTemplate = false;
        this.openError = '';
        if (!id && !this.legacyRoute) {
          const calibration = createCalibrationTemplate(this.route.snapshot.queryParamMap.get('calibration'));
          this.loadTemplate(calibration ?? createDefaultPriceLabelTemplate());
          this.showSetup = !calibration;
        }
      }
    }));
  }

  get canEdit(): boolean { return this.auth.session?.role === 'editor'; }
  get legacyRoute(): boolean { return this.route.routeConfig?.path === 'price-labels'; }

  async openFromRoute(id: string): Promise<void> {
    const request = ++this.loadRequest;
    this.loadingTemplate = true;
    this.openError = '';
    try {
      const template = await this.storage.fetch(id);
      if (this.destroyed || request !== this.loadRequest) return;
      this.openError = templateErrors(template).join(' ');
      if (!this.openError) this.loadTemplate(template);
    } catch (error: any) {
      if (this.destroyed || request !== this.loadRequest) return;
      this.openError = error.status === 404 ? 'No se encontró el molde de etiqueta.' : 'No se pudo cargar el molde.';
    } finally {
      if (request === this.loadRequest) this.loadingTemplate = false;
    }
  }

  retryOpen(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) void this.openFromRoute(id);
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

  get needsSaveForPrint(): boolean {
    return this.canEdit && (this.serverVersion === undefined || this.hasUnsavedChanges());
  }

  private get batchToken(): string | null {
    const token = this.route.snapshot.queryParamMap.get('batch');
    return this.printDrafts.canResume(token, this.route.snapshot.paramMap.get('id')) ? token : null;
  }

  get hasBatchToResume(): boolean { return this.batchToken !== null; }

  async preparePrint(): Promise<void> {
    if (this.saving) return;
    if (this.needsSaveForPrint) await this.saveTemplate(false, false);
    if (this.destroyed || this.serverVersion === undefined || this.hasUnsavedChanges() || this.conflict) return;
    await this.navigateToPrint(this.template.id);
  }

  goToDocuments(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && this.hasBatchToResume) {
      void this.navigateToPrint(id);
      return;
    }
    this.router.navigate(['/templates/labels']);
  }

  private navigateToPrint(templateId: string): Promise<boolean> {
    const batch = this.batchToken;
    return this.router.navigate(['/price-labels/print'], {
      queryParams: { templateId, batch }, replaceUrl: batch !== null
    });
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  selectSimulation(index: number): void {
    const simulation = this.simulations[index];
    if (!simulation) return;
    this.simulationIndex = index;
    this.simulatedArticle = simulation.changes ? [{ ...SAMPLE_PRICE_LABEL_ARTICLES[0], ...simulation.changes }] : undefined;
  }

  returnToElement(id: string): void {
    if (!this.canEdit || !this.template.elements.some(element => element.id === id)) return;
    this.selectElement(id);
    this.rightPanelCollapsed = false;
    this.setViewMode('design');
    afterNextRender(() => this.canvas?.focusSurface(), { injector: this.injector });
  }

  get sheetName(): string { return labelSheetName(this.template); }
  get startsWithThermal(): boolean { return defaultLabelPrintProfile(this.template) === 'thermal'; }
  get sheetError(): string { return resolveLabelLayout(this.template).error ?? ''; }
  get thermalError(): string {
    return this.template.printProfiles?.thermal ? resolveLabelLayout(this.template, 'thermal').error ?? '' : '';
  }
  get layoutError(): string {
    if (this.template.calibration) {
      const profile = isThermalCalibration(this.template.calibration) ? 'thermal' : 'sheet';
      return resolveLabelLayout(this.template, profile).error ?? '';
    }
    return this.template.printProfiles?.thermal && !this.thermalError ? '' : this.sheetError;
  }

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
    if (!this.canEdit || this.showSetup || this.loadingTemplate || this.openError || event.defaultPrevented || event.isComposing) return;
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
    const errors = templateErrors(template);
    if (errors.length) { this.showSaveStatus('No se pudo abrir: ' + errors.join(' ')); return; }
    this.selectedElementId = null;
    this.serverVersion = this.storage.revision(template.id);
    this.conflict = false;
    this.state.setTemplate(template);
    this.baseline = this.fingerprint(this.template);
    if (template.calibration || !this.canEdit) this.viewMode = 'preview';
  }

  createNewTemplate(): void {
    if (this.canDiscard()) this.loadTemplate(createDefaultPriceLabelTemplate());
  }

  startGuidedTemplate(template: LabelTemplate): void {
    this.loadTemplate(template);
    this.baseline = '';
    this.viewMode = 'design';
    this.showSetup = false;
    afterNextRender(() => this.canvas?.focusSurface(), { injector: this.injector });
  }

  openTemplate(templateId: string, select?: HTMLSelectElement): void {
    const template = this.storage.getById(templateId);
    if (!template || !this.canDiscard()) {
      if (select) select.value = this.template.id;
      return;
    }
    this.loadTemplate(template);
  }

  async saveTemplate(asCopy = false, openSaved = true): Promise<void> {
    if (!this.canEdit || this.showSetup || this.loadingTemplate || this.openError || this.saving || this.layoutError || this.state.interacting) return;
    const original = this.template;
    const sent = asCopy ? { ...original, name: original.name + ' (copia)' } : original;
    this.saving = true;
    let savedId: string | undefined;
    try {
      const saved = await this.storage.save(sent, this.serverVersion, asCopy);
      if (this.destroyed) return;
      this.auth.error$.next('');
      this.serverVersion = this.storage.revision(saved.id);
      this.conflict = false;
      const unchanged = this.fingerprint(this.template) === this.fingerprint(original);
      this.baseline = this.fingerprint(saved);
      this.state.acceptSaved(unchanged ? saved : { ...this.template, id: saved.id, name: asCopy && this.template.name === original.name ? saved.name : this.template.name });
      this.showSaveStatus(unchanged ? 'Guardado' : 'Guardado; hay cambios nuevos pendientes');
      if (unchanged && openSaved && !this.legacyRoute && this.route.snapshot.paramMap.get('id') !== saved.id) savedId = saved.id;
    } catch (error: any) {
      this.conflict = error.status === 409;
      this.showSaveStatus(this.conflict ? 'La plantilla cambió en el servidor. Tu borrador se conservó.' : 'No se pudo guardar. Los cambios se conservaron.');
    } finally {
      this.saving = false;
    }
    if (savedId) {
      const batch = this.batchToken;
      const previousId = this.route.snapshot.paramMap.get('id');
      if (batch && previousId) this.printDrafts.retarget(batch, previousId, savedId);
      let opened = false;
      try {
        opened = await this.router.navigate(['/price-labels', savedId, 'edit'], {
          replaceUrl: true, queryParams: { batch }
        });
      } finally {
        if (!opened && batch && previousId) this.printDrafts.retarget(batch, savedId, previousId);
      }
    }
  }

  async reloadTemplate(): Promise<void> {
    if (!this.canDiscard()) return;
    const original = this.fingerprint(this.template);
    this.saving = true;
    try {
      const latest = await this.storage.fetch(this.template.id);
      if (!this.destroyed) {
        if (this.fingerprint(this.template) === original) this.loadTemplate(latest);
        else this.showSaveStatus('Hay cambios nuevos. Tu borrador se conservó; vuelve a recargar cuando termines.');
      }
    } catch { this.showSaveStatus('No se pudo recargar. Tu borrador se conservó.'); }
    finally { this.saving = false; }
  }

  async deleteTemplate(): Promise<void> {
    if (!this.canEdit || this.saving || !confirm('¿Eliminar la plantilla "' + this.template.name + '"? Esta acción no se puede deshacer y descarta los cambios locales.')) return;
    this.saving = true;
    try {
      if (this.storage.getById(this.template.id)) await this.storage.delete(this.template.id, this.serverVersion);
      if (this.destroyed) return;
      this.loadTemplate(createDefaultPriceLabelTemplate());
      this.showSaveStatus('Eliminado');
    } catch (error: any) {
      this.conflict = error.status === 409;
      this.showSaveStatus(this.conflict ? 'La plantilla cambió en el servidor. No se eliminó.' : 'No se pudo eliminar. Tu borrador se conservó.');
    } finally { this.saving = false; }
    if (!this.legacyRoute && this.serverVersion === undefined) this.goToDocuments();
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

  setA4Orientation(orientation: LabelOrientation): void {
    const portrait = orientation === 'portrait';
    this.state.updatePage({ mode: 'sheet', size: 'A4', orientation, width: portrait ? 210 : 297, height: portrait ? 297 : 210 });
  }

  addThermalProfile(): void {
    const { width, height } = this.template.label;
    this.state.setThermalProfile(defaultThermalLabelProfile(width, height));
  }

  updateThermalProfile(changes: Partial<ThermalLabelProfile>): void {
    const profile = this.template.printProfiles?.thermal;
    if (profile) this.state.setThermalProfile({ ...profile, ...changes });
  }

  updateThermalNumber(field: Exclude<keyof ThermalLabelProfile, 'media'>, value: string): void {
    this.updateThermalProfile({ [field]: Number(value) });
  }

  removeThermalProfile(): void { this.state.setThermalProfile(); }

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
