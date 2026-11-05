import { Directive, ElementRef, Input, OnChanges } from '@angular/core';
import { LabelBarcodeElement } from '../../../core/models/price-label-template.model';
import { PriceLabelRendererService } from '../services/price-label-renderer.service';

@Directive({ selector: '[labelBarcode]', standalone: true })
export class LabelBarcodeDirective implements OnChanges {
  @Input({ required: true }) labelBarcode!: LabelBarcodeElement;
  @Input() barcodeValue = '';
  private renderedKey = '';

  constructor(private host: ElementRef<HTMLElement>, private renderer: PriceLabelRendererService) {}

  ngOnChanges(): void {
    const key = JSON.stringify([this.barcodeValue, this.labelBarcode.barcodeType, this.labelBarcode.showText]);
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    const svg = this.renderer.createBarcodeSvg(this.barcodeValue, this.labelBarcode);
    const container = this.host.nativeElement;
    container.setAttribute('role', 'img');
    if (svg) {
      svg.style.cssText = 'width:100%;height:100%;display:block';
      container.setAttribute('aria-label', 'Código de barras ' + this.barcodeValue);
      container.replaceChildren(svg);
    } else {
      container.setAttribute('aria-label', 'Código de barras no válido');
      container.textContent = this.barcodeValue ? 'Código no válido para ' + this.labelBarcode.barcodeType : 'Sin datos de código';
    }
  }
}
