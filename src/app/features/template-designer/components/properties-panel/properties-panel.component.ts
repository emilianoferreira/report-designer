/**
 * Properties Panel Component
 * Right sidebar showing and editing properties of the selected element.
 * Tabs: General, Style, Data Binding
 */
import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
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
import { TemplateStateService } from '../../services/template-state.service';
import { SelectionService } from '../../services/selection.service';

type TabKey = 'general' | 'style' | 'data';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './properties-panel.component.html',
  styleUrl: './properties-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PropertiesPanelComponent implements OnInit, OnDestroy {
  selectedElement: TemplateElement | null = null;
  selectedElements: TemplateElement[] = [];
  multiSelectMode = false;
  mixedFields = new Set<string>();
  activeSection: 'header' | 'detail' | 'footer' = 'header';
  activeTab: TabKey = 'general';

  // Editable copies (two-way binding)
  name = '';
  posX = 0;
  posY = 0;
  width = 0;
  height = 0;
  locked = false;
  zIndex = 1;

  // Style
  fontFamily = 'Arial';
  fontSize = 10;
  fontWeight: 'normal' | 'bold' = 'normal';
  fontStyle: 'normal' | 'italic' = 'normal';
  fontColor = '#000000';
  textAlign: 'left' | 'center' | 'right' | 'justify' = 'left';
  verticalAlign: 'top' | 'middle' | 'bottom' = 'top';
  backgroundColor = '';
  opacity = 1;

  // Data-specific
  textContent = '';
  bindingSource = '';
  formulaExpression = '';
  imageUrl = '';

  // Available fonts
  fontFamilies = ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana', 'Georgia', 'Tahoma'];
  fontSizes = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

  private destroy$ = new Subject<void>();

  constructor(
    private templateState: TemplateStateService,
    private selectionService: SelectionService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.selectionService.selectedElements$
      .pipe(takeUntil(this.destroy$))
      .subscribe(elements => {
        this.selectedElements = elements;
        this.multiSelectMode = elements.length > 1;
        this.selectedElement = elements.length === 1 ? elements[0] : null;
        this.activeSection = this.selectionService.getActiveSection();

        if (elements.length === 1) {
          this.loadElementProperties(elements[0]);
        } else if (elements.length > 1) {
          this.loadCommonProperties(elements);
          // Switch to style tab in multi-select if on data tab
          if (this.activeTab === 'data') {
            this.activeTab = 'style';
          }
        }
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setTab(tab: TabKey): void {
    this.activeTab = tab;
  }

  /**
   * Load element properties into local editable fields
   */
  private loadElementProperties(el: TemplateElement): void {
    this.name = el.name;
    this.posX = el.position.x;
    this.posY = el.position.y;
    this.width = el.size.width;
    this.height = el.size.height;
    this.locked = el.locked;
    this.zIndex = el.zIndex;
    this.opacity = el.style.opacity ?? 1;

    // Font
    if (el.style.font) {
      this.fontFamily = el.style.font.family;
      this.fontSize = el.style.font.size;
      this.fontWeight = el.style.font.weight;
      this.fontStyle = el.style.font.style;
      this.fontColor = el.style.font.color;
    }

    this.textAlign = el.style.textAlign || 'left';
    this.verticalAlign = el.style.verticalAlign || 'top';
    this.backgroundColor = el.style.backgroundColor || '';

    // Type-specific
    if (el.type === 'text') {
      this.textContent = (el as TextElement).content;
    }
    if (el.type === 'dataField') {
      this.bindingSource = (el as DataFieldElement).binding.source;
    }
    if (el.type === 'formula') {
      this.formulaExpression = (el as FormulaElement).expression;
    }
    if (el.type === 'image') {
      this.imageUrl = (el as ImageElement).source.url || '';
    }
  }

  /**
   * Load common properties across multiple selected elements.
   * Fields with differing values are marked as "mixed".
   */
  private loadCommonProperties(elements: TemplateElement[]): void {
    this.mixedFields.clear();

    // Position is always mixed in multi-select
    this.mixedFields.add('name');
    this.mixedFields.add('posX');
    this.mixedFields.add('posY');

    // Size
    const widths = new Set(elements.map(e => e.size.width));
    this.width = widths.size === 1 ? elements[0].size.width : 0;
    if (widths.size > 1) this.mixedFields.add('width');

    const heights = new Set(elements.map(e => e.size.height));
    this.height = heights.size === 1 ? elements[0].size.height : 0;
    if (heights.size > 1) this.mixedFields.add('height');

    // Opacity
    const opacities = new Set(elements.map(e => e.style.opacity ?? 1));
    this.opacity = opacities.size === 1 ? (elements[0].style.opacity ?? 1) : 1;
    if (opacities.size > 1) this.mixedFields.add('opacity');

    // Background
    const bgs = new Set(elements.map(e => e.style.backgroundColor || ''));
    this.backgroundColor = bgs.size === 1 ? (elements[0].style.backgroundColor || '') : '';
    if (bgs.size > 1) this.mixedFields.add('backgroundColor');

    // Font properties (only for elements that have font)
    const withFont = elements.filter(e => !!e.style.font);
    if (withFont.length === elements.length) {
      const families = new Set(withFont.map(e => e.style.font!.family));
      this.fontFamily = families.size === 1 ? withFont[0].style.font!.family : 'Arial';
      if (families.size > 1) this.mixedFields.add('fontFamily');

      const sizes = new Set(withFont.map(e => e.style.font!.size));
      this.fontSize = sizes.size === 1 ? withFont[0].style.font!.size : 10;
      if (sizes.size > 1) this.mixedFields.add('fontSize');

      const weights = new Set(withFont.map(e => e.style.font!.weight));
      this.fontWeight = weights.size === 1 ? withFont[0].style.font!.weight : 'normal';
      if (weights.size > 1) this.mixedFields.add('fontWeight');

      const styles = new Set(withFont.map(e => e.style.font!.style));
      this.fontStyle = styles.size === 1 ? withFont[0].style.font!.style : 'normal';
      if (styles.size > 1) this.mixedFields.add('fontStyle');

      const colors = new Set(withFont.map(e => e.style.font!.color));
      this.fontColor = colors.size === 1 ? withFont[0].style.font!.color : '#000000';
      if (colors.size > 1) this.mixedFields.add('fontColor');

      const aligns = new Set(elements.map(e => e.style.textAlign || 'left'));
      this.textAlign = aligns.size === 1 ? (elements[0].style.textAlign || 'left') as any : 'left';
      if (aligns.size > 1) this.mixedFields.add('textAlign');
    }
  }

  /** Whether all selected elements have font properties */
  get allHaveFont(): boolean {
    if (this.multiSelectMode) {
      return this.selectedElements.every(e => !!e.style.font);
    }
    return !!this.selectedElement?.style.font;
  }

  /**
   * Apply a specific field change to all selected elements (multi-edit)
   */
  onMultiFieldChange(field: string): void {
    if (this.selectedElements.length === 0) return;

    const updates = this.selectedElements.map(el => ({
      id: el.id,
      changes: this.buildFieldUpdate(el, field)
    }));

    this.templateState.updateMultipleElements(this.activeSection as any, updates);
    this.mixedFields.delete(field);
  }

  private buildFieldUpdate(el: TemplateElement, field: string): Partial<TemplateElement> {
    switch (field) {
      case 'width':
        return { size: { width: this.width, height: el.size.height } } as any;
      case 'height':
        return { size: { width: el.size.width, height: this.height } } as any;
      case 'opacity':
        return { style: { ...el.style, opacity: this.opacity } } as any;
      case 'backgroundColor':
        return { style: { ...el.style, backgroundColor: this.backgroundColor || undefined } } as any;
      case 'fontFamily':
        return { style: { ...el.style, font: { ...el.style.font!, family: this.fontFamily } } } as any;
      case 'fontSize':
        return { style: { ...el.style, font: { ...el.style.font!, size: this.fontSize } } } as any;
      case 'fontColor':
        return { style: { ...el.style, font: { ...el.style.font!, color: this.fontColor } } } as any;
      case 'fontWeight':
        return { style: { ...el.style, font: { ...el.style.font!, weight: this.fontWeight } } } as any;
      case 'fontStyle':
        return { style: { ...el.style, font: { ...el.style.font!, style: this.fontStyle } } } as any;
      case 'textAlign':
        return { style: { ...el.style, textAlign: this.textAlign } } as any;
      default:
        return {};
    }
  }

  /**
   * Delete all selected elements
   */
  deleteAllSelected(): void {
    for (const el of this.selectedElements) {
      this.templateState.removeElement(this.activeSection as any, el.id);
    }
    this.selectionService.clearSelection();
  }

  /**
   * Toggle bold for all selected elements
   */
  toggleBoldMulti(): void {
    this.fontWeight = this.fontWeight === 'bold' ? 'normal' : 'bold';
    this.onMultiFieldChange('fontWeight');
  }

  /**
   * Toggle italic for all selected elements
   */
  toggleItalicMulti(): void {
    this.fontStyle = this.fontStyle === 'italic' ? 'normal' : 'italic';
    this.onMultiFieldChange('fontStyle');
  }

  /**
   * Set alignment for all selected elements
   */
  setAlignmentMulti(align: 'left' | 'center' | 'right' | 'justify'): void {
    this.textAlign = align;
    this.onMultiFieldChange('textAlign');
  }

  /**
   * Apply changes to the element in state
   */
  applyChanges(): void {
    if (!this.selectedElement) return;

    const updates: any = {
      name: this.name,
      position: { x: this.posX, y: this.posY },
      size: { width: this.width, height: this.height },
      locked: this.locked,
      zIndex: this.zIndex,
      style: {
        ...this.selectedElement.style,
        font: {
          family: this.fontFamily,
          size: this.fontSize,
          weight: this.fontWeight,
          style: this.fontStyle,
          color: this.fontColor
        },
        textAlign: this.textAlign,
        verticalAlign: this.verticalAlign,
        backgroundColor: this.backgroundColor || undefined,
        opacity: this.opacity
      }
    };

    // Type-specific updates
    if (this.selectedElement.type === 'text') {
      updates.content = this.textContent;
    }
    if (this.selectedElement.type === 'dataField') {
      updates.binding = {
        ...(this.selectedElement as DataFieldElement).binding,
        source: this.bindingSource
      };
    }
    if (this.selectedElement.type === 'formula') {
      updates.expression = this.formulaExpression;
    }
    if (this.selectedElement.type === 'image') {
      updates.source = {
        ...(this.selectedElement as ImageElement).source,
        url: this.imageUrl
      };
    }

    this.templateState.updateElement(
      this.activeSection as any,
      this.selectedElement.id,
      updates
    );
  }

  /**
   * Shortcut: apply on any field blur
   */
  onFieldChange(): void {
    this.applyChanges();
  }

  /**
   * Delete selected element
   */
  deleteElement(): void {
    if (!this.selectedElement) return;
    this.templateState.removeElement(this.activeSection as any, this.selectedElement.id);
    this.selectionService.clearSelection();
  }

  /**
   * Duplicate selected element
   */
  duplicateElement(): void {
    if (!this.selectedElement) return;
    this.templateState.duplicateElement(this.activeSection as any, this.selectedElement.id);
  }

  /**
   * Toggle bold
   */
  toggleBold(): void {
    this.fontWeight = this.fontWeight === 'bold' ? 'normal' : 'bold';
    this.applyChanges();
  }

  /**
   * Toggle italic
   */
  toggleItalic(): void {
    this.fontStyle = this.fontStyle === 'italic' ? 'normal' : 'italic';
    this.applyChanges();
  }

  /**
   * Set text alignment
   */
  setAlignment(align: 'left' | 'center' | 'right' | 'justify'): void {
    this.textAlign = align;
    this.applyChanges();
  }

  /**
   * Bring to front / send to back
   */
  bringToFront(): void {
    if (!this.selectedElement) return;
    this.templateState.reorderElement(this.activeSection as any, this.selectedElement.id, 'front');
  }

  sendToBack(): void {
    if (!this.selectedElement) return;
    this.templateState.reorderElement(this.activeSection as any, this.selectedElement.id, 'back');
  }

  /**
   * Toggle locked state
   */
  toggleLock(): void {
    this.locked = !this.locked;
    this.applyChanges();
  }

  /**
   * Element type display label
   */
  get elementTypeLabel(): string {
    if (!this.selectedElement) return '';
    const labels: Record<string, string> = {
      text: 'Texto',
      dataField: 'Campo de Datos',
      formula: 'Fórmula',
      image: 'Imagen',
      line: 'Línea',
      rectangle: 'Rectángulo',
      qrCode: 'Código QR',
      barcode: 'Código de Barras'
    };
    return labels[this.selectedElement.type] || this.selectedElement.type;
  }
}
