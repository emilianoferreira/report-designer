/**
 * Element Renderer Component
 * Renders a single TemplateElement on the canvas based on its type.
 * Handles visual representation, selection state, and interaction hooks.
 */
import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostBinding,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  TemplateElement,
  TextElement,
  DataFieldElement,
  FormulaElement,
  ImageElement,
  LineElement,
  RectangleElement,
  FontSettings
} from '../../../../core/models/template.model';
import { mmToPx } from '../../utils/coordinate-utils';

@Component({
  selector: 'app-element-renderer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './element-renderer.component.html',
  styleUrl: './element-renderer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ElementRendererComponent implements OnChanges {
  @Input() element!: TemplateElement;
  @Input() selected = false;
  @Input() sectionKey: 'header' | 'detail' | 'footer' = 'header';

  @Output() elementSelected = new EventEmitter<{
    elementId: string;
    section: 'header' | 'detail' | 'footer';
    event: MouseEvent;
  }>();

  // Computed styles
  hostStyles: Record<string, string> = {};
  contentStyles: Record<string, string> = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['element'] || changes['selected']) {
      this.computeStyles();
    }
  }

  private computeStyles(): void {
    if (!this.element) return;

    const el = this.element;
    const left = mmToPx(el.position.x);
    const top = mmToPx(el.position.y);
    const width = mmToPx(el.size.width);
    const height = mmToPx(el.size.height);

    this.hostStyles = {
      'position': 'absolute',
      'left': `${left}px`,
      'top': `${top}px`,
      'width': `${width}px`,
      'height': el.type === 'line' ? '0px' : `${height}px`,
      'z-index': `${el.zIndex}`,
      'opacity': `${el.style.opacity ?? 1}`,
      'pointer-events': el.locked ? 'none' : 'auto',
      'cursor': el.locked ? 'default' : 'move'
    };

    // Content-specific styles
    this.contentStyles = {};

    if (el.style.font) {
      this.contentStyles['font-family'] = el.style.font.family;
      this.contentStyles['font-size'] = `${el.style.font.size}pt`;
      this.contentStyles['font-weight'] = el.style.font.weight;
      this.contentStyles['font-style'] = el.style.font.style;
      this.contentStyles['color'] = el.style.font.color;
    }

    if (el.style.textAlign) {
      this.contentStyles['text-align'] = el.style.textAlign;
    }

    if (el.style.verticalAlign) {
      this.contentStyles['display'] = 'flex';
      this.contentStyles['align-items'] =
        el.style.verticalAlign === 'top' ? 'flex-start' :
        el.style.verticalAlign === 'middle' ? 'center' : 'flex-end';
    }

    if (el.style.backgroundColor) {
      this.contentStyles['background-color'] = el.style.backgroundColor;
    }

    if (el.style.padding) {
      this.contentStyles['padding'] =
        `${mmToPx(el.style.padding.top)}px ${mmToPx(el.style.padding.right)}px ${mmToPx(el.style.padding.bottom)}px ${mmToPx(el.style.padding.left)}px`;
    }

    if (el.style.borders) {
      if (el.style.borders.top) {
        this.contentStyles['border-top'] =
          `${mmToPx(el.style.borders.top.width)}px ${el.style.borders.top.style} ${el.style.borders.top.color}`;
      }
      if (el.style.borders.right) {
        this.contentStyles['border-right'] =
          `${mmToPx(el.style.borders.right.width)}px ${el.style.borders.right.style} ${el.style.borders.right.color}`;
      }
      if (el.style.borders.bottom) {
        this.contentStyles['border-bottom'] =
          `${mmToPx(el.style.borders.bottom.width)}px ${el.style.borders.bottom.style} ${el.style.borders.bottom.color}`;
      }
      if (el.style.borders.left) {
        this.contentStyles['border-left'] =
          `${mmToPx(el.style.borders.left.width)}px ${el.style.borders.left.style} ${el.style.borders.left.color}`;
      }
    }

    if (el.style.borderRadius) {
      this.contentStyles['border-radius'] = `${mmToPx(el.style.borderRadius)}px`;
    }

    if (el.style.overflow === 'hidden') {
      this.contentStyles['overflow'] = 'hidden';
    } else if (el.style.overflow === 'ellipsis') {
      this.contentStyles['overflow'] = 'hidden';
      this.contentStyles['text-overflow'] = 'ellipsis';
      this.contentStyles['white-space'] = 'nowrap';
    }
  }

  onMouseDown(event: MouseEvent): void {
    event.stopPropagation();
    this.elementSelected.emit({
      elementId: this.element.id,
      section: this.sectionKey,
      event
    });
  }

  // Type guard helpers for template
  get asText(): TextElement {
    return this.element as TextElement;
  }

  get asDataField(): DataFieldElement {
    return this.element as DataFieldElement;
  }

  get asFormula(): FormulaElement {
    return this.element as FormulaElement;
  }

  get asImage(): ImageElement {
    return this.element as ImageElement;
  }

  get asLine(): LineElement {
    return this.element as LineElement;
  }

  get asRectangle(): RectangleElement {
    return this.element as RectangleElement;
  }

  get lineStyles(): Record<string, string> {
    if (this.element.type !== 'line') return {};
    const line = this.asLine;
    const width = mmToPx(this.element.size.width);
    return {
      'width': `${width}px`,
      'border-top-width': `${mmToPx(line.lineStyle.width)}px`,
      'border-top-style': line.lineStyle.style,
      'border-top-color': line.lineStyle.color
    };
  }

  get rectangleStyles(): Record<string, string> {
    if (this.element.type !== 'rectangle') return {};
    const rect = this.asRectangle;
    const styles: Record<string, string> = {
      'width': '100%',
      'height': '100%'
    };
    if (rect.fillColor) {
      styles['background-color'] = rect.fillColor;
    }
    if (rect.strokeColor) {
      styles['border'] = `${mmToPx(rect.strokeWidth || 0.3)}px ${rect.strokeStyle || 'solid'} ${rect.strokeColor}`;
    }
    if (rect.style.borderRadius) {
      styles['border-radius'] = `${mmToPx(rect.style.borderRadius)}px`;
    }
    return styles;
  }
}
