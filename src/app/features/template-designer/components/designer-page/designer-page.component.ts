/**
 * Designer Page Component
 * Main layout that composes the toolbox, canvas, properties panel, and preview.
 * This is the root component for the template designer feature.
 * Now integrated with mold persistence — loads mold by route :id, saves back to storage.
 */
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DesignCanvasComponent } from '../design-canvas/design-canvas.component';
import { ToolboxComponent } from '../toolbox/toolbox.component';
import { PropertiesPanelComponent } from '../properties-panel/properties-panel.component';
import { PreviewComponent } from '../preview/preview.component';
import { TemplateStateService } from '../../services/template-state.service';
import { TemplateStorageService } from '../../services/template-storage.service';
import { TemplateMold } from '../../../../core/models/template.model';
import { HasUnsavedChanges } from '../../guards/unsaved-changes.guard';

type ViewMode = 'design' | 'preview';

@Component({
  selector: 'app-designer-page',
  standalone: true,
  imports: [
    CommonModule,
    DesignCanvasComponent,
    ToolboxComponent,
    PropertiesPanelComponent,
    PreviewComponent
  ],
  templateUrl: './designer-page.component.html',
  styleUrl: './designer-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignerPageComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  templateName = 'Untitled Template';
  viewMode: ViewMode = 'design';

  /** Current mold being edited */
  currentMold: TemplateMold | null = null;

  /** Dirty state — true when there are unsaved changes */
  isDirty = false;

  /** Save feedback */
  showSaveToast = false;
  private saveToastTimer: any;

  /** Panel collapse state */
  leftPanelCollapsed = false;
  rightPanelCollapsed = false;

  /** Help modal */
  showHelp = false;
  helpSection = 'intro';

  helpSections = [
    { id: 'intro', label: 'Inicio' },
    { id: 'elements', label: 'Elementos' },
    { id: 'selection', label: 'Seleccionar y mover' },
    { id: 'paper', label: 'Tamaño de papel' },
    { id: 'zoom', label: 'Zoom y navegación' },
    { id: 'grid', label: 'Grilla y snap' },
    { id: 'properties', label: 'Propiedades' },
    { id: 'data', label: 'Campos de datos' },
    { id: 'export', label: 'Exportación' },
    { id: 'shortcuts', label: 'Atajos de teclado' }
  ];

  private templateSub!: Subscription;
  private initialTemplateJson = '';

  constructor(
    private templateState: TemplateStateService,
    private templateStorage: TemplateStorageService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const moldId = this.route.snapshot.paramMap.get('id');
    if (moldId) {
      const mold = this.templateStorage.getById(moldId);
      if (mold) {
        this.currentMold = mold;
        this.templateName = mold.name;
        this.templateState.clearHistory();
        this.templateState.setTemplate(mold.template);
        this.templateState.clearHistory(); // clear the setTemplate push from undo stack
        this.initialTemplateJson = JSON.stringify(mold.template);
      } else {
        // Mold not found — redirect to list
        this.router.navigate(['/templates']);
        return;
      }
    } else {
      this.templateName = this.templateState.getCurrentTemplate().metadata.name;
      this.initialTemplateJson = JSON.stringify(this.templateState.getCurrentTemplate());
    }

    // Track changes for dirty state
    this.templateSub = this.templateState.template$.subscribe(template => {
      const currentJson = JSON.stringify(template);
      this.isDirty = currentJson !== this.initialTemplateJson;
      this.templateName = this.currentMold?.name || template.metadata.name;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.templateSub?.unsubscribe();
    if (this.saveToastTimer) clearTimeout(this.saveToastTimer);
  }

  // ─── Unsaved changes protection ───

  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isDirty) {
      event.preventDefault();
      // Modern browsers show a generic message, but returnValue is required
      event.returnValue = '';
    }
  }

  // ─── Save ───

  async saveTemplate(): Promise<void> {
    if (!this.currentMold) return;
    const template = this.templateState.getCurrentTemplate();
    const updated = await this.templateStorage.saveTemplate(this.currentMold.id, template);
    if (updated) {
      this.currentMold = updated;
      this.initialTemplateJson = JSON.stringify(template);
      this.isDirty = false;

      // Show toast
      this.showSaveToast = true;
      this.cdr.markForCheck();
      if (this.saveToastTimer) clearTimeout(this.saveToastTimer);
      this.saveToastTimer = setTimeout(() => {
        this.showSaveToast = false;
        this.cdr.markForCheck();
      }, 2000);
    }
  }

  goBack(): void {
    this.router.navigate(['/templates']);
  }

  // ─── View Mode ───

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
    if (this.showHelp) this.helpSection = 'intro';
  }

  closeHelp(): void {
    this.showHelp = false;
  }

  toggleLeftPanel(): void {
    this.leftPanelCollapsed = !this.leftPanelCollapsed;
  }

  toggleRightPanel(): void {
    this.rightPanelCollapsed = !this.rightPanelCollapsed;
  }

  /**
   * Switch between design and preview modes
   */
  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  // Note: JSON / HTML export was moved to PreviewComponent to centralize
  // all export & copy actions in a single place. The header now only shows
  // Guardar + Info; the user goes to "Vista Previa" to export.
}
