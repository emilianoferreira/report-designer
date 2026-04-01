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
  AfterViewInit,
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
  PageSettings,
  GuideLine
} from '../../../../core/models/template.model';
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';
import {
  mmToPx, pxToMm, snapToGrid, PAPER_PRESETS, PaperPreset,
  SnapLine, SnapSettings, collectSnapCandidates, computeSnap
} from '../../utils/coordinate-utils';
import { createElement } from '../../utils/element-factory';
import { v4 as uuid } from 'uuid';
import { FormsModule } from '@angular/forms';
import { ElementRendererComponent } from '../element-renderer/element-renderer.component';

type SectionKey = 'header' | 'detail' | 'footer';

/** Tracks an active drag or resize operation (single element) */
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

/** Tracks a multi-element move operation */
interface MultiDragState {
  type: 'multi-move';
  anchorElementId: string;
  section: SectionKey;
  startMouseX: number;
  startMouseY: number;
  startPositions: Map<string, { x: number; y: number }>;
  currentDx: number;
  currentDy: number;
}

/** Tracks an active marquee (rubber-band) selection */
interface MarqueeState {
  startClientX: number;
  startClientY: number;
  startXMm: number;
  startYMm: number;
  currentXMm: number;
  currentYMm: number;
  additive: boolean;
  previousIds: string[];
  sectionBodyRect: DOMRect;
  section: SectionKey;
}

