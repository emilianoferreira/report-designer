import { DesignerObservation, DesignerSurface, inspectDesignerSurface } from '../../utils/inspect-designer-surface';
import { HtmlRendererService } from '../../services/html-renderer.service';
import { prepareBrowserPrint } from '../../utils/prepare-browser-print';
import { buildValidationContext } from '../../utils/fiscal-context';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { measureRenderSurface } from '../../utils/measure-render-surface';
import { inject } from '@angular/core';
import { ValidationSessionService } from '../../services/validation-session.service';
/**
 * Design Canvas Component
 * The central A4 surface where users place and manipulate elements.
 * Renders header, detail, and footer sections with proper mm→px sizing.
 * Uses native mouse events for drag & resize.
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
import { Subject, takeUntil } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import {
  ReportTemplate,
  TemplateElement,
  PageSettings
} from '../../../../core/models/template.model';
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';
import {
  mmToPx, pxToMm, snapToGrid, PAPER_PRESETS, PaperPreset,
  SnapLine, SnapCandidate, SnapSettings, collectSnapCandidates, computeSnap
} from '../../utils/coordinate-utils';
import { createElement } from '../../utils/element-factory';
import { FormsModule } from '@angular/forms';
import { ElementRendererComponent } from '../element-renderer/element-renderer.component';

type SectionKey = 'header' | 'detail' | 'footer';

/** Cached snap candidates valid for the entire drag duration */
interface CachedSnapCandidates {
  horizontal: SnapCandidate[];
  vertical: SnapCandidate[];
}

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
  /** Cached snap candidates (other elements don't move during drag) */
  snapCandidates: CachedSnapCandidates;
  /** Cached size at drag start (avoid repeated getElement lookups in mousemove) */
  cachedSize: { width: number; height: number };
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
  snapCandidates: CachedSnapCandidates;
  anchorSize: { width: number; height: number };
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
  readonly validation = inject(ValidationSessionService, { optional: true });
  @ViewChild('canvasPage') canvasPage!: ElementRef<HTMLDivElement>;
  @ViewChild('renderFrame') renderFrame?: ElementRef<HTMLIFrameElement>;
  sectionBoxes: Partial<Record<string, { top: number; left: number; width: number; height: number }>> = {};
  surfaceHtml: SafeHtml = '';
  private sanitizer = inject(DomSanitizer);
  surfaceReady = false;
  comparing = false;
  showGenerated = true;
  observations: DesignerSurface = { pages: [], blocks: [], warnings: [] };
  inspected?: DesignerObservation;

  inspectObservation(observation: DesignerObservation): void {
    this.inspected = observation;
    const page = this.canvasPage.nativeElement.getBoundingClientRect();
    const scroll = this.scrollArea.nativeElement;
    scroll.scrollLeft += page.left + observation.x * this.zoom - scroll.getBoundingClientRect().left - 40;
    scroll.scrollTop += page.top + observation.y * this.zoom - scroll.getBoundingClientRect().top - 40;
    if (observation.generated) this.selectionService.clearSelection();
    if (observation.elementId && observation.section) {
      this.selectionService.select(observation.elementId, observation.section);
    }
    this.cdr.markForCheck();
  }

  get visibleBlocks(): DesignerObservation[] {
    return this.observations.blocks.filter(block => block.primary || block.key === this.inspected?.key);
  }
  private surfaceVersion = 0;
  private renderer = inject(HtmlRendererService);
  private gestureBoxes?: typeof this.sectionBoxes;
  private draftFrame?: HTMLIFrameElement;
  private draftVersion = 0;
  private interactionStarted = false;
  private gesturePageOrigin?: { left: number; top: number };
  private guideSection: SectionKey = 'header';
  private localGuides: SnapLine[] = [];
  gestureMessage = '';

  async loadSurface(): Promise<void> {
    if (this.dragState) return;
    const version = ++this.surfaceVersion;
    const doc = this.renderFrame?.nativeElement.contentDocument;
    if (!doc) return;
    await doc.fonts.ready;
    await Promise.all(Array.from(doc.images).map(image => image.decode().catch(() => undefined)));
    if (version !== this.surfaceVersion || !doc.body) return;
    const pages = Array.from(doc.querySelectorAll<HTMLElement>('body > .page'));
    if (!pages.length) return;
    const origin = pages[0].getBoundingClientRect();
    this.sectionBoxes = {};
    for (const key of ['header', 'detail', 'footer']) {
      const nodes = doc.querySelectorAll<HTMLElement>('.section-' + key);
      const node = key === 'footer' ? nodes[nodes.length - 1] : nodes[0];
      if (!node) continue;
      const box = node.getBoundingClientRect();
      this.sectionBoxes[key] = { top: box.top - origin.top, left: box.left - origin.left,
        width: box.width, height: box.height };
    }
    this.pageHeightPx = measureRenderSurface(doc, mmToPx(this.template.page.height), this.template.page.dynamicHeight);
    this.observations = inspectDesignerSurface(doc, this.template, this.validation?.pagination$.value?.resourcesReady ?? false);
    this.inspected = undefined;
    this.surfaceReady = true;
    this.cdr.markForCheck();
  }

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
    snapToElement: true,
    thresholdMm: 2
  };

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

  // Ruler marks (only rebuilt when page dimensions change)
  horizontalMarks: number[] = [];
  verticalMarks: number[] = [];
  private lastMarkedWidth = -1;
  private lastMarkedHeight = -1;

  // Drag/resize state
  dragState: DragState | MultiDragState | null = null;

  private moveResult?: { section: SectionKey; updates: Array<{ id: string; position: { x: number; y: number } }> };

  // Marquee selection state
  marqueeState: MarqueeState | null = null;

  // rAF throttle for mousemove → CD
  private rafHandle: number | null = null;
  private pendingMouseEvent: MouseEvent | null = null;

  // Document-level listeners (managed manually to run outside NgZone)
  private docMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private docMouseUpHandler: ((e: MouseEvent) => void) | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    public templateState: TemplateStateService,
    private selectionService: SelectionService,
    public cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.validation?.pending$.pipe(takeUntil(this.destroy$)).subscribe(pending => {
      if (pending && !this.gestureBoxes) {
        ++this.surfaceVersion;
        this.surfaceReady = false;
        this.cdr.markForCheck();
      }
    });
    this.validation?.surface$.pipe(takeUntil(this.destroy$)).subscribe(html => {
      ++this.surfaceVersion;
      // Only our controlled renderer output enters this sandboxed document.
      this.surfaceHtml = this.sanitizer.bypassSecurityTrustHtml(html);
      this.surfaceReady = false;
      this.cdr.markForCheck();
    });
    // Split subscriptions so high-frequency selection updates (during marquee)
    // don't re-run the page-dimension recompute. Each stream only drives the
    // state it actually owns, then calls markForCheck once.
    this.templateState.template$
      .pipe(takeUntil(this.destroy$))
      .subscribe(template => {
        ++this.surfaceVersion;
        this.surfaceReady = false;
        this.template = template;
        this.computeDimensions();
        this.cdr.markForCheck();
      });

    this.selectionService.selectedIds$
      .pipe(takeUntil(this.destroy$))
      .subscribe(selectedIds => {
        this.selectedIds = selectedIds;
        this.cdr.markForCheck();
      });

    this.selectionService.activeSection$
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(activeSection => {
        this.activeSection = activeSection;
        this.cdr.markForCheck();
      });
  }

  ngAfterViewInit(): void {
    // Register wheel + document mouse listeners OUTSIDE Angular zone.
    // This prevents change detection from firing on every mousemove
    // globally — a huge perf win because mousemove is extremely noisy.
    // We manually re-enter the zone (or call markForCheck) only when
    // the drag/marquee state actually needs to update the UI.
    this.ngZone.runOutsideAngular(() => {
      this.wheelHandler = (e: WheelEvent) => this.onWheel(e);
      this.scrollArea.nativeElement.addEventListener('wheel', this.wheelHandler, { passive: false });

      this.docMouseMoveHandler = (e: MouseEvent) => this.onDocumentMouseMove(e);
      this.docMouseUpHandler = (e: MouseEvent) => this.onDocumentMouseUp(e);
      document.addEventListener('mousemove', this.docMouseMoveHandler);
      document.addEventListener('mouseup', this.docMouseUpHandler);
    });
  }

  ngOnDestroy(): void {
    ++this.surfaceVersion;
    ++this.draftVersion;
    this.draftFrame?.remove();
    if (this.dragState) this.validation?.endInteraction();
    if (this.wheelHandler && this.scrollArea?.nativeElement) {
      this.scrollArea.nativeElement.removeEventListener('wheel', this.wheelHandler);
    }
    if (this.docMouseMoveHandler) {
      document.removeEventListener('mousemove', this.docMouseMoveHandler);
    }
    if (this.docMouseUpHandler) {
      document.removeEventListener('mouseup', this.docMouseUpHandler);
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Global mouse listeners (registered outside NgZone in ngAfterViewInit) ───

  /**
   * Fast path: runs OUTSIDE NgZone on every mousemove. Stores the latest
   * event and schedules a single rAF tick to apply updates + trigger CD.
   * This coalesces bursts of mousemove events into one frame's worth of work.
   */
  private onDocumentMouseMove(event: MouseEvent): void {
    // Cheap early exit when idle — no zone entry, no CD.
    if (!this.dragState && !this.marqueeState) return;

    // Prevent selection while dragging; cheap enough to do synchronously.
    event.preventDefault();

    this.pendingMouseEvent = event;
    if (this.rafHandle === null) {
      this.rafHandle = requestAnimationFrame(() => {
        this.rafHandle = null;
        const ev = this.pendingMouseEvent;
        this.pendingMouseEvent = null;
        if (ev) this.processMouseMove(ev);
      });
    }
  }

  /** Runs once per animation frame. May enter NgZone to trigger CD. */
  private processMouseMove(event: MouseEvent): void {
    // ─── Marquee drag ───
    if (this.marqueeState) {
      const index = ['header', 'detail', 'footer'].indexOf(this.marqueeState.section);
      const rect = this.canvasPage.nativeElement.querySelectorAll('.section-body')[index].getBoundingClientRect();
      this.marqueeState.currentXMm = pxToMm((event.clientX - rect.left) / this.zoom);
      this.marqueeState.currentYMm = pxToMm((event.clientY - rect.top) / this.zoom);

      // Compute which elements intersect the marquee
      const ids = this.getElementsInMarquee();
      // Run selection updates inside the zone so observers fire through CD.
      this.ngZone.run(() => {
        if (this.marqueeState!.additive) {
          const union = new Set([...this.marqueeState!.previousIds, ...ids]);
          this.selectionService.selectMultiple(Array.from(union), this.marqueeState!.section);
        } else {
          this.selectionService.selectMultiple(ids, this.marqueeState!.section);
        }
        this.cdr.markForCheck();
      });
      return;
    }

    if (!this.dragState) return;

    if (!this.interactionStarted) {
      this.interactionStarted = true;
      this.validation?.beginInteraction();
    }

    const dx = event.clientX - this.dragState.startMouseX;
    const dy = event.clientY - this.dragState.startMouseY;

    if (this.dragState.type === 'resize') {
      this.applyResizeDelta(dx, dy);
    } else {
      this.previewMove(dx, dy);
    }
    void this.previewRenderedElements();

    // Only trigger CD; no observable updates, so no need to enter the zone.
    this.cdr.markForCheck();
  }

  private onDocumentMouseUp(event: MouseEvent): void {
    if (!this.marqueeState && !this.dragState) return;

    if (this.pendingMouseEvent) this.processMouseMove(this.pendingMouseEvent);
    if (this.dragState && (Math.abs(event.clientX - this.dragState.startMouseX) >= 1 ||
        Math.abs(event.clientY - this.dragState.startMouseY) >= 1)) this.processMouseMove(event);

    // Cancel any pending rAF tick to avoid stale state writes after teardown.
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
      this.pendingMouseEvent = null;
    }

    // State mutations that emit through observables must run in the zone.
    this.ngZone.run(() => {
      // ─── End marquee ───
      if (this.marqueeState) {
        const dx = event.clientX - this.marqueeState.startClientX;
        const dy = event.clientY - this.marqueeState.startClientY;
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

      ++this.draftVersion;
      this.draftFrame?.remove();
      this.draftFrame = undefined;
      this.gestureBoxes = undefined;
      this.dragState = null;
      this.moveResult = undefined;
      this.validation?.endInteraction();
      this.interactionStarted = false;
      this.activeSnapLines = [];
      this.cdr.markForCheck();
    });
  }

  private cancelGesture(): void {
    if (!this.dragState && !this.marqueeState) return;
    const hadInteraction = this.interactionStarted;
    ++this.draftVersion;
    this.draftFrame?.remove();
    this.draftFrame = undefined;
    this.dragState = null;
    this.moveResult = undefined;
    this.gestureBoxes = undefined;
    this.marqueeState = null;
    this.activeSnapLines = [];
    if (hadInteraction) {
      this.surfaceReady = false;
      this.validation?.endInteraction();
    }
    this.interactionStarted = false;
    this.cdr.markForCheck();
  }

  // ─── Keyboard shortcuts ───

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;

    if (!isInput && event.key === 'Escape' && (this.dragState || this.marqueeState)) {
      event.preventDefault();
      this.cancelGesture();
      return;
    }

    // Ctrl+Z / Cmd+Z → Undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      if (!isInput) {
        event.preventDefault();
        this.cancelGesture();
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
        this.cancelGesture();
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

    // Only rebuild ruler marks when paper dimensions actually change.
    // Avoids thrashing the two large @for loops on every template emission.
    if (page.width !== this.lastMarkedWidth) {
      const hm: number[] = [];
      for (let mm = 0; mm <= page.width; mm += 5) hm.push(mm);
      this.horizontalMarks = hm;
      this.lastMarkedWidth = page.width;
    }
    if (page.height !== this.lastMarkedHeight) {
      const vm: number[] = [];
      for (let mm = 0; mm <= page.height; mm += 5) vm.push(mm);
      this.verticalMarks = vm;
      this.lastMarkedHeight = page.height;
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
    this.gesturePageOrigin = this.canvasPage.nativeElement.getBoundingClientRect();
    this.gestureMessage = '';
    this.gestureBoxes = structuredClone(this.sectionBoxes);
    this.moveResult = undefined;
    this.interactionStarted = false;

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

      // Cache snap candidates for the duration of the drag — other
      // elements don't move, so recomputing per-mousemove is wasted work.
      const excludeIds = new Set(startPositions.keys());
      const snapCandidates = collectSnapCandidates(
        this.getSectionElements(event.section), excludeIds, this.snapSettings
      );

      this.dragState = {
        type: 'multi-move',
        anchorElementId: event.elementId,
        section: event.section,
        startMouseX: event.mouseEvent.clientX,
        startMouseY: event.mouseEvent.clientY,
        startPositions,
        currentDx: 0,
        currentDy: 0,
        snapCandidates,
        anchorSize: { width: el.size.width, height: el.size.height }
      };
      return;
    }

    // Single-element drag: cache candidates + size
    const excludeIds = new Set([event.elementId]);
    const snapCandidates = collectSnapCandidates(
      this.getSectionElements(event.section), excludeIds, this.snapSettings
    );

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
      currentHeight: mmToPx(el.size.height),
      snapCandidates,
      cachedSize: { width: el.size.width, height: el.size.height }
    };
  }

  // ─── Get element visual transform during drag ───

  getElementTransform(elementId: string): string {
    if (!this.dragState) return '';
    // Multi-move: same transform for all selected elements
    if (this.dragState.type === 'multi-move' && this.dragState.startPositions.has(elementId)) {
      return `translate(${this.dragState.currentDx / this.zoom}px, ${this.dragState.currentDy / this.zoom}px)`;
    }
    // Single move
    if (this.dragState.type === 'move' && (this.dragState as DragState).elementId === elementId) {
      return `translate(${this.dragState.currentDx / this.zoom}px, ${this.dragState.currentDy / this.zoom}px)`;
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

  private sectionBox(section: SectionKey): { top: number; left: number; width: number; height: number } {
    return this.gestureBoxes?.[section] ?? this.sectionBoxes[section] ?? {
      top: mmToPx(this.template.page.margins.top),
      left: mmToPx(this.template.page.margins.left),
      width: this.contentWidthPx, height: this.getSectionHeightPx(section)
    };
  }

  private getSectionOffsetMm(section: SectionKey): number {
    return pxToMm(this.sectionBox(section).top);
  }

  private resolveTargetSection(pageY: number): { section: SectionKey; localY: number } {
    const keys: SectionKey[] = ['header', 'detail', 'footer'];
    let section: SectionKey = 'header';
    for (const key of keys) {
      if (pageY >= this.getSectionOffsetMm(key)) section = key;
    }
    return { section, localY: pageY - this.getSectionOffsetMm(section) };
  }

  private pageGuides(lines: SnapLine[], section: SectionKey): void {
    this.guideSection = section;
    this.localGuides = lines;
    const box = this.sectionBox(section);
    this.activeSnapLines = lines.map(line => ({ ...line, position: line.position +
      pxToMm(line.orientation === 'horizontal' ? box.top : box.left) }));
  }

  private previewMove(screenDx: number, screenDy: number): void {
    const state = this.dragState;
    if (!state || state.type === 'resize') return;
    const positions = state.type === 'multi-move' ? state.startPositions :
      new Map([[state.elementId, { x: state.startElX, y: state.startElY }]]);
    const anchorId = state.type === 'multi-move' ? state.anchorElementId : state.elementId;
    const anchor = positions.get(anchorId)!;
    const source = this.sectionBox(state.section);
    const pageY = pxToMm(source.top) + anchor.y + pxToMm(screenDy / this.zoom);
    const target = this.resolveTargetSection(pageY);
    const destination = this.sectionBox(target.section);
    const proposed = { x: anchor.x + pxToMm((source.left - destination.left) + screenDx / this.zoom),
      y: target.localY };
    const candidates = collectSnapCandidates(this.getSectionElements(target.section),
      new Set(positions.keys()), this.snapSettings);
    const element = this.templateState.getElement(state.section, anchorId)!;
    const snapped = computeSnap(proposed, element.size, candidates, this.snapSettings.thresholdMm,
      this.gridSizeMm, this.snapSettings.snapToGrid);
    let dx = snapped.x - anchor.x;
    let dy = snapped.y - anchor.y;
    const elements = Array.from(positions, ([id, position]) => ({
      id, position, size: this.templateState.getElement(state.section, id)!.size
    }));
    const minX = Math.min(...elements.map(el => el.position.x));
    const minY = Math.min(...elements.map(el => el.position.y));
    const maxX = Math.max(...elements.map(el => el.position.x + el.size.width));
    const maxY = Math.max(...elements.map(el => el.position.y + el.size.height));
    dx = Math.max(-minX, Math.min(dx, Math.max(0, pxToMm(destination.width) - maxX)));
    dy = Math.max(-minY, Math.min(dy, Math.max(0, pxToMm(destination.height) - maxY)));
    this.pageGuides(snapped.snapLines.filter(line => line.orientation === 'vertical' ?
      dx === snapped.x - anchor.x : dy === snapped.y - anchor.y), target.section);
    this.moveResult = { section: target.section, updates: elements.map(el => ({
      id: el.id, position: { x: el.position.x + dx, y: el.position.y + dy }
    })) };
    state.currentDx = (destination.left - source.left + mmToPx(dx)) * this.zoom;
    state.currentDy = (destination.top - source.top + mmToPx(dy)) * this.zoom;
  }

  private applyResizeDelta(screenDx: number, screenDy: number): void {
    const state = this.dragState;
    if (!state || state.type !== 'resize') return;
    const handle = state.resizeHandle || 'se';
    const box = this.sectionBox(state.section);
    const startRight = state.startElX + state.startElWidth;
    const startBottom = state.startElY + state.startElHeight;
    let left = state.startElX, top = state.startElY;
    let right = startRight, bottom = startBottom;
    const movingX = handle.includes('w') ? left + pxToMm(screenDx / this.zoom) :
      right + pxToMm(screenDx / this.zoom);
    const movingY = handle.includes('n') ? top + pxToMm(screenDy / this.zoom) :
      bottom + pxToMm(screenDy / this.zoom);
    const snap = computeSnap({ x: movingX, y: movingY }, { width: 0, height: 0 },
      state.snapCandidates, this.snapSettings.thresholdMm, this.gridSizeMm, this.snapSettings.snapToGrid);
    if (handle.includes('w')) left = Math.max(0, Math.min(startRight - 2, snap.x));
    if (handle.includes('e')) right = Math.max(left + 2, Math.min(pxToMm(box.width), snap.x));
    if (handle.includes('n')) top = Math.max(0, Math.min(startBottom - 2, snap.y));
    if (handle.includes('s')) bottom = Math.max(top + 2, Math.min(pxToMm(box.height), snap.y));
    this.pageGuides(snap.snapLines.filter(line => line.orientation === 'vertical' ?
      (handle.includes('w') || handle.includes('e')) && snap.x === (handle.includes('w') ? left : right) :
      (handle.includes('n') || handle.includes('s')) && snap.y === (handle.includes('n') ? top : bottom)),
      state.section);
    state.currentWidth = mmToPx(right - left);
    state.currentHeight = mmToPx(bottom - top);
    state.currentDx = mmToPx(left - state.startElX);
    state.currentDy = mmToPx(top - state.startElY);
  }

  /** Compose a transient template with the same renderer, including detail reflow and pagination. */
  private async previewRenderedElements(): Promise<void> {
    const state = this.dragState;
    if (!state || !this.validation) return;
    const version = ++this.draftVersion;
    this.draftFrame?.remove();
    const draft = structuredClone(this.template);
    if (state.type === 'resize') {
      const element = draft.sections[state.section].elements.find(el => el.id === state.elementId)!;
      element.position = { x: state.startElX + pxToMm(state.currentDx), y: state.startElY + pxToMm(state.currentDy) };
      element.size = { width: pxToMm(state.currentWidth), height: pxToMm(state.currentHeight) };
    } else if (this.moveResult) {
      for (const update of this.moveResult.updates) {
        const source = draft.sections[state.section];
        const element = source.elements.find(el => el.id === update.id)!;
        element.position = update.position;
        if (state.section !== this.moveResult.section) {
          source.elements = source.elements.filter(el => el.id !== update.id);
          draft.sections[this.moveResult.section].elements.push(element);
        }
      }
    }
    const data = this.validation.data(draft);
    const artifact = this.renderer.renderWithEvidence(draft, data, true);
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:' + this.pageWidthPx + 'px;height:1000px';
    document.body.append(frame);
    this.draftFrame = frame;
    try {
      const doc = frame.contentDocument!;
      doc.open(); doc.write(artifact.html); doc.close();
      const prepared = await prepareBrowserPrint(doc, draft, buildValidationContext(draft.compliance, data),
        artifact.evidence, () => version === this.draftVersion && this.dragState === state);
      const visible = this.renderFrame?.nativeElement.contentDocument;
      if (!prepared || !visible || version !== this.draftVersion) return;
      visible.open(); visible.write('<!DOCTYPE html>\n' + doc.documentElement.outerHTML); visible.close();
      const page = doc.querySelector<HTMLElement>('body > .page')!;
      const origin = page.getBoundingClientRect();
      const id = state.type === 'multi-move' ? state.anchorElementId : state.elementId;
      const nodes = Array.from(doc.querySelectorAll<HTMLElement>('[data-render-element]'))
        .filter(node => node.dataset['renderElement'] === id);
      const targetSection = state.type === 'resize' ? state.section : this.moveResult?.section;
      const node = targetSection === 'footer' ? nodes[nodes.length - 1] : nodes[0];
      if (node && state.type !== 'resize') {
        const original = this.template.sections[state.section].elements.find(el => el.id === id)!;
        const box = node.getBoundingClientRect();
        const source = this.sectionBox(state.section);
        state.currentDx = (box.left - origin.left - source.left - mmToPx(original.position.x)) * this.zoom;
        state.currentDy = (box.top - origin.top - source.top - mmToPx(original.position.y)) * this.zoom;
      }
      const sections = Array.from(doc.querySelectorAll<HTMLElement>('.section-' + this.guideSection));
      const guideNode = this.guideSection === 'footer' ? sections[sections.length - 1] : sections[0];
      if (guideNode) {
        const guideBox = guideNode.getBoundingClientRect();
        this.activeSnapLines = this.localGuides.map(line => ({ ...line,
          position: line.position + pxToMm(line.orientation === 'horizontal' ?
            guideBox.top - origin.top : guideBox.left - origin.left) }));
      }
      this.cdr.markForCheck();
    } catch {
      if (version === this.draftVersion) {
        this.gestureMessage = 'No se pudo actualizar la composición durante el gesto.';
        this.cdr.markForCheck();
      }
    } finally {
      frame.remove();
      if (this.draftFrame === frame) this.draftFrame = undefined;
    }
  }

  private commitMove(): void { this.commitMovingElements(); }

  private commitMultiMove(): void { this.commitMovingElements(); }

  private commitMovingElements(): void {
    const state = this.dragState;
    if (!state || !this.moveResult) return;
    this.templateState.moveMultipleElementsToSection(state.section, this.moveResult.section, this.moveResult.updates);
    this.selectionService.selectMultiple(this.moveResult.updates.map(update => update.id), this.moveResult.section);
  }

  private commitResize(): void {
    const state = this.dragState;
    if (!state || state.type !== 'resize') return;
    if (state.currentDx === 0 && state.currentDy === 0 &&
        state.currentWidth === mmToPx(state.startElWidth) && state.currentHeight === mmToPx(state.startElHeight)) return;
    this.templateState.updateElement(state.section, state.elementId, {
      position: { x: state.startElX + pxToMm(state.currentDx), y: state.startElY + pxToMm(state.currentDy) },
      size: { width: pxToMm(state.currentWidth), height: pxToMm(state.currentHeight) }
    });
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

    const shapeType = event.dataTransfer?.getData('shape-type') || undefined;

    this.ngZone.run(() => {
      const overrides = shapeType ? { shapeType } : undefined;
      const newElement = createElement(elementType as any, { x: xMm, y: yMm }, overrides);
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
    if (this.dragState && e.ctrlKey) { e.preventDefault(); return; }
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
