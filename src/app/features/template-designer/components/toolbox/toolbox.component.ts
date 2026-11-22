/**
 * Toolbox Component
 * Left sidebar with draggable element tools.
 * Users drag elements from here onto the canvas sections.
 */
import { Component, ChangeDetectionStrategy, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetailSectionDefinition, ElementType } from '../../../../core/models/template.model';
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';
import { createElement } from '../../utils/element-factory';

type ReportSection = 'header' | 'detail' | 'footer';

interface ToolItem {
  type: ElementType;
  label: string;
  icon: string;
  description: string;
  category: 'basic' | 'data' | 'shape';
  shapeType?: string;
}

@Component({
  selector: 'app-toolbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toolbox.component.html',
  styleUrl: './toolbox.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolboxComponent {
  readonly state = inject(TemplateStateService);
  readonly selection = inject(SelectionService);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly sections = [
    { key: 'header', label: 'Encabezado' },
    { key: 'detail', label: 'Detalle' },
    { key: 'footer', label: 'Pie' }
  ];

  shapesExpanded = false;

  tools: ToolItem[] = [
    // Basic elements
    {
      type: 'text',
      label: 'Texto',
      icon: 'T',
      description: 'Texto fijo estático',
      category: 'basic'
    },
    {
      type: 'image',
      label: 'Imagen',
      icon: '⊞',
      description: 'Imagen o logo',
      category: 'basic'
    },
    // Data elements
    {
      type: 'dataField',
      label: 'Campo',
      icon: '⊟',
      description: 'Campo de base de datos',
      category: 'data'
    },
    {
      type: 'formula',
      label: 'Fórmula',
      icon: 'fx',
      description: 'Campo calculado',
      category: 'data'
    },
    {
      type: 'qrCode',
      label: 'QR',
      icon: '⊞',
      description: 'Código QR',
      category: 'data'
    },
    {
      type: 'barcode',
      label: 'Cód. Barras',
      icon: '|||',
      description: 'Código de barras',
      category: 'data'
    },
    // Shape elements
    {
      type: 'line',
      label: 'Línea',
      icon: '—',
      description: 'Línea horizontal/vertical',
      category: 'shape'
    },
    {
      type: 'rectangle',
      label: 'Rectángulo',
      icon: '▢',
      description: 'Rectángulo o cuadro',
      category: 'shape'
    },
    {
      type: 'rectangle',
      label: 'Elipse',
      icon: '⬭',
      description: 'Elipse o círculo',
      category: 'shape',
      shapeType: 'ellipse'
    },
    {
      type: 'rectangle',
      label: 'Triángulo',
      icon: '△',
      description: 'Triángulo',
      category: 'shape',
      shapeType: 'triangle'
    },
    {
      type: 'rectangle',
      label: 'Diamante',
      icon: '◇',
      description: 'Rombo o diamante',
      category: 'shape',
      shapeType: 'diamond'
    }
  ];

  get basicTools(): ToolItem[] {
    return this.tools.filter(t => t.category === 'basic');
  }

  get dataTools(): ToolItem[] {
    return this.tools.filter(t => t.category === 'data');
  }

  get shapeTools(): ToolItem[] {
    return this.tools.filter(t => t.category === 'shape');
  }

  toggleShapes(): void {
    this.shapesExpanded = !this.shapesExpanded;
  }

  selectSection(section: ReportSection): void {
    this.selection.selectMultiple([], section);
  }

  selectElement(section: ReportSection, id: string): void {
    if (!id) {
      this.selectSection(section);
      return;
    }
    this.selection.select(id, section);
    this.reveal(id);
  }

  setSectionHeight(section: ReportSection, input: HTMLInputElement): void {
    const template = this.state.getCurrentTemplate();
    const current = template.sections[section];
    const minimum = Math.max(0, ...current.elements.map(element => element.position.y + element.size.height));
    const height = Math.max(minimum, input.valueAsNumber);
    if (!Number.isFinite(height) || height > 1000) {
      input.value = String(current.height);
      return;
    }
    input.value = String(height);
    if (height === current.height) return;
    this.state.setTemplate({
      ...template,
      sections: { ...template.sections, [section]: { ...current, height } }
    });
  }

  setRowsPerPage(input: HTMLInputElement): void {
    const limit = input.value ? input.valueAsNumber : undefined;
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
      input.value = String(this.state.getCurrentTemplate().sections.detail.maxRowsPerPage ?? '');
      return;
    }
    this.updateDetail('maxRowsPerPage', limit);
  }

  updateDetail<Key extends 'maxRowsPerPage' | 'showColumnHeaders'>(key: Key, value: DetailSectionDefinition[Key]): void {
    const template = this.state.getCurrentTemplate();
    const detail = template.sections.detail;
    if (detail[key] === value) return;
    this.state.setTemplate({
      ...template,
      sections: { ...template.sections, detail: { ...detail, [key]: value } }
    });
  }

  insert(tool: ToolItem): void {
    const section = this.selection.getActiveSection();
    const template = this.state.getCurrentTemplate();
    if (section === 'detail' && template.page.dynamicHeight) return;

    const current = template.sections[section];
    const bottom = Math.max(0, ...current.elements.map(element => element.position.y + element.size.height));
    const element = createElement(tool.type, { x: 2, y: bottom + 2 }, tool.shapeType ? { shapeType: tool.shapeType } : undefined);
    element.size.width = Math.min(element.size.width, template.page.width - template.page.margins.left - template.page.margins.right - 2);
    this.state.setTemplate({
      ...template,
      sections: {
        ...template.sections,
        [section]: {
          ...current,
          height: section === 'detail' ? current.height : Math.max(current.height, element.position.y + element.size.height),
          elements: [...current.elements, element]
        }
      }
    });
    this.selection.select(element.id, section);
    requestAnimationFrame(() => this.reveal(element.id));
  }

  private reveal(id: string): void {
    const element = this.host.nativeElement.closest('.designer-layout')?.querySelector(`[data-element-id="${CSS.escape(id)}"]`);
    element?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * Start drag from toolbox
   */
  onDragStart(event: DragEvent, tool: ToolItem): void {
    if (event.dataTransfer) {
      event.dataTransfer.setData('element-type', tool.type);
      if (tool.shapeType) {
        event.dataTransfer.setData('shape-type', tool.shapeType);
      }
      event.dataTransfer.effectAllowed = 'copy';
    }
  }
}