@Component({
  selector: 'app-design-canvas',
  standalone: true,
  imports: [CommonModule, FormsModule, ElementRendererComponent],
  templateUrl: './design-canvas.component.html',
  styleUrl: './design-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignCanvasComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('canvasPage') canvasPage!: ElementRef<HTMLDivElement>;
  @ViewChild('scrollArea') scrollArea!: ElementRef<HTMLDivElement>;

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
  snapSettings: SnapSettings = {
    snapToGrid: true,
    snapToGuide: true,
    snapToElement: true,
    thresholdMm: 2
  };

  // Guide creation / drag state
  guideCreationState: {
    orientation: 'horizontal' | 'vertical';
    currentPositionMm: number;
  } | null = null;

  guideDragState: {
    guideId: string;
    orientation: 'horizontal' | 'vertical';
    startMousePos: number;
    startGuideMm: number;
  } | null = null;

  // Smart snap lines (ephemeral, shown during element drag)
  activeSnapLines: SnapLine[] = [];

  // Zoom
  readonly ZOOM_MIN = 0.25;
  readonly ZOOM_MAX = 2;
  readonly ZOOM_STEP = 0.05;
  zoom = 1;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;

  // Paper size
  paperPresets = PAPER_PRESETS;
  selectedPaperType = 'a4';
  customWidth = 210;
  customHeight = 297;

  // Ruler marks
  horizontalMarks: number[] = [];
  verticalMarks: number[] = [];

  // Drag/resize state
  dragState: DragState | MultiDragState | null = null;

  // Marquee selection state
  marqueeState: MarqueeState | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    public templateState: TemplateStateService,
    private selectionService: SelectionService,
    public cdr: ChangeDetectorRef,
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

  ngAfterViewInit(): void {
    // Bind wheel event with passive:false so we can preventDefault for zoom
    this.wheelHandler = (e: WheelEvent) => this.onWheel(e);
    this.scrollArea.nativeElement.addEventListener('wheel', this.wheelHandler, { passive: false });
  }

  ngOnDestroy(): void {
    // Clean up wheel listener
    if (this.wheelHandler && this.scrollArea?.nativeElement) {
      this.scrollArea.nativeElement.removeEventListener('wheel', this.wheelHandler);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Global mouse listeners (must be on document to catch moves outside canvas) ───

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    // ─── Guide creation drag ───
    if (this.guideCreationState) {
      event.preventDefault();
      const pageEl = this.canvasPage?.nativeElement;
      if (pageEl) {
        const rect = pageEl.getBoundingClientRect();
        if (this.guideCreationState.orientation === 'vertical') {
          this.guideCreationState.currentPositionMm = pxToMm((event.clientX - rect.left) / this.zoom);
        } else {
          this.guideCreationState.currentPositionMm = pxToMm((event.clientY - rect.top) / this.zoom);
        }
      }
      this.cdr.markForCheck();
      return;
    }

    // ─── Guide repositioning drag ───
    if (this.guideDragState) {
      event.preventDefault();
      const mousePos = this.guideDragState.orientation === 'horizontal'
        ? event.clientY : event.clientX;
      const deltaPx = mousePos - this.guideDragState.startMousePos;
      const deltaMm = pxToMm(deltaPx / this.zoom);
      this.guideDragState.startGuideMm; // preview handled via template binding
      // Temporarily update guide position for preview
      const newPos = this.guideDragState.startGuideMm + deltaMm;
      this.templateState.updateGuidePosition(this.guideDragState.guideId, newPos);
      this.cdr.markForCheck();
      return;
    }

    // ─── Marquee drag ───
    if (this.marqueeState) {
      event.preventDefault();
      const rect = this.marqueeState.sectionBodyRect;
      this.marqueeState.currentXMm = pxToMm((event.clientX - rect.left) / this.zoom);
      this.marqueeState.currentYMm = pxToMm((event.clientY - rect.top) / this.zoom);

      // Compute which elements intersect the marquee
      const ids = this.getElementsInMarquee();
      if (this.marqueeState.additive) {
        const union = new Set([...this.marqueeState.previousIds, ...ids]);
        this.selectionService.selectMultiple(Array.from(union), this.marqueeState.section);
      } else {
        this.selectionService.selectMultiple(ids, this.marqueeState.section);
      }
      this.cdr.markForCheck();
      return;
    }

    if (!this.dragState) return;
    event.preventDefault();

    const dx = event.clientX - this.dragState.startMouseX;
    const dy = event.clientY - this.dragState.startMouseY;

    if (this.dragState.type === 'move') {
      // Compute snap in real time for smart guides
      const state = this.dragState as DragState;
      const proposedX = state.startElX + pxToMm(dx / this.zoom);
      const proposedY = state.startElY + pxToMm(dy / this.zoom);
      const el = this.templateState.getElement(state.section as any, state.elementId);
      if (el) {
        const candidates = this.getSnapCandidates(state.section, new Set([state.elementId]));
        const snap = computeSnap(
          { x: proposedX, y: proposedY }, el.size,
          candidates, this.snapSettings.thresholdMm,
          this.gridSizeMm, this.snapSettings.snapToGrid
        );
        this.activeSnapLines = snap.snapLines;
        // Convert snapped mm back to px offset for visual feedback
        state.currentDx = mmToPx(snap.x - state.startElX) * this.zoom;
        state.currentDy = mmToPx(snap.y - state.startElY) * this.zoom;
      } else {
        state.currentDx = dx;
        state.currentDy = dy;
      }
    } else if (this.dragState.type === 'multi-move') {
      this.dragState.currentDx = dx;
      this.dragState.currentDy = dy;
      // Show snap lines for anchor element
      const anchor = this.templateState.getElement(
        this.dragState.section as any, this.dragState.anchorElementId
      );
      const startPos = this.dragState.startPositions.get(this.dragState.anchorElementId);
      if (anchor && startPos) {
        const proposedX = startPos.x + pxToMm(dx / this.zoom);
        const proposedY = startPos.y + pxToMm(dy / this.zoom);
        const candidates = this.getSnapCandidates(
          this.dragState.section,
          new Set(this.dragState.startPositions.keys())
        );
        const snap = computeSnap(
          { x: proposedX, y: proposedY }, anchor.size,
          candidates, this.snapSettings.thresholdMm,
          this.gridSizeMm, this.snapSettings.snapToGrid
        );
        this.activeSnapLines = snap.snapLines;
      }
    } else if (this.dragState.type === 'resize') {
      this.applyResizeDelta(dx, dy);
    }

    this.cdr.markForCheck();
  }

  @HostListener('document:mouseup', ['$event'])
  onDocumentMouseUp(event: MouseEvent): void {
    // ─── End guide creation ───
    if (this.guideCreationState) {
      const pos = this.guideCreationState.currentPositionMm;
      const orientation = this.guideCreationState.orientation;
      const maxPos = orientation === 'vertical'
        ? this.template.page.width : this.template.page.height;
      // Only create if within page bounds
      if (pos > 0 && pos < maxPos) {
        this.templateState.addGuide({
          id: uuid(),
          orientation,
          position: pos
        });
      }
      this.guideCreationState = null;
      this.cdr.markForCheck();
      return;
    }

    // ─── End guide drag ───
    if (this.guideDragState) {
      // If guide was dragged outside page bounds, delete it
      const guide = (this.template.page.guides || []).find(
        g => g.id === this.guideDragState!.guideId
      );
      if (guide) {
        const maxPos = guide.orientation === 'vertical'
          ? this.template.page.width : this.template.page.height;
        if (guide.position <= 0 || guide.position >= maxPos) {
          this.templateState.removeGuide(guide.id);
        }
      }
      this.guideDragState = null;
      this.cdr.markForCheck();
      return;
    }

    // ─── End marquee ───
    if (this.marqueeState) {
      const dx = event.clientX - this.marqueeState.startClientX;
      const dy = event.clientY - this.marqueeState.startClientY;
      // If barely moved, treat as a click → clear selection
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        this.selectionService.clearSelection();
      }
      this.marqueeState = null;
      this.cdr.markForCheck();
      return;
    }

    if (!this.dragState) return;

    if (this.dragState.type === 'move') {
      this.commitMove();
    } else if (this.dragState.type === 'multi-move') {
      this.commitMultiMove();
    } else if (this.dragState.type === 'resize') {
      this.commitResize();
    }

    this.dragState = null;
    this.activeSnapLines = [];
    this.cdr.markForCheck();
  }

  // ─── Keyboard shortcuts ───

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;

    // Ctrl+Z / Cmd+Z → Undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      if (!isInput) {
        event.preventDefault();
        this.templateState.undo();
        this.cdr.markForCheck();
        return;
      }
    }

    // Ctrl+Y / Cmd+Y / Ctrl+Shift+Z → Redo
    if (
      ((event.ctrlKey || event.metaKey) && event.key === 'y') ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z') ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Z')
    ) {
      if (!isInput) {
        event.preventDefault();
        this.templateState.redo();
        this.cdr.markForCheck();
        return;
      }
    }

    // Delete/Backspace → remove selected elements (skip if user is typing in an input)
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (isInput) return;

      if (this.selectedIds.size > 0) {
        event.preventDefault();
        const idsToDelete = Array.from(this.selectedIds);
        for (const id of idsToDelete) {
          this.templateState.removeElement(this.activeSection as any, id);
        }
        this.selectionService.clearSelection();
        this.cdr.markForCheck();
      }
    }
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

    // Sync paper selector state from template
    this.selectedPaperType = page.paperType || 'a4';
    if (this.selectedPaperType === 'custom') {
      this.customWidth = page.width;
      this.customHeight = page.height;
    }

    this.horizontalMarks = [];
    for (let mm = 0; mm <= page.width; mm += 5) {
      this.horizontalMarks.push(mm);
    }
    this.verticalMarks = [];
    for (let mm = 0; mm <= page.height; mm += 5) {
      this.verticalMarks.push(mm);
    }
  }

  /** mmToPx exposed to template for binding */
  mmToPx(mm: number): number {
    return mmToPx(mm);
  }

  // ─── Canvas click (deselect) ───

  onCanvasClick(event: MouseEvent): void {
    // Deselection is now handled by marquee mouseup (tiny-move = click = clear).
    // Only clear when clicking canvas-page or section-area directly (not section-body,
    // which is handled by onSectionBodyMouseDown for marquee).
    const target = event.target as HTMLElement;
    if (
      target.classList.contains('canvas-page') ||
      target.classList.contains('section-area')
    ) {
      this.selectionService.clearSelection();
    }
  }

  // ─── Marquee selection (rubber-band) ───

  onSectionBodyMouseDown(event: MouseEvent, section: SectionKey): void {
    // Only start marquee from empty space (section-body itself)
    const target = event.target as HTMLElement;
    if (!target.classList.contains('section-body')) return;
    if (event.button !== 0) return; // left-click only

    const rect = target.getBoundingClientRect();
    const xMm = pxToMm((event.clientX - rect.left) / this.zoom);
    const yMm = pxToMm((event.clientY - rect.top) / this.zoom);

    this.marqueeState = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startXMm: xMm,
      startYMm: yMm,
      currentXMm: xMm,
      currentYMm: yMm,
      additive: event.shiftKey,
      previousIds: event.shiftKey ? Array.from(this.selectedIds) : [],
      sectionBodyRect: rect,
      section
    };

    this.selectionService.setActiveSection(section);
    if (!event.shiftKey) {
      this.selectionService.clearSelection();
    }

    event.preventDefault();
  }

  /** Get marquee rectangle normalized (min/max) in mm */
  get marqueeRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.marqueeState) return null;
    const x1 = Math.min(this.marqueeState.startXMm, this.marqueeState.currentXMm);
    const y1 = Math.min(this.marqueeState.startYMm, this.marqueeState.currentYMm);
    const x2 = Math.max(this.marqueeState.startXMm, this.marqueeState.currentXMm);
    const y2 = Math.max(this.marqueeState.startYMm, this.marqueeState.currentYMm);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  /** Find elements whose bounding box intersects the marquee */
  private getElementsInMarquee(): string[] {
    if (!this.marqueeState) return [];
    const rect = this.marqueeRect!;
    const x1 = rect.x;
    const y1 = rect.y;
    const x2 = rect.x + rect.w;
    const y2 = rect.y + rect.h;

    return this.getSectionElements(this.marqueeState.section)
      .filter(el => !el.locked &&
        el.position.x < x2 &&
        el.position.x + el.size.width > x1 &&
        el.position.y < y2 &&
        el.position.y + el.size.height > y1
      )
      .map(el => el.id);
  }

  // ─── Element selection ───

  onElementSelected(event: {
    elementId: string;
    section: SectionKey;
    event: MouseEvent;
  }): void {
    if (event.event.shiftKey) {
      this.selectionService.toggleSelect(event.elementId, event.section);
    } else if (this.selectedIds.size > 1 && this.selectedIds.has(event.elementId)) {
      // Element is already part of a multi-selection — keep selection intact for multi-drag
      // (selection will be reduced to single on mouseup if no drag occurred)
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

    // Multi-drag: if multiple elements selected and dragged element is in selection (no resize)
    if (!isResize && this.selectedIds.size > 1 && this.selectedIds.has(event.elementId)) {
      const startPositions = new Map<string, { x: number; y: number }>();
      this.selectedIds.forEach(id => {
        const selEl = this.templateState.getElement(event.section as any, id);
        if (selEl && !selEl.locked) {
          startPositions.set(id, { x: selEl.position.x, y: selEl.position.y });
        }
      });

      this.dragState = {
        type: 'multi-move',
        anchorElementId: event.elementId,
        section: event.section,
        startMouseX: event.mouseEvent.clientX,
        startMouseY: event.mouseEvent.clientY,
        startPositions,
        currentDx: 0,
        currentDy: 0
      };
      return;
    }

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
    if (!this.dragState) return '';
    // Multi-move: same transform for all selected elements
    if (this.dragState.type === 'multi-move' && this.dragState.startPositions.has(elementId)) {
      return `translate(${this.dragState.currentDx}px, ${this.dragState.currentDy}px)`;
    }
    // Single move
    if (this.dragState.type === 'move' && (this.dragState as DragState).elementId === elementId) {
      return `translate(${this.dragState.currentDx}px, ${this.dragState.currentDy}px)`;
    }
    return '';
  }

  getElementDragWidth(elementId: string): number | null {
    if (!this.dragState || this.dragState.type !== 'resize') return null;
    if ((this.dragState as DragState).elementId !== elementId) return null;
    return (this.dragState as DragState).currentWidth;
  }

  getElementDragHeight(elementId: string): number | null {
    if (!this.dragState || this.dragState.type !== 'resize') return null;
    if ((this.dragState as DragState).elementId !== elementId) return null;
    return (this.dragState as DragState).currentHeight;
  }

  getElementDragTransform(elementId: string): string {
    if (!this.dragState || this.dragState.type !== 'resize') return '';
    if ((this.dragState as DragState).elementId !== elementId) return '';
    return `translate(${this.dragState.currentDx}px, ${this.dragState.currentDy}px)`;
  }

  isDragging(elementId: string): boolean {
    if (!this.dragState) return false;
    if (this.dragState.type === 'multi-move') {
      return this.dragState.startPositions.has(elementId);
    }
    return (this.dragState as DragState).elementId === elementId;
  }

  // ─── Resize delta calculation ───

  private applyResizeDelta(dx: number, dy: number): void {
    if (!this.dragState || this.dragState.type !== 'resize') return;
    const state = this.dragState as DragState;

    const handle = state.resizeHandle || 'se';
    const startW = mmToPx(state.startElWidth);
    const startH = mmToPx(state.startElHeight);
    const minSize = mmToPx(2); // minimum 2mm

    // Compensate for zoom: mouse deltas are in screen pixels,
    // but element dimensions are in canvas (unzoomed) pixels
    const zoomedDx = dx / this.zoom;
    const zoomedDy = dy / this.zoom;

    let newW = startW;
    let newH = startH;
    let offsetDx = 0;
    let offsetDy = 0;

    // Right edge
    if (handle.includes('e')) {
      newW = Math.max(minSize, startW + zoomedDx);
    }
    // Left edge
    if (handle.includes('w')) {
      newW = Math.max(minSize, startW - zoomedDx);
      offsetDx = startW - newW; // shift position
    }
    // Bottom edge
    if (handle.includes('s')) {
      newH = Math.max(minSize, startH + zoomedDy);
    }
    // Top edge
    if (handle.includes('n')) {
      newH = Math.max(minSize, startH - zoomedDy);
      offsetDy = startH - newH;
    }

    state.currentWidth = newW;
    state.currentHeight = newH;
    state.currentDx = offsetDx;
    state.currentDy = offsetDy;
  }

  // ─── Commit move to state ───

  private commitMove(): void {
    if (!this.dragState || this.dragState.type !== 'move') return;
    const state = this.dragState as DragState;

    const dx = state.currentDx;
    const dy = state.currentDy;

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // no meaningful move

    // Snap was already applied during mousemove for real-time feedback.
    // Convert the final visual offset back to mm.
    let newX = state.startElX + pxToMm(dx / this.zoom);
    let newY = state.startElY + pxToMm(dy / this.zoom);

    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    this.templateState.updateElement(
      state.section as any,
      state.elementId,
      { position: { x: newX, y: newY } } as any
    );
  }

  // ─── Commit multi-move to state ───

  private commitMultiMove(): void {
    if (!this.dragState || this.dragState.type !== 'multi-move') return;

    const dx = this.dragState.currentDx;
    const dy = this.dragState.currentDy;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    const excludeIds = new Set(this.dragState.startPositions.keys());
    const anchor = this.templateState.getElement(
      this.dragState.section as any, this.dragState.anchorElementId
    );

    // Compute snap delta from anchor element
    let snapDeltaX = 0;
    let snapDeltaY = 0;
    const startPos = this.dragState.startPositions.get(this.dragState.anchorElementId);
    if (anchor && startPos) {
      const proposedX = startPos.x + pxToMm(dx / this.zoom);
      const proposedY = startPos.y + pxToMm(dy / this.zoom);
      const candidates = this.getSnapCandidates(this.dragState.section, excludeIds);
      const snap = computeSnap(
        { x: proposedX, y: proposedY }, anchor.size,
        candidates, this.snapSettings.thresholdMm,
        this.gridSizeMm, this.snapSettings.snapToGrid
      );
      snapDeltaX = snap.x - proposedX;
      snapDeltaY = snap.y - proposedY;
    }

    const updates: Array<{ id: string; changes: Partial<TemplateElement> }> = [];
    this.dragState.startPositions.forEach((sp, id) => {
      let newX = sp.x + pxToMm(dx / this.zoom) + snapDeltaX;
      let newY = sp.y + pxToMm(dy / this.zoom) + snapDeltaY;
      newX = Math.max(0, newX);
      newY = Math.max(0, newY);
      updates.push({ id, changes: { position: { x: newX, y: newY } } as any });
    });

    this.templateState.updateMultipleElements(this.dragState.section as any, updates);
  }

  // ─── Commit resize to state ───

  private commitResize(): void {
    if (!this.dragState || this.dragState.type !== 'resize') return;
    const state = this.dragState as DragState;

    // currentWidth/Height and currentDx/Dy are already zoom-compensated
    // (zoom was applied in applyResizeDelta), so convert px→mm directly
    let newWidth = pxToMm(state.currentWidth);
    let newHeight = pxToMm(state.currentHeight);
    let newX = state.startElX + pxToMm(state.currentDx);
    let newY = state.startElY + pxToMm(state.currentDy);

    // Apply snap to the resulting edges
    const candidates = this.getSnapCandidates(state.section, new Set([state.elementId]));
    const snap = computeSnap(
      { x: newX, y: newY },
      { width: newWidth, height: newHeight },
      candidates, this.snapSettings.thresholdMm,
      this.gridSizeMm, this.snapSettings.snapToGrid
    );
    newX = snap.x;
    newY = snap.y;

    // Also snap width/height to grid if grid snap is active
    if (this.snapSettings.snapToGrid) {
      newWidth = snapToGrid(newWidth, this.gridSizeMm);
      newHeight = snapToGrid(newHeight, this.gridSizeMm);
    }

    newWidth = Math.max(2, newWidth);
    newHeight = Math.max(2, newHeight);
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    this.templateState.updateElement(
      state.section as any,
      state.elementId,
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

    if (this.snapSettings.snapToGrid) {
      xMm = snapToGrid(xMm, this.gridSizeMm);
      yMm = snapToGrid(yMm, this.gridSizeMm);
    }

    this.ngZone.run(() => {
      const newElement = createElement(elementType as any, { x: xMm, y: yMm });
      this.templateState.addElement(section as any, newElement);
      this.selectionService.select(newElement.id, section);
      this.cdr.markForCheck();
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
    this.zoom = Math.min(Math.round((this.zoom + 0.1) * 100) / 100, this.ZOOM_MAX);
  }

  zoomOut(): void {
    this.zoom = Math.max(Math.round((this.zoom - 0.1) * 100) / 100, this.ZOOM_MIN);
  }

  resetZoom(): void {
    this.zoom = 1;
  }

  /**
   * Wheel zoom: Ctrl+wheel or pinch-to-zoom on trackpad.
   * Zooms centered on the cursor position so the point under the cursor stays fixed.
   */
  private onWheel(e: WheelEvent): void {
    // Only zoom when Ctrl/Meta is held (browser sends ctrlKey=true for pinch gestures too)
    if (!e.ctrlKey && !e.metaKey) return;

    e.preventDefault();
    e.stopPropagation();

    const el = this.scrollArea.nativeElement;
    const rect = el.getBoundingClientRect();

    // Cursor position relative to the scroll container viewport
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Cursor position in the content (accounting for current scroll + zoom)
    const contentX = (el.scrollLeft + cursorX);
    const contentY = (el.scrollTop + cursorY);

    // Calculate new zoom
    const oldZoom = this.zoom;
    const delta = -e.deltaY * this.ZOOM_STEP * 0.1; // smooth small increments
    let newZoom = oldZoom + delta;
    newZoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, newZoom));
    newZoom = Math.round(newZoom * 100) / 100;

    if (newZoom === oldZoom) return;

    const scale = newZoom / oldZoom;

    // Apply zoom
    this.zoom = newZoom;
    this.cdr.markForCheck();

    // Adjust scroll so the point under the cursor stays in the same viewport position
    // After zoom, the content point that was at contentX,contentY is now at contentX*scale, contentY*scale
    requestAnimationFrame(() => {
      el.scrollLeft = contentX * scale - cursorX;
      el.scrollTop = contentY * scale - cursorY;
    });
  }

  toggleGrid(): void {
    this.showGrid = !this.showGrid;
  }

  // ─── Guide interaction ───

  onHorizontalRulerMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    // Dragging down from horizontal ruler creates a horizontal guide
    const pageEl = this.canvasPage?.nativeElement;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const yMm = pxToMm((event.clientY - rect.top) / this.zoom);
    this.guideCreationState = {
      orientation: 'horizontal',
      currentPositionMm: yMm
    };
  }

  onVerticalRulerMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    // Dragging right from vertical ruler creates a vertical guide
    const pageEl = this.canvasPage?.nativeElement;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const xMm = pxToMm((event.clientX - rect.left) / this.zoom);
    this.guideCreationState = {
      orientation: 'vertical',
      currentPositionMm: xMm
    };
  }

  onGuideMouseDown(event: MouseEvent, guide: GuideLine): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.guideDragState = {
      guideId: guide.id,
      orientation: guide.orientation,
      startMousePos: guide.orientation === 'horizontal' ? event.clientY : event.clientX,
      startGuideMm: guide.position
    };
  }

  onGuideDoubleClick(guide: GuideLine): void {
    this.templateState.removeGuide(guide.id);
  }

  /** Collect snap candidates for the active section */
  private getSnapCandidates(
    section: SectionKey,
    excludeIds: Set<string>
  ): { horizontal: import('../../utils/coordinate-utils').SnapCandidate[]; vertical: import('../../utils/coordinate-utils').SnapCandidate[] } {
    const elements = this.getSectionElements(section);
    const guides = this.template.page.guides || [];
    return collectSnapCandidates(elements, guides, excludeIds, this.snapSettings);
  }

  // ─── Paper size ───

  onPaperTypeChange(): void {
    if (this.selectedPaperType === 'custom') {
      this.templateState.updatePaperSize('custom', this.customWidth, this.customHeight);
    } else {
      this.templateState.updatePaperSize(this.selectedPaperType);
    }
  }

  onCustomDimensionChange(): void {
    if (this.selectedPaperType !== 'custom') return;
    if (this.customWidth < 20) this.customWidth = 20;
    if (this.customHeight < 20) this.customHeight = 20;
    this.templateState.updatePaperSize('custom', this.customWidth, this.customHeight);
  }
}
