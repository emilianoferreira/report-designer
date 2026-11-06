import { labelPresentation } from '../utils/label-presentation';
import { templateErrors } from '../utils/label-validation';
import { Injectable } from '@angular/core';
import JsBarcode from 'jsbarcode';
import {
  LabelBarcodeElement,
  LabelElement,
  LabelImageElement,
  LabelPriceElement,
  LabelTemplate,
  LabelTextElement,
  PriceLabelArticle,
  PriceLabelCompany,
  PriceLabelRenderContext
} from '../../../core/models/price-label-template.model';

@Injectable({
  providedIn: 'root'
})
export class PriceLabelRendererService {
  validate(template: LabelTemplate, articles: PriceLabelArticle[], copies: number, company: PriceLabelCompany): string[] {
    const structural = templateErrors(template);
    if (structural.length) return structural;
    const errors: string[] = [];
    if (!Number.isInteger(copies) || copies < 1 || copies > 99) errors.push('Copias: entero entre 1 y 99.');
    if (!articles.length) errors.push('No hay artículos para imprimir.');
    for (const el of template.elements) {
      if (!el?.position || !el?.size || !el?.style || !['text','price','barcode','image'].includes(el.type)) { errors.push('Objeto incompleto o incompatible.'); continue; }
      if (![el.position.x,el.position.y,el.size.width,el.size.height].every(Number.isFinite) || el.position.x < 0 || el.position.y < 0 || el.size.width < 2 || el.size.height < 2 || el.position.x+el.size.width > template.label.width+0.001 || el.position.y+el.size.height > template.label.height+0.001) errors.push(el.name+': geometría inválida.');
      if (el.type === 'price' && (!Number.isInteger(el.decimals) || el.decimals < 0 || el.decimals > 4)) errors.push(el.name+': decimales entre 0 y 4.');
      for (const article of articles) {
        const context = { article, company }, prefix = article.name+' · '+el.name+': ';
        if (el.type === 'price') { const value=this.resolvePath(el.binding,context); if (value == null || String(value).trim()==='' || !Number.isFinite(Number(value))) errors.push(prefix+'precio ausente o inválido.'); }
        if (el.type === 'barcode' && !this.createBarcodeSvg(String(this.resolvePath(el.binding,context) ?? ''),el)) errors.push(prefix+'código inválido para '+el.barcodeType+'.');
        if (el.type === 'text' && el.binding && this.resolvePath(el.binding,context)==null) errors.push(prefix+'campo inexistente.');
        if (el.type === 'image' && !(el.sourceType==='url' ? el.url : this.resolvePath(el.binding,context))) errors.push(prefix+'imagen ausente.');
      }
    }
    return errors;
  }

