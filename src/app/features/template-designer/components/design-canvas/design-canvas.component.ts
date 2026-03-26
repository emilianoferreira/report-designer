/**
 * Design Canvas Component
 * The central A4 surface where users place and manipulate elements.
 * Renders header, detail, and footer sections with proper mm→px sizing.
 * Integrates interact.js for drag & resize.
 */
import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone
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
// @ts-ignore - interact.js lacks TS declarations in v1.x
import interact from 'interact.js';

type SectionKey = 'header' | 'detail' | 'footer';

@Component({
  selector: 'app-design-canvas',
  standalone: true,
  imports: [CommonModule, ElementRendererComponent],
  templateUrl: './design-canvas.component.html',
  styleUrl: './design-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignCanvasComponent implements OnInit, AfterViewInit, OnDestroy {
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

  private destroy$ = new Subject<void>();
  private interactInstances: any[] = [];

  constructor(
    private templateState: TemplateStateService,
    private selectionService: SelectionService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    // Subscribe to template changes
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
    // Setup interact.js after view is ready
    setTimeout(() => this.setupInteractions(), 100);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupInteractions();
  }

  /**
   * Compute all pixel dimensions from template mm values
   */
  private computeDimensions(): void {
    if (!this.template) return;

    const page = this.template.page;
    this.pageWidthPx = mmToPx(page.width);
    this.pageHeightPx = mmToPx(page.height);
    this.contentWidthPx = mmToPx(page.width - page.margins.left - page.margins.right);

    this.headerHeightPx = mmToPx(this.template.sections.header.height);
    this.detailHeightPx = mmToPx(this.template.sections.detail.height);
    this.footerHeightPx = mmToPx(this.template.sections.footer.height);

    // Generate ruler marks every 10mm
    this.horizontalMarks = [];
    for (let mm = 0; mm <= page.width; mm += 10) {
      this.horizontalMarks.push(mm);
    }
    this.verticalMarks = [];
    for (let mm = 0; mm <= page.height; mm += 10) {
      this.verticalMarks.push(mm);
    }
  }

  /**
   * mmToPx exposed to template for binding
   */
  mmToPx(mm: number): number {
    return mmToPx(mm);
  }

  /**
   * Handle click on canvas background (deselect all)
   */
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

  /**
   * Handle element selection
   */
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

  /**
   * Check if an element is selected
   */
  isElementSelected(elementId: string): boolean {
    return this.selectedIds.has(elementId);
  }

  /**
   * Section label for display
   */
  getSectionLabel(key: SectionKey): string {
    const labels: Record<SectionKey, string> = {
      header: 'Encabezado',
      detail: 'Detalle',
      footer: 'Pie'
    };
    return labels[key];
  }

  /**
   * Get section height in px
   */
  getSectionHeightPx(key: SectionKey): number {
    switch (key) {
      case 'header': return this.headerHeightPx;
      case 'detail': return this.detailHeightPx;
      case 'footer': return this.footerHeightPx;
    }
  }

  /**
   * Get section elements
   */
  getSectionElements(key: SectionKey): TemplateElement[] {
    const section = this.template?.sections[key];
    return section?.elements || [];
  }

  /**
   * Track elements by ID for ngFor
   */
  trackByElementId(index: number, element: TemplateElement): string {
    return element.id;
  }

  /**
   * Is this section currently active?
   */
  isSectionActive(key: SectionKey): boolean {
    return this.activeSection === key;
  }

  /**
   * Click on section label to activate it
   */
  onSectionLabelClick(section: SectionKey): void {
    this.selectionService.setActiveSection(section);
  }

  /**
   * Handle drop from toolbox (CDK drag & drop or native)
   */
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

    // Import dynamically to avoid circular deps
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

  /**
   * Setup interact.js for drag & resize on elements
   */
  private setupInteractions(): void {
    this.ngZone.runOutsideAngular(() => {
      // Draggable elements
      const draggable = interact('.element-wrapper:not(.locked)').draggable({
        inertia: false,
        modifiers: [],
        listeners: {
          move: (event: any) => {
            this.handleDragMove(event);
          },
          end: (event: any) => {
            this.handleDragEnd(event);
          }
        }
      });

      // Resizable elements
      const resizable = interact('.element-wrapper:not(.locked)').resizable({
        edges: {
          left: '.resize-handle.w, .resize-handle.nw, .resize-handle.sw',
          right: '.resize-handle.e, .resize-handle.ne, .resize-handle.se',
          bottom: '.resize-handle.s, .resize-handle.se, .resize-handle.sw',
          top: '.resize-handle.n, .resize-handle.nw, .resize-handle.ne'
        },
        listeners: {
          move: (event: any) => {
            this.handleResizeMove(event);
          },
          end: (event: any) => {
            this.handleResizeEnd(event);
          }
        },
        modifiers: [
          interact.modifiers.restrictSize({
            min: { width: mmToPx(2), height: mmToPx(2) }
          })
        ]
      });

      this.interactInstances.push(draggable, resizable);
    });
  }

  /**
   * Handle drag move - update element position in real-time
   */
  private handleDragMove(event: any): void {
    const target = event.target as HTMLElement;
    const elementId = target.getAttribute('data-element-id');
    if (!elementId) return;

    // Get current position from data attributes or parse from style
    const currentX = parseFloat(target.getAttribute('data-x') || '0') + event.dx;
    const currentY = parseFloat(target.getAttribute('data-y') || '0') + event.dy;

    target.style.transform = `translate(${currentX}px, ${currentY}px)`;
    target.setAttribute('data-x', String(currentX));
    target.setAttribute('data-y', String(currentY));
  }

  /**
   * Handle drag end - commit position to state
   */
  private handleDragEnd(event: any): void {
    const target = event.target as HTMLElement;
    const elementId = target.getAttribute('data-element-id');
    if (!elementId) return;

    const dx = parseFloat(target.getAttribute('data-x') || '0');
    const dy = parseFloat(target.getAttribute('data-y') || '0');

    if (dx === 0 && dy === 0) return;

    // Reset visual transform
    target.style.transform = '';
    target.setAttribute('data-x', '0');
    target.setAttribute('data-y', '0');

    // Find element and compute new position
    const section = this.findElementSection(elementId);
    if (!section) return;

    const element = this.templateState.getElement(section as any, elementId);
    if (!element) return;

    let newX = element.position.x + pxToMm(dx / this.zoom);
    let newY = element.position.y + pxToMm(dy / this.zoom);

    if (this.snapEnabled) {
      newX = snapToGrid(newX, this.gridSizeMm);
      newY = snapToGrid(newY, this.gridSizeMm);
    }

    // Clamp to positive values
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);

    this.ngZone.run(() => {
      this.templateState.updateElement(section as any, elementId, {
        position: { x: newX, y: newY }
      } as any);
    });
  }

  /**
   * Handle resize move - update element size in real-time
   */
  private handleResizeMove(event: any): void {
    const target = event.target as HTMLElement;

    // Update width/height directly
    target.style.width = `${event.rect.width}px`;
    target.style.height = `${event.rect.height}px`;

    // Handle position changes from top/left edge resize
    const dx = parseFloat(target.getAttribute('data-x') || '0') + (event.deltaRect?.left || 0);
    const dy = parseFloat(target.getAttribute('data-y') || '0') + (event.deltaRect?.top || 0);

    target.style.transform = `translate(${dx}px, ${dy}px)`;
    target.setAttribute('data-x', String(dx));
    target.setAttribute('data-y', String(dy));
  }

  /**
   * Handle resize end - commit size to state
   */
  private handleResizeEnd(event: any): void {
    const target = event.target as HTMLElement;
    const elementId = target.getAttribute('data-element-id');
    if (!elementId) return;

    const dx = parseFloat(target.getAttribute('data-x') || '0');
    const dy = parseFloat(target.getAttribute('data-y') || '0');

    // Reset visual transform
    target.style.transform = '';
    target.setAttribute('data-x', '0');
    target.setAttribute('data-y', '0');

    const section = this.findElementSection(elementId);
    if (!section) return;

    const element = this.templateState.getElement(section as any, elementId);
    if (!element) return;

    let newWidth = pxToMm(event.rect.width / this.zoom);
    let newHeight = pxToMm(event.rect.height / this.zoom);
    let newX = element.position.x + pxToMm(dx / this.zoom);
    let newY = element.position.y + pxToMm(dy / this.zoom);

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

    this.ngZone.run(() => {
      this.templateState.updateElement(section as any, elementId, {
        position: { x: newX, y: newY },
        size: { width: newWidth, height: newHeight }
      } as any);
    });
  }

  /**
   * Find which section an element belongs to
   */
  private findElementSection(elementId: string): SectionKey | null {
    const sections: SectionKey[] = ['header', 'detail', 'footer'];
    for (const key of sections) {
      const elements = this.getSectionElements(key);
      if (elements.find(el => el.id === elementId)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Cleanup interact.js instances
   */
  private cleanupInteractions(): void {
    this.interactInstances.forEach(instance => {
      try { instance.unset(); } catch (e) { /* ignore */ }
    });
    this.interactInstances = [];
  }

  /**
   * Zoom controls
   */
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
