/**
 * Toolbox Component
 * Left sidebar with draggable element tools.
 * Users drag elements from here onto the canvas sections.
 */
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ElementType } from '../../../../core/models/template.model';

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