  renderToHtml(
    template: LabelTemplate,
    articles: PriceLabelArticle[],
    copies: number,
    company: PriceLabelCompany = { name: '', logo: '', currencySymbol: '$' }
  ): string {
    if (this.validate(template, articles, copies, company).length) return '';
    const page = template.page;
    const label = template.label;
    const safeCopies = Math.max(1, Math.round(copies || 1));
    const contexts = this.expandContexts(articles, safeCopies, company);

    const capacity = label.columns * label.rows;
    const pages: string[] = [];
    for (let start = 0; start < contexts.length; start += capacity) {
      const labels = contexts.slice(start, start + capacity).map(context => this.renderLabel(template, context)).join('');
      pages.push('  <main class="page">\n    <section class="labels-grid">\n' + labels + '    </section>\n  </main>');
    }
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(template.name)}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f0f0f0; font-family: Arial, sans-serif; }
    .page {
      width: ${page.width}mm;
      height: ${page.height}mm;
      margin: 0 auto;
      padding: ${page.marginTop}mm ${page.marginRight}mm ${page.marginBottom}mm ${page.marginLeft}mm;
      background: #fff;
    }
    .page { break-after: page; }
    .page:last-child { break-after: auto; }
    .labels-grid {
      display: grid;
      grid-template-columns: repeat(${label.columns}, ${label.width}mm);
      grid-auto-rows: ${label.height}mm;
      gap: ${label.gapY}mm ${label.gapX}mm;
      align-content: start;
      justify-content: start;
    }
    .label-cell {
      position: relative;
      width: ${label.width}mm;
      height: ${label.height}mm;
      overflow: hidden;
      background: #fff;
      break-inside: avoid;
    }
    .label-element {
      position: absolute;
      overflow: hidden;
    }
    .label-text, .label-price {
      line-height: 1.15;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .label-image img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .label-barcode svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    @page {
      size: ${page.width}mm ${page.height}mm;
      margin: 0;
    }
    @media print {
      html, body { background: #fff; }
      .page { margin: 0; min-height: ${page.height}mm; }
    }
  </style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
  }

  renderLabel(template: LabelTemplate, context: PriceLabelRenderContext): string {
    const elements = [...template.elements].sort((a, b) => a.zIndex - b.zIndex);
    return `      <div class="label-cell">
${elements.map(element => this.renderElement(element, context)).join('')}      </div>
`;
  }

  resolvePath(path: string | undefined, context: PriceLabelRenderContext): any {
    if (!path) return undefined;
    const parts = path.split('.');
    let current: any = context;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }

  formatPrice(value: any, decimals: number): string {
    if (value == null || String(value).trim() === '' || !Number.isInteger(decimals) || decimals < 0 || decimals > 4) return '';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    return amount.toLocaleString('es-UY', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  private expandContexts(
    articles: PriceLabelArticle[],
    copies: number,
    company: PriceLabelCompany
  ): PriceLabelRenderContext[] {
    const contexts: PriceLabelRenderContext[] = [];
    for (const article of articles) {
      for (let index = 0; index < copies; index++) {
        contexts.push({ article, company });
      }
    }
    return contexts;
  }

  private renderElement(element: LabelElement, context: PriceLabelRenderContext): string {
    const style = this.getElementStyle(element);
    switch (element.type) {
      case 'text':
        return this.renderText(element, context, style);
      case 'price':
        return this.renderPrice(element, context, style);
      case 'barcode':
        return this.renderBarcode(element, context, style);
      case 'image':
        return this.renderImage(element, context, style);
      default:
        return '';
    }
  }

  private renderText(element: LabelTextElement, context: PriceLabelRenderContext, style: string): string {
    const value = element.binding
      ? this.resolvePath(element.binding, context)
      : element.content;
    return `        <div class="label-element label-text" style="${style}">${this.escapeHtml(String(value ?? ''))}</div>
`;
  }

  private renderPrice(element: LabelPriceElement, context: PriceLabelRenderContext, style: string): string {
    const value = this.resolvePath(element.binding, context);
    const symbol = element.currencyPath
      ? String(this.resolvePath(element.currencyPath, context) ?? '')
      : '';
    const prefix = element.prefix ?? '';
    const formatted = `${prefix}${symbol} ${this.formatPrice(value, element.decimals)}`.trim();
    return `        <div class="label-element label-price" style="${style}">${this.escapeHtml(formatted)}</div>
`;
  }

  private renderBarcode(element: LabelBarcodeElement, context: PriceLabelRenderContext, style: string): string {
    const value = String(this.resolvePath(element.binding, context) ?? '');
    const svg = this.generateBarcodeSvg(value, element);
    return `        <div class="label-element label-barcode" style="${style}">${svg}</div>
`;
  }

  private renderImage(element: LabelImageElement, context: PriceLabelRenderContext, style: string): string {
    const src = element.sourceType === 'binding'
      ? String(this.resolvePath(element.binding, context) ?? '')
      : (element.url || '');
    const fit = element.fit === 'stretch' ? 'fill' : element.fit;
    if (!src) {
      return `        <div class="label-element label-image" style="${style}"></div>
`;
    }
    return `        <div class="label-element label-image" style="${style}"><img src="${this.escapeHtml(src)}" style="object-fit:${fit};" /></div>
`;
  }

  private getElementStyle(element: LabelElement): string {
    const css = {
      left: element.position.x + 'mm', top: element.position.y + 'mm',
      width: element.size.width + 'mm', height: element.size.height + 'mm',
      'z-index': String(element.zIndex), opacity: String(element.style.opacity ?? 1),
      ...labelPresentation(element)
    };
    return Object.entries(css).map(([key, value]) => key + ':' + value).join(';');
  }

  private generateBarcodeSvg(value: string, element: LabelBarcodeElement): string {
    if (!value) return '';
    return this.createBarcodeSvg(value, element)?.outerHTML ?? `<div style="font-size:8px;text-align:center;color:#999;">${this.escapeHtml(value)}</div>`;
  }

  createBarcodeSvg(value: string, element: LabelBarcodeElement): SVGSVGElement | null {
    if (!value) return null;
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      (JsBarcode as any)(svg, value, {
        format: element.barcodeType || 'CODE128',
        displayValue: element.showText,
        margin: 0,
        width: 1.4,
        height: 34,
        fontSize: 8,
        background: '#ffffff',
        lineColor: '#111111'
      });
      return svg;
    } catch {
      return null;
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
