/**
 * Design Canvas Component
 * The central A4 surface where users place and manipulate elements.
 * Renders header, detail, and footer sections with proper mm→px sizing.
 * Uses native mouse events for drag & resize (no interact.js dependency).
 */
import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, combineLatest } from 'rxjs';
import {
  ReportTemplate,
  TemplateElement,
  PageSettings
} from '../../../../core/models/template.model';
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';
import { mmToPx, pxToMm, snapToGrid } from '../../utils/coordinate-utils';
import { ElementRendererComponent } from '../element-renderer/element-renderer.component';

type SectionKey = 'header' | 'detail' | 'footer';

/** Tracks an active drag or resize operation */
interface DragState {
  type: 'move' | 'resize';
  elementId: string;
  section: SectionKey;
  startMouseX: number;
  startMouseY: number;
  startElX: number;       // original element position in mm
  startElY: number;
  startElWidth: number;   // original element size in mm
  startElHeight: number;
  resizeHandle?: string;  // 'nw','n','ne','e','se','s','sw','w'
  /** Current offset in px (for real-time visual feedback) */
  currentDx: number;
  currentDy: number;
  currentWidth: number;   // in px, for resize visual feedback
  currentHeight: number;  // in px, for resize visual feedback
}

@Component({
  selector: 'app-design-canvas',
  standalone: true,
  imports: [CommonModule, ElementRendererComponent],
  templateUrl: './design-canvas.component.html',
  styleUrl: './design-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignCanvasComponent implements OnInit, OnDestroy {
  @ViewChild('canvasPage') canvasPage!: ElementRef<HTMLDivElement>;

  template!: ReportTemplate;
  selectedIds = new Set<string>();
  activeSection: SectionKey = 'header';

  // Page dimensions in px (computed from mm)
  pageWidthPx = 0;
  pageHeightPx = 0;
  contentWidthPx = 0;

  // Section heights in px
  headerHeightPx = 0;
  detailHeightPx = 0;
  footerHeightPx = 0;

  // Grid settings
  gridSizeMm = 5;
  showGrid = true;
  snapEnabled = true;

  // Zoom
  zoom = 1;

  // Ruler marks
  horizontalMarks: number[] = [];
  verticalMarks: number[] = [];

  // Drag/resize state
  dragState: DragState | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private templateState: TemplateStateService,
    private selectionService: SelectionService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.templateState.template$,
      this.selectionService.selectedIds$,
      this.selectionService.activeSection$
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([template, selectedIds, activeSection]) => {
        this.template = template;
        this.selectedIds = selectedIds;
        this.activeSection = activeSection;
        this.computeDimensions();
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Global mouse listeners (must be on document to catch moves outside canvas) ───

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.dragState) return;
    event.preventDefault();

    const dx = event.clientX - this.dragState.startMouseX;
    const dy = event.clientY - this.dragState.startMouseY;

    if (this.dragState.type === 'move') {
      this.dragState.currentDx = dx;
      this.dragState.currentDy = dy;
    } else if (this.dragState.type === 'resize') {
      this.applyResizeDelta(dx, dy);
    }

    this.cdr.markForCheck();
  }

  @HostListener('document:mouseup', ['$event'])
  onDocumentMouseUp(event: MouseEvent): void {
    if (!this.dragState) return;

    if (this.dragState.type === 'move') {
      this.commitMove();
    } else if (this.dragState.type === 'resize') {
      this.commitResize();
    }

    this.dragState = null;
    this.cdr.markForCheck();
  }

  // ─── Compute dimensions ───

  private computeDimensions(): void {
    if (!this.template) return;

    const page = this.template.page;
    this.pageWidthPx = mmToPx(page.width);
    this.pageHeightPx = mmToPx(page.height);
    this.contentWidthPx = mmToPx(page.width - page.margins.left - page.margins.right);

    this.headerHeightPx = mmToPx(this.template.sections.header.height);
    this.detailHeightPx = mmToPx(this.template.sections.detail.height);
    this.footerHeightPx = mmToPx(this.template.sections.footer.height);

    this.horizontalMarks = [];
    for (let mm = 0; mm <= page.width; mm += 10) {
      this.horizontalMarks.push(mm);
    }
    this.verticalMarks = [];
    for (let mm = 0; mm <= page.height; mm += 10) {
      this.verticalMarks.push(mm);
    }
  }

  /** mmToPx exposed to template for binding */
  mmToPx(mm: number): number {
    return mmToPx(mm);
  }

  // ─── Canvas click (deselect) ───

  onCanvasClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (
      target.classList.contains('section-body') ||
      target.classList.contains('canvas-page') ||
      target.classList.contains('section-area')
    ) {
      this.selectionService.clearSelection();
    }
  }

  // ─── Element selection ───

  onElementSelected(event: {
    elementId: string;
    section: SectionKey;
    event: MouseEvent;
  }): void {
    if (event.event.shiftKey) {
      this.selectionService.toggleSelect(event.elementId, event.section);
    } else {
      this.selectionService.select(event.elementId, event.section);
    }
  }

  isElementSelected(elementId: string): boolean {
    return this.selectedIds.has(elementId);
  }

  // ─── Section helpers ───

  getSectionLabel(key: SectionKey): string {
    const labels: Record<SectionKey, string> = {
      header: 'Encabezado',
      detail: 'Detalle',
      footer: 'Pie'
    };
    return labels[key];
  }

  getSectionHeightPx(key: SectionKey): number {
    switch (key) {
      case 'header': return this.headerHeightPx;
      case 'detail': return this.detailHeightPx;
      case 'footer': return this.footerHeightPx;
    }
  }

  getSectionElements(key: SectionKey): TemplateElement[] {
    const section = this.template?.sections[key];
    return section?.elements || [];
  }

  trackByElementId(index: number, element: TemplateElement): string {
    return element.id;
  }

  isSectionActive(key: SectionKey): boolean {
    return this.activeSection === key;
  }

  onSectionLabelClick(section: SectionKey): void {
    this.selectionService.setActiveSection(section);
  }

  // ─── Drag start (from element-renderer mousedown) ───

  onElementDragStart(event: {
    elementId: string;
    section: SectionKey;
    mouseEvent: MouseEvent;
    handle?: string;
  }): void {
    const el = this.templateState.getElement(event.section as any, event.elementId);
    if (!el || el.locked) return;

    const isResize = !!event.handle;

    this.dragState = {
      type: isResize ? 'resize' : 'move',
      elementId: event.elementId,
      section: event.section,
      startMouseX: event.mouseEvent.clientX,
      startMouseY: event.mouseEvent.clientY,
      startElX: el.position.x,
      startElY: el.position.y,
      startElWidth: el.size.width,
      startElHeight: el.size.height,
      resizeHandle: event.handle,
      currentDx: 0,
      currentDy: 0,
      currentWidth: mmToPx(el.size.width),
      currentHeight: mmToPx(el.size.height)
    };
  }

  // ─── Get element visual transform during drag ───

  getElementTransform(elementId: string): string {
    if (!this.dragState || this.dragState.elementId !== elementId) return '';
    if (this.dragState.type !== 'move') return '';
    return `translate(${this.dragState.currentDx}px, ${this.dragState.currentDy}px)`;
  }

  getElementDragWidth(elementId: string): number | null {
    if (!this.dragState || this.dragState.elementId !== elementId) return null;
    if (this.dragState.type !== 'resize') return null;
    return this.dragState.currentWidth;
  }

  getElementDragHeight(elementId: string): number | null {
    if (!this.dragState || this.dragState.elementId !== elementId) return null;
    if (this.dragState.type !== 'resize') return null;
    return this.dragState.currentHeight;
  }

  getElementDragTransform(elementId: string): string {
    if (!this.dragState || this.dragState.elementId !== elementId) return '';
    if (this.dragState.type !== 'resize') return '';
    return `translate(${this.dragState.currentDx}px, ${this.dragState.currentDy}px)`;
  }

  isDragging(elementId: string): boolean {
    return this.dragState?.elementId === elementId;
  }

  // ─── Resize delta calculation ───

  private applyResizeDelta(dx: number, dy: number): void {
    if (!this.dragState || this.dragState.type !== 'resize') return;

    const handle = this.dragState.resizeHandle || 'se';
    const startW = mmToPx(this.dragState.startElWidth);
    const startH = mmToPx(this.dragState.startElHeight);
    const minSize = mmToPx(2); // minimum 2mm

    let newW = startW;
    let newH = startH;
    let offsetDx = 0;
    let offsetDy = 0;

    // Right edge
    if (handle.includes('e')) {
      newW = Math.max(minSize, startW + dx);
    }
    // Left edge
    if (handle.includes('w')) {
      newW = Math.max(minSize, startW - dx);
      offsetDx = startW - newW; // shift position
    }
    // Bottom edge
    if (handle.includes('s')) {
      newH = Math.max(minSize, startH + dy);
    }
    // Top edge
    if (handle.includes('n')) {
      newH = Math.max(minSize, startH - dy);
      offsetDy = startH - newH;
    }

    this.dragState.currentWidth = newW;
    this.dragState.currentHeight = newH;
    this.dragState.currentDx = offsetDx;
    this.dragState.currentDy = offsetDy;
  }

  // ─── Commit move to state ───

  private commitMove(): void {
    if (!this.dragState) return;

    const dx = this.dragState.currentDx;
    const dy = this.dragState.currentDy;

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // no meaningful move

    let newX = this.dragState.startElX + pxToMm(dx / this.zoom);
    let newY = this.dragState.startElY + pxToMm(dy / this.zoom);

    if (this.snapEnabled) {
      newX = snapToGrid(newX, this.gridSizeMm);
      newY = snapToGrid(newY, this.gridSizeMm);
    }

    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    this.templateState.updateElement(
      this.dragState.section as any,
      this.dragState.elementId,
      { position: { x: newX, y: newY } } as any
    );
  }

  // ─── Commit resize to state ───

  private commitResize(): void {
    if (!this.dragState) return;

    let newWidth = pxToMm(this.dragState.currentWidth / this.zoom);
    let newHeight = pxToMm(this.dragState.currentHeight / this.zoom);
    let newX = this.dragState.startElX + pxToMm(this.dragState.currentDx / this.zoom);
    let newY = this.dragState.startElY + pxToMm(this.dragState.currentDy / this.zoom);

    if (this.snapEnabled) {
      newWidth = snapToGrid(newWidth, this.gridSizeMm);
      newHeight = snapToGrid(newHeight, this.gridSizeMm);
      newX = snapToGrid(newX, this.gridSizeMm);
      newY = snapToGrid(newY, this.gridSizeMm);
    }

    newWidth = Math.max(2, newWidth);
    newHeight = Math.max(2, newHeight);
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    this.templateState.updateElement(
      this.dragState.section as any,
      this.dragState.elementId,
      {
        position: { x: newX, y: newY },
        size: { width: newWidth, height: newHeight }
      } as any
    );
  }

  // ─── Toolbox drop ───

  onDrop(event: DragEvent, section: SectionKey): void {
    event.preventDefault();
    const elementType = event.dataTransfer?.getData('element-type');
    if (!elementType) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const xPx = event.clientX - rect.left;
    const yPx = event.clientY - rect.top;

    let xMm = pxToMm(xPx / this.zoom);
    let yMm = pxToMm(yPx / this.zoom);

    if (this.snapEnabled) {
      xMm = snapToGrid(xMm, this.gridSizeMm);
      yMm = snapToGrid(yMm, this.gridSizeMm);
    }

    import('../../utils/element-factory').then(factory => {
      const newElement = factory.createElement(elementType as any, { x: xMm, y: yMm });
      this.templateState.addElement(section as any, newElement);
      this.selectionService.select(newElement.id, section);
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  // ─── Zoom controls ───

  zoomIn(): void {
    this.zoom = Math.min(this.zoom + 0.1, 2);
  }

  zoomOut(): void {
    this.zoom = Math.max(this.zoom - 0.1, 0.3);
  }

  resetZoom(): void {
    this.zoom = 1;
  }

  toggleGrid(): void {
    this.showGrid = !this.showGrid;
  }

  toggleSnap(): void {
    this.snapEnabled = !this.snapEnabled;
  }
}
