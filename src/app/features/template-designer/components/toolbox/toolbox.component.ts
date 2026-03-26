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
  category: 'basic' | 'data' | 'visual';
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
      type: 'image',
      label: 'Imagen',
      icon: '⊞',
      description: 'Imagen o logo',
      category: 'visual'
    },
    {
      type: 'line',
      label: 'Línea',
      icon: '—',
      description: 'Línea horizontal/vertical',
      category: 'visual'
    },
    {
      type: 'rectangle',
      label: 'Rectángulo',
      icon: '▢',
      description: 'Rectángulo o cuadro',
      category: 'visual'
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
    }
  ];

  get basicTools(): ToolItem[] {
    return this.tools.filter(t => t.category === 'basic');
  }

  get dataTools(): ToolItem[] {
    return this.tools.filter(t => t.category === 'data');
  }

  get visualTools(): ToolItem[] {
    return this.tools.filter(t => t.category === 'visual');
  }

  /**
   * Start drag from toolbox
   */
  onDragStart(event: DragEvent, tool: ToolItem): void {
    if (event.dataTransfer) {
      event.dataTransfer.setData('element-type', tool.type);
      event.dataTransfer.effectAllowed = 'copy';
    }
  }
}
