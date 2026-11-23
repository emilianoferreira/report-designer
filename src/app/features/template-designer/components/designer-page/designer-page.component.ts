import { ValidationSessionService } from '../../services/validation-session.service';
import { DesignValidationComponent } from '../design-validation/design-validation.component';
/**
 * Designer Page Component
 * Main layout that composes the toolbox, canvas, properties panel, and preview.
 * This is the root component for the template designer feature.
 * Now integrated with mold persistence — loads mold by route :id, saves back to storage.
 */
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { DesignCanvasComponent } from '../design-canvas/design-canvas.component';
import { ToolboxComponent } from '../toolbox/toolbox.component';
import { PropertiesPanelComponent } from '../properties-panel/properties-panel.component';
import { PreviewComponent } from '../preview/preview.component';
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';
import { TemplateStorageService } from '../../services/template-storage.service';
import { TemplateMold } from '../../../../core/models/template.model';
import { HasUnsavedChanges } from '../../guards/unsaved-changes.guard';
import { AuthService } from '../../../../core/auth/auth.service';
import { FiscalProfileComponent } from '../fiscal-profile/fiscal-profile.component';
import { StaticFiscalResultsComponent } from '../static-fiscal-results/static-fiscal-results.component';

type ViewMode = 'design' | 'preview' | 'fiscal' | 'results';

@Component({
  selector: 'app-designer-page',
  standalone: true,
  providers: [ValidationSessionService],
  imports: [
    DesignValidationComponent,
    CommonModule,
    RouterLink,
    DesignCanvasComponent,
    ToolboxComponent,
    PropertiesPanelComponent,
    PreviewComponent,
    FiscalProfileComponent,
    StaticFiscalResultsComponent
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
  saving = false;
  conflict = false;
  savedCopyId?: string;
  saveMessage = '';
  private destroyed = false;
  private saveToastTimer?: ReturnType<typeof setTimeout>;

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
    private auth: AuthService,
    private templateState: TemplateStateService,
    private selection: SelectionService,
    private templateStorage: TemplateStorageService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.selection.selectMultiple([], 'header');
    const moldId = this.route.snapshot.paramMap.get('id');
    if (moldId) {
      const mold = this.templateStorage.getById(moldId);
      if (mold) {
        this.loadMold(mold);
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

  private loadMold(mold: TemplateMold): void {
    this.currentMold = mold;
    this.templateName = mold.name;
    this.initialTemplateJson = JSON.stringify(mold.template);
    this.conflict = false;
    this.savedCopyId = undefined;
    this.selection.selectMultiple([], 'header');
    this.templateState.setTemplate(mold.template);
    this.templateState.clearHistory();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.templateSub?.unsubscribe();
    if (this.saveToastTimer) clearTimeout(this.saveToastTimer);
  }

  // ─── Unsaved changes protection ───

  hasUnsavedChanges(): boolean {
    return !this.auth.leavingSession && (this.isDirty || this.saving);
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      // Modern browsers show a generic message, but returnValue is required
      event.returnValue = '';
    }
  }

  // ─── Save ───

  async saveTemplate(): Promise<void> {
    const mold = this.currentMold;
    if (!mold || this.saving || this.conflict || !this.isDirty) return;
    if (mold.revision === undefined) {
      this.saveMessage = 'No se pudo comprobar la revisión del molde. Recargá la página antes de guardar.';
      this.conflict = true;
      return;
    }
    const sentJson = JSON.stringify(this.templateState.getCurrentTemplate());
    this.saving = true;
    clearTimeout(this.saveToastTimer);
    this.saveMessage = '';
    try {
      const updated = await this.templateStorage.saveTemplate(mold, JSON.parse(sentJson));
      if (this.destroyed || this.currentMold !== mold) return;
      if (updated?.id !== mold.id) throw new Error('Unconfirmed report save');
      this.currentMold = updated;
      this.initialTemplateJson = sentJson;
      this.isDirty = JSON.stringify(this.templateState.getCurrentTemplate()) !== sentJson;
      this.saveMessage = this.isDirty ? 'Guardado. Hay cambios posteriores pendientes.' : 'Guardado correctamente';
      this.saveToastTimer = setTimeout(() => {
        this.saveMessage = '';
        this.cdr.markForCheck();
      }, 2000);
    } catch (error) {
      if (!this.destroyed && this.currentMold === mold) {
        this.conflict = error instanceof HttpErrorResponse && error.status === 409;
        if (!this.conflict) this.saveMessage = 'No se pudo guardar el molde. Tu edición se conserva.';
      }
    } finally {
      this.saving = false;
      if (!this.destroyed) this.cdr.markForCheck();
    }
  }

  async reloadTemplate(): Promise<void> {
    const mold = this.currentMold;
    if (!mold || this.saving || !confirm('¿Descartar el borrador y recargar la versión del servidor?')) return;
    const draftJson = JSON.stringify(this.templateState.getCurrentTemplate());
    this.saving = true;
    this.saveMessage = '';
    try {
      const latest = await this.templateStorage.fetch(mold.id);
      if (this.destroyed || this.currentMold !== mold) return;
      if (JSON.stringify(this.templateState.getCurrentTemplate()) === draftJson) {
        this.loadMold(latest);
      } else {
        this.saveMessage = 'Hay cambios nuevos. Tu borrador se conservó.';
      }
    } catch {
      if (!this.destroyed) this.saveMessage = 'No se pudo recargar. Tu borrador se conservó.';
    } finally {
      this.saving = false;
      if (!this.destroyed) this.cdr.markForCheck();
    }
  }

  async saveCopy(): Promise<void> {
    const mold = this.currentMold;
    if (!mold || this.saving || !this.conflict) return;
    const draftJson = JSON.stringify(this.templateState.getCurrentTemplate());
    this.saving = true;
    this.saveMessage = '';
    try {
      const copy = await this.templateStorage.saveCopy(mold, JSON.parse(draftJson));
      if (this.destroyed || this.currentMold !== mold) return;
      this.savedCopyId = copy.id;
      this.saveMessage = JSON.stringify(this.templateState.getCurrentTemplate()) === draftJson
        ? 'Copia guardada.' : 'Copia guardada. Hay cambios posteriores pendientes.';
    } catch {
      if (!this.destroyed) this.saveMessage = 'No se pudo guardar la copia. Tu borrador se conservó.';
    } finally {
      this.saving = false;
      if (!this.destroyed) this.cdr.markForCheck();
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
