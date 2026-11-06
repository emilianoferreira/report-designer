import { labelPresentation } from '../../utils/label-presentation';
import { CommonModule } from '@angular/common';
import {
  Component,
  ChangeDetectorRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  OnDestroy
} from '@angular/core';
import {
  LabelElement,
  LabelElementType,
  LabelTemplate,
  PriceLabelArticle,
  PriceLabelCompany,
  PriceLabelRenderContext
} from '../../../../core/models/price-label-template.model';
import { mmToPx, pxToMm, collectSnapCandidates, computeSnap, SnapLine, SnapSettings } from '../../../template-designer/utils/coordinate-utils';
import { PriceLabelRendererService } from '../../services/price-label-renderer.service';

import { PriceLabelStateService } from '../../services/price-label-state.service';
import { LabelBarcodeDirective } from '../../directives/label-barcode.directive';

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface DragState {
  type: 'move' | 'resize';
  element: LabelElement;
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  handle?: ResizeHandle;
}

@Component({
  selector: 'app-price-label-canvas',
  standalone: true,
  imports: [CommonModule, LabelBarcodeDirective],
  templateUrl: './price-label-canvas.component.html',
  styleUrl: './price-label-canvas.component.scss'
})
export class PriceLabelCanvasComponent implements OnDestroy {
  @Input({ required: true }) template!: LabelTemplate;
  @Input() selectedElementId: string | null = null;
  @Input({ required: true }) sampleArticle!: PriceLabelArticle;
  @Input({ required: true }) sampleCompany!: PriceLabelCompany;

  @Output() elementSelected = new EventEmitter<string | null>();
  @Output() elementDropped = new EventEmitter<{ type: LabelElementType; position: { x: number; y: number } }>();
  @Output() elementChanged = new EventEmitter<{ id: string; changes: Partial<LabelElement> }>();

