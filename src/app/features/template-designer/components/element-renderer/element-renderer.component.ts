/**
 * Element Renderer Component
 * Renders a single TemplateElement on the canvas based on its type.
 * Emits drag/resize start events for the canvas to handle via native mouse events.
 */
import {
  Component,
  Input,
  Output,
  EventEmitter,
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
  QRCodeElement,
  BarcodeElement
} from '../../../../core/models/template.model';
import { mmToPx } from '../../utils/coordinate-utils';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

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

  /** Visual overrides during drag/resize (from canvas) */
  @Input() dragTransform = '';
  @Input() resizeTransform = '';
  @Input() dragWidth: number | null = null;
  @Input() dragHeight: number | null = null;
  @Input() isDragging = false;

  @Output() elementSelected = new EventEmitter<{
    elementId: string;
    section: 'header' | 'detail' | 'footer';
    event: MouseEvent;
  }>();

  /** Emitted when user starts dragging the element body or a resize handle */
  @Output() dragStarted = new EventEmitter<{
    elementId: string;
    section: 'header' | 'detail' | 'footer';
    mouseEvent: MouseEvent;
    handle?: string;
  }>();

  // Computed styles
  hostStyles: Record<string, string> = {};
  contentStyles: Record<string, string> = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['element'] || changes['selected'] || changes['dragWidth'] || changes['dragHeight'] || changes['dragTransform'] || changes['resizeTransform']) {
      this.computeStyles();
    }
    if (changes['element']) {
      if (this.element?.type === 'qrCode') {
        this.generateQRPreview();
      } else if (this.element?.type === 'barcode') {
        this.generateBarcodePreview();
      }
    }
  }

  private computeStyles(): void {
    if (!this.element) return;

    const el = this.element;
    const left = mmToPx(el.position.x);
    const top = mmToPx(el.position.y);
    const width = this.dragWidth ?? mmToPx(el.size.width);
    const height = this.dragHeight ?? mmToPx(el.size.height);

    // Determine the transform to apply
    let transform = '';
    if (this.dragTransform) {
      transform = this.dragTransform;
    } else if (this.resizeTransform) {
      transform = this.resizeTransform;
    }

    this.hostStyles = {
      'position': 'absolute',
      'left': `${left}px`,
      'top': `${top}px`,
      'width': `${width}px`,
      'height': el.type === 'line' ? '2px' : `${height}px`,
      'z-index': `${this.isDragging ? 9999 : el.zIndex}`,
      'opacity': `${el.style.opacity ?? 1}`,
      'pointer-events': 'auto',
      'cursor': el.locked ? 'default' : 'move'
    };

    if (transform) {
      this.hostStyles['transform'] = transform;
    }

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

  /** Click to select */
  onMouseDown(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();

    this.elementSelected.emit({
      elementId: this.element.id,
      section: this.sectionKey,
      event
    });

    // Also start a move drag
    if (!this.element.locked) {
      this.dragStarted.emit({
        elementId: this.element.id,
        section: this.sectionKey,
        mouseEvent: event
      });
    }
  }

  /** Resize handle mousedown */
  onHandleMouseDown(event: MouseEvent, handle: string): void {
    event.stopPropagation();
    event.preventDefault();

    // Select the element first
    this.elementSelected.emit({
      elementId: this.element.id,
      section: this.sectionKey,
      event
    });

    // Start resize
    this.dragStarted.emit({
      elementId: this.element.id,
      section: this.sectionKey,
      mouseEvent: event,
      handle
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

  get asQRCode(): QRCodeElement {
    return this.element as QRCodeElement;
  }

  get asBarcode(): BarcodeElement {
    return this.element as BarcodeElement;
  }

  /** Cached QR SVG string for canvas preview */
  qrSvg = '';

  /** Cached barcode SVG string for canvas preview */
  barcodeSvg = '';

  private generateQRPreview(): void {
    if (this.element.type !== 'qrCode') return;
    const el = this.asQRCode;
    const sampleData = el.dataBinding || 'https://example.com';
    const fgColor = el.foregroundColor || '#000000';
    const bgColor = el.backgroundColor || '#ffffff';

    try {
      const qr = (QRCode as any).create(sampleData, { errorCorrectionLevel: el.errorCorrection || 'M' });
      const modules = qr.modules;
      const moduleCount = modules.size;

      let rects = '';
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          if (modules.get(row, col)) {
            rects += `<rect x="${col}" y="${row}" width="1" height="1" fill="${fgColor}"/>`;
          }
        }
      }
      this.qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${moduleCount} ${moduleCount}" style="width:100%;height:100%;"><rect width="${moduleCount}" height="${moduleCount}" fill="${bgColor}"/>${rects}</svg>`;
    } catch {
      this.qrSvg = '';
    }
  }

  private generateBarcodePreview(): void {
    if (this.element.type !== 'barcode') return;
    const el = this.asBarcode;
    const sampleData = el.dataBinding || '123456789';

    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      (JsBarcode as any)(svg, sampleData, {
        format: el.barcodeType || 'CODE128',
        displayValue: el.showText !== false,
        width: el.barWidth || 2,
        height: el.barHeight ? mmToPx(el.barHeight) : 40,
        margin: 2,
        fontSize: 10,
        background: '#ffffff',
        lineColor: '#000000'
      });
      this.barcodeSvg = svg.outerHTML;
    } catch {
      this.barcodeSvg = '';
    }
  }

  get lineStyles(): Record<string, string> {
    if (this.element.type !== 'line') return {};
    const line = this.asLine;
    const width = this.dragWidth ?? mmToPx(this.element.size.width);
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
    const shape = rect.shapeType || 'rectangle';
    const styles: Record<string, string> = {
      'width': '100%',
      'height': '100%'
    };
    if (rect.fillColor) {
      styles['background-color'] = rect.fillColor;
    }
    if (rect.strokeColor && shape === 'rectangle') {
      styles['border'] = `${mmToPx(rect.strokeWidth || 0.3)}px ${rect.strokeStyle || 'solid'} ${rect.strokeColor}`;
    }
    if (shape === 'ellipse') {
      styles['border-radius'] = '50%';
      if (rect.strokeColor) {
        styles['border'] = `${mmToPx(rect.strokeWidth || 0.3)}px ${rect.strokeStyle || 'solid'} ${rect.strokeColor}`;
      }
    } else if (rect.style.borderRadius && shape === 'rectangle') {
      styles['border-radius'] = `${mmToPx(rect.style.borderRadius)}px`;
    }
    if (shape === 'triangle' || shape === 'diamond') {
      styles['clip-path'] = shape === 'triangle'
        ? 'polygon(50% 0%, 0% 100%, 100% 100%)'
        : 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
    }
    return styles;
  }

  /** SVG outline for triangle/diamond shapes (rendered behind the clipped fill) */
  get shapeSvgPath(): string {
    if (this.element.type !== 'rectangle') return '';
    const rect = this.asRectangle;
    const shape = rect.shapeType || 'rectangle';
    if (shape === 'triangle') return 'M 50,0 L 100,100 L 0,100 Z';
    if (shape === 'diamond') return 'M 50,0 L 100,50 L 50,100 L 0,50 Z';
    return '';
  }

  get shapeSvgStroke(): string {
    if (this.element.type !== 'rectangle') return '';
    const rect = this.asRectangle;
    return rect.strokeColor || 'none';
  }

  get shapeSvgStrokeWidth(): number {
    if (this.element.type !== 'rectangle') return 0;
    const rect = this.asRectangle;
    return rect.strokeColor ? mmToPx(rect.strokeWidth || 0.3) : 0;
  }

  get isClipPathShape(): boolean {
    if (this.element.type !== 'rectangle') return false;
    const shape = this.asRectangle.shapeType || 'rectangle';
    return shape === 'triangle' || shape === 'diamond';
  }
}
