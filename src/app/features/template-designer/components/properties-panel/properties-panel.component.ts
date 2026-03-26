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
        this.selectedElement = elements.length === 1 ? elements[0] : null;
        this.activeSection = this.selectionService.getActiveSection();
        if (this.selectedElement) {
          this.loadElementProperties(this.selectedElement);
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