  zoom = 3;
  showGrid = true;
  showRulers = true;
  readonly gridSizeMm = 5;
  snapSettings: SnapSettings = { snapToGrid: true, snapToElement: true, thresholdMm: 2 };
  activeSnapLines: SnapLine[] = [];
  get gridPixels(): number { return this.mmToScreenPx(this.gridSizeMm); }
  get horizontalMarks(): number[] { return this.marks(this.template.label.width); }
  get verticalMarks(): number[] { return this.marks(this.template.label.height); }
  private marks(length: number): number[] {
    return Array.from({ length: Math.floor(length / 5) + 1 }, (_, i) => i * 5);
  }
  ngOnDestroy(): void { this.onDocumentMouseUp(); }
  cancelInteraction(): void {
    this.dragState = null; this.activeSnapLines = []; this.history.cancelTransaction();
  }
  resetZoom(): void { this.zoom = 1; }
  onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (this.dragState) return;
    const area = event.currentTarget as HTMLElement;
    const surface = area.querySelector<HTMLElement>('.label-surface')!;
    const rect = surface.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const previous = this.zoom;
    event.deltaY < 0 ? this.zoomIn() : this.zoomOut();
    const ratio = this.zoom / previous;
    this.cdr.detectChanges();
    const resized = surface.getBoundingClientRect();
    area.scrollLeft += resized.left + offsetX * ratio - event.clientX;
    area.scrollTop += resized.top + offsetY * ratio - event.clientY;
  }
  private dragState: DragState | null = null;

  constructor(
    private renderer: PriceLabelRendererService,
    public history: PriceLabelStateService,
    private cdr: ChangeDetectorRef
  ) {}

  get labelWidthPx(): number {
    return this.mmToScreenPx(this.template.label.width);
  }

  get labelHeightPx(): number {
    return this.mmToScreenPx(this.template.label.height);
  }

  get paddingStyles(): Record<string, string> {
    const label = this.template.label;
    return {
      top: `${this.mmToScreenPx(label.paddingTop)}px`,
      right: `${this.mmToScreenPx(label.paddingRight)}px`,
      bottom: `${this.mmToScreenPx(label.paddingBottom)}px`,
      left: `${this.mmToScreenPx(label.paddingLeft)}px`
    };
  }

  zoomIn(): void {
    this.zoom = Math.min(5, Math.round((this.zoom + 0.25) * 100) / 100);
  }

  zoomOut(): void {
    this.zoom = Math.max(0.25, Math.round((this.zoom - 0.25) * 100) / 100);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('label-surface')) {
      this.elementSelected.emit(null);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const type = event.dataTransfer?.getData('label-element-type') as LabelElementType;
    if (!type) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const position = {
      x: roundMm(pxToMm((event.clientX - rect.left) / this.zoom)),
      y: roundMm(pxToMm((event.clientY - rect.top) / this.zoom))
    };
    if (this.snapSettings.snapToGrid) {
      position.x = Math.round(position.x / this.gridSizeMm) * this.gridSizeMm;
      position.y = Math.round(position.y / this.gridSizeMm) * this.gridSizeMm;
    }
    this.elementDropped.emit({ type, position });
  }

  onElementMouseDown(event: MouseEvent, element: LabelElement): void {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).closest<HTMLElement>('.label-surface')?.focus({ preventScroll: true });
    element = this.history.getElement(element.id) || element;
    this.elementSelected.emit(element.id);
    if (element.locked || event.button !== 0) return;
    this.history.beginTransaction();
    this.dragState = this.createDragState('move', event, element);
  }

  onResizeMouseDown(event: MouseEvent, element: LabelElement, handle: ResizeHandle): void {
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLElement).closest<HTMLElement>('.label-surface')?.focus({ preventScroll: true });
    element = this.history.getElement(element.id) || element;
    this.elementSelected.emit(element.id);
    if (element.locked || event.button !== 0) return;
    this.history.beginTransaction();
    this.dragState = this.createDragState('resize', event, element, handle);
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.dragState) return;
    event.preventDefault();

    if (this.dragState.type === 'move') {
      this.applyMove(event);
    } else {
      this.applyResize(event);
    }
  }

  @HostListener('window:blur')
  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.dragState = null;
    this.activeSnapLines = [];
    this.history.endTransaction();
  }

  getElementStyles(element: LabelElement): Record<string, string> {
    const style: Record<string, string> = {
      left: `${this.mmToScreenPx(element.position.x)}px`,
      top: `${this.mmToScreenPx(element.position.y)}px`,
      width: `${this.mmToScreenPx(element.size.width)}px`,
      height: `${this.mmToScreenPx(element.size.height)}px`,
      zIndex: String(element.zIndex),
      opacity: String(element.style.opacity ?? 1),
      cursor: element.locked ? 'default' : 'move'
    };

    return style;
  }

  getContentStyles(element: LabelElement): Record<string, string> {
    return labelPresentation(element, this.zoom);
  }

  isSelected(element: LabelElement): boolean {
    return element.id === this.selectedElementId;
  }

  displayValue(element: LabelElement): string {
    const context = this.sampleContext;
    if (element.type === 'text') {
      const value = element.binding
        ? this.renderer.resolvePath(element.binding, context)
        : element.content;
      return String(value ?? '');
    }
    if (element.type === 'price') {
      const value = this.renderer.resolvePath(element.binding, context);
      const symbol = element.currencyPath
        ? String(this.renderer.resolvePath(element.currencyPath, context) ?? '')
        : '';
      return `${element.prefix || ''}${symbol} ${this.renderer.formatPrice(value, element.decimals)}`.trim();
    }
    if (element.type === 'barcode') {
      return String(this.renderer.resolvePath(element.binding, context) ?? '');
    }
    return '';
  }

  imageSource(element: LabelElement): string {
    if (element.type !== 'image') return '';
    return element.sourceType === 'binding'
      ? String(this.renderer.resolvePath(element.binding, this.sampleContext) ?? '')
      : (element.url || '');
  }

  imageFit(element: LabelElement): string {
    if (element.type !== 'image') return 'contain';
    return element.fit === 'stretch' ? 'fill' : element.fit;
  }

  trackElement(_index: number, element: LabelElement): string {
    return element.id;
  }

  private get sampleContext(): PriceLabelRenderContext {
    return {
      article: this.sampleArticle,
      company: this.sampleCompany
    };
  }

  private createDragState(
    type: 'move' | 'resize',
    event: MouseEvent,
    element: LabelElement,
    handle?: ResizeHandle
  ): DragState {
    return {
      type,
      element,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      startX: element.position.x,
      startY: element.position.y,
      startWidth: element.size.width,
      startHeight: element.size.height,
      handle
    };
  }

  private applyMove(event: MouseEvent): void {
    const state = this.dragState!;
    const dx = pxToMm((event.clientX - state.startMouseX) / this.zoom);
    const dy = pxToMm((event.clientY - state.startMouseY) / this.zoom);
    const maxX = Math.max(0, this.template.label.width - state.startWidth);
    const maxY = Math.max(0, this.template.label.height - state.startHeight);

    const snap = computeSnap({ x: state.startX + dx, y: state.startY + dy },
      { width: state.startWidth, height: state.startHeight }, this.candidates(state.element.id),
      this.snapSettings.thresholdMm, this.gridSizeMm, this.snapSettings.snapToGrid);
    const x = clamp(snap.x, 0, maxX), y = clamp(snap.y, 0, maxY);
    this.activeSnapLines = snap.snapLines.filter(line => line.orientation === 'vertical' ? x === snap.x : y === snap.y);
    this.elementChanged.emit({
      id: state.element.id,
      changes: {
        position: {
          x: roundMm(x),
          y: roundMm(y)
        }
      } as Partial<LabelElement>
    });
  }

  private applyResize(event: MouseEvent): void {
    const state = this.dragState!;
    const dx = pxToMm((event.clientX - state.startMouseX) / this.zoom);
    const dy = pxToMm((event.clientY - state.startMouseY) / this.zoom);
    const handle = state.handle || 'se';
    const right = state.startX + state.startWidth;
    const bottom = state.startY + state.startHeight;
    let x = state.startX, y = state.startY, endX = right, endY = bottom;
    const proposedX = handle.includes('w') ? state.startX + dx : right + dx;
    const proposedY = handle.includes('n') ? state.startY + dy : bottom + dy;
    // Snap the moving edge only. Opposite edges stay fixed during resize.
    const snap = computeSnap({ x: proposedX, y: proposedY }, { width: 0, height: 0 },
      this.candidates(state.element.id), this.snapSettings.thresholdMm, this.gridSizeMm, this.snapSettings.snapToGrid);
    if (handle.includes('w')) x = clamp(snap.x, 0, right - 2);
    if (handle.includes('e')) endX = clamp(snap.x, state.startX + 2, this.template.label.width);
    if (handle.includes('n')) y = clamp(snap.y, 0, bottom - 2);
    if (handle.includes('s')) endY = clamp(snap.y, state.startY + 2, this.template.label.height);
    const width = endX - x, height = endY - y;
    this.activeSnapLines = snap.snapLines.filter(line => line.orientation === 'vertical'
      ? (handle.includes('w') && x === snap.x) || (handle.includes('e') && endX === snap.x)
      : (handle.includes('n') && y === snap.y) || (handle.includes('s') && endY === snap.y));

    this.elementChanged.emit({
      id: state.element.id,
      changes: {
        position: { x: roundMm(x), y: roundMm(y) },
        size: { width: roundMm(width), height: roundMm(height) }
      } as Partial<LabelElement>
    });
  }

  private candidates(excludeId: string) {
    return collectSnapCandidates(this.template.elements, new Set([excludeId]), this.snapSettings);
  }

  mmToScreenPx(mm: number): number {
    return mmToPx(mm) * this.zoom;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}
