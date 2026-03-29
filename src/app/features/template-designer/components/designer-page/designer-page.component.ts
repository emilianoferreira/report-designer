/**
 * Designer Page Component
 * Main layout that composes the toolbox, canvas, properties panel, and preview.
 * This is the root component for the template designer feature.
 */
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DesignCanvasComponent } from '../design-canvas/design-canvas.component';
import { ToolboxComponent } from '../toolbox/toolbox.component';
import { PropertiesPanelComponent } from '../properties-panel/properties-panel.component';
import { PreviewComponent } from '../preview/preview.component';
import { TemplateStateService } from '../../services/template-state.service';
import { HtmlRendererService } from '../../services/html-renderer.service';

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
export class DesignerPageComponent {
  templateName = 'Untitled Template';
  viewMode: ViewMode = 'design';

  /** Panel collapse state */
  leftPanelCollapsed = false;
  rightPanelCollapsed = false;

  toggleLeftPanel(): void {
    this.leftPanelCollapsed = !this.leftPanelCollapsed;
  }

  toggleRightPanel(): void {
    this.rightPanelCollapsed = !this.rightPanelCollapsed;
  }

  constructor(
    private templateState: TemplateStateService,
    private htmlRenderer: HtmlRendererService
  ) {
    this.templateName = this.templateState.getCurrentTemplate().metadata.name;
  }

  /**
   * Switch between design and preview modes
   */
  setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
  }

  /**
   * Export template JSON (for debug/development)
   */
  exportTemplateJson(): void {
    const template = this.templateState.getCurrentTemplate();
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.metadata.name || 'template'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Export as HTML template with Zureo directives
   */
  exportHtmlTemplate(): void {
    const template = this.templateState.getCurrentTemplate();
    const html = this.htmlRenderer.exportAsZureoTemplate(template);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.metadata.name || 'template'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
