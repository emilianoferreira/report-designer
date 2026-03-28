/**
 * HTML Renderer Service
 * Converts a ReportTemplate (JSON) + InvoiceData into a complete HTML document.
 *
 * This is the core render engine. It takes the visual template designed in the
 * canvas and produces HTML output that matches the Zureo ERP template format.
 *
 * The output HTML can be:
 *   1. Displayed in the preview iframe (with data already resolved)
 *   2. Sent to Puppeteer for PDF generation
 *   3. Exported as an HTML template with Zureo directives (z-code, z-if)
 */
import { Injectable } from '@angular/core';
import {
  ReportTemplate,
  TemplateElement,
  TextElement,
  DataFieldElement,
  FormulaElement,
  ImageElement,
  LineElement,
  RectangleElement,
  QRCodeElement,
  BarcodeElement,
  InvoiceData,
  FontSettings,
  ElementStyle,
  FormatDefinition,
  SectionDefinition,
  DetailSectionDefinition
} from '../../../core/models/template.model';
import { mmToPx } from '../utils/coordinate-utils';

/** Options for HTML generation */
export interface RenderOptions {
  /** If true, resolve data bindings. If false, output z-code directives */
  resolveData: boolean;
  /** If true, include @media print styles */
  includePrintStyles: boolean;
  /** Page size for CSS @page */
  pageSize: 'A4' | 'Letter';
  /** Include grid/guides for design mode */
  designMode: boolean;
}

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  resolveData: true,
  includePrintStyles: true,
  pageSize: 'A4',
  designMode: false
};

@Injectable({
  providedIn: 'root'
})
export class HtmlRendererService {

  /**
   * Render a complete HTML document from template + data
   */
  renderToHtml(
    template: ReportTemplate,
    data: InvoiceData,
    options: Partial<RenderOptions> = {}
  ): string {
    const opts = { ...DEFAULT_RENDER_OPTIONS, ...options };
    const page = template.page;

    const css = this.generateCSS(template, opts);
    const headerHtml = this.renderSection(template.sections.header, 'header', template, data, opts);
    const detailHtml = this.renderDetailSection(template.sections.detail, template, data, opts);
    const footerHtml = this.renderSection(template.sections.footer, 'footer', template, data, opts);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${this.escapeHtml(template.metadata.name)}</title>
  <style type="text/css">
${css}
  </style>
</head>
<body>
  <div class="page">
    <div class="section section-header">
${headerHtml}
    </div>
    <div class="section section-detail">
${detailHtml}
    </div>
    <div class="section section-footer">
${footerHtml}
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Render only the preview HTML (for iframe srcdoc)
   */
  renderPreview(template: ReportTemplate, data: InvoiceData): string {
    return this.renderToHtml(template, data, {
      resolveData: true,
      includePrintStyles: true,
      designMode: false
    });
  }

  /**
   * Export as Zureo HTML template (with z-code directives, no data resolved)
   */
  exportAsZureoTemplate(template: ReportTemplate): string {
    const emptyData: InvoiceData = {
      invoice: {},
      invoiceLines: [],
      company: {}
    };
    return this.renderToHtml(template, emptyData, {
      resolveData: false,
      includePrintStyles: true,
      designMode: false
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // CSS Generation
  // ─────────────────────────────────────────────────────────────────

  private generateCSS(template: ReportTemplate, opts: RenderOptions): string {
    const page = template.page;
    const widthPx = mmToPx(page.width);
    const heightPx = mmToPx(page.height);
    const defaultFont = page.defaultFont;

    let css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${defaultFont.family}, sans-serif;
      font-size: ${defaultFont.size}pt;
      color: ${defaultFont.color};
      background: ${opts.designMode ? '#e8e8e8' : '#fff'};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: ${widthPx}px;
      min-height: ${heightPx}px;
      margin: 0 auto;
      background: #fff;
      position: relative;
      padding: ${mmToPx(page.margins.top)}px ${mmToPx(page.margins.right)}px ${mmToPx(page.margins.bottom)}px ${mmToPx(page.margins.left)}px;
      ${opts.designMode ? 'box-shadow: 0 2px 12px rgba(0,0,0,0.15);' : ''}
    }
    .section {
      position: relative;
      width: 100%;
      overflow: visible;
    }
    .section-header {
      min-height: ${mmToPx(template.sections.header.height)}px;
    }
    .section-detail {
      min-height: ${mmToPx(template.sections.detail.height)}px;
    }
    .section-footer {
      min-height: ${mmToPx(template.sections.footer.height)}px;
    }
    .element {
      position: absolute;
      overflow: hidden;
    }
    .element-text {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.3;
    }
    .element-datafield {
      line-height: 1.3;
    }
    .element-formula {
      line-height: 1.3;
    }
    .element-image img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .element-line {
      overflow: visible;
    }
    .detail-table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${defaultFont.size}pt;
    }
    .detail-table th {
      font-weight: 600;
      border-bottom: 1px solid #b1b1b1;
      padding: 4px 6px;
      text-align: left;
    }
    .detail-table td {
      padding: 3px 6px;
      border-bottom: 1px solid #e8e8e8;
    }
    .subtotals-block {
      margin-top: 12px;
      text-align: right;
    }
    .subtotals-table {
      width: 100%;
      max-width: 400px;
      float: right;
      font-size: 13px;
      text-align: right;
    }
    .subtotals-table td {
      padding: 2px 4px;
    }
    .total-row td {
      font-weight: bold;
      font-size: 14px;
      border-top: 1px solid #333;
      padding-top: 4px;
    }
    .comentario {
      border-top: 1px solid #b1b1b1;
      border-bottom: 1px solid #b1b1b1;
      margin-top: 10px;
      padding: 5px;
      text-align: left;
      font-size: 12px;
      white-space: pre-line;
    }`;

    if (opts.includePrintStyles) {
      css += `
    @media print {
      body { background: #fff; }
      .page {
        width: 100%;
        min-height: auto;
        margin: 0;
        padding: ${mmToPx(page.margins.top)}px ${mmToPx(page.margins.right)}px ${mmToPx(page.margins.bottom)}px ${mmToPx(page.margins.left)}px;
        box-shadow: none;
      }
      @page {
        size: ${page.width}mm ${page.height}mm;
        margin: 0;
      }
    }`;
    }

    return css;
  }

  // ─────────────────────────────────────────────────────────────────
  // Section Rendering
  // ─────────────────────────────────────────────────────────────────

  private renderSection(
    section: SectionDefinition,
    sectionName: string,
    template: ReportTemplate,
    data: InvoiceData,
    opts: RenderOptions
  ): string {
    if (!section || !section.elements.length) return '';

    let html = '';
    // Sort by zIndex for correct layering
    const sortedElements = [...section.elements].sort((a, b) => a.zIndex - b.zIndex);

    for (const element of sortedElements) {
      html += this.renderElement(element, template, data, opts);
    }

    return html;
  }

  private renderDetailSection(
    section: DetailSectionDefinition,
    template: ReportTemplate,
    data: InvoiceData,
    opts: RenderOptions
  ): string {
    let html = '';

    // Render any positioned elements in the detail section (column headers, etc.)
    if (section.elements.length > 0) {
      const sortedElements = [...section.elements].sort((a, b) => a.zIndex - b.zIndex);
      for (const element of sortedElements) {
        html += this.renderElement(element, template, data, opts);
      }
    }

    // Calculate offset to clear positioned elements (column headers, lines)
    let tableOffsetMm = 0;
    if (section.elements.length > 0) {
      tableOffsetMm = Math.max(
        ...section.elements.map(el => el.position.y + el.size.height)
      );
    }
    const tableOffsetPx = tableOffsetMm > 0 ? mmToPx(tableOffsetMm + 1) : 0;

    // Render the detail lines as a table if we have data
    if (opts.resolveData && data.invoiceLines && data.invoiceLines.length > 0) {
      html += this.renderDetailTable(section, data, opts, tableOffsetPx);
    } else if (!opts.resolveData) {
      // Export mode: output z-code directives for the detail table
      html += this.renderDetailTableDirectives(section);
    }

    return html;
  }

  /**
   * Render the articles detail table with resolved data
   */
  private renderDetailTable(
    section: DetailSectionDefinition,
    data: InvoiceData,
    opts: RenderOptions,
    tableOffsetPx: number = 0
  ): string {
    const lines = data.invoiceLines || data.Articulos || [];
    const isImpIncluidos = data.isImpIncluidos;

    // Note: column headers are already rendered as positioned text elements
    // in the detail section, so we skip <thead> to avoid duplication.
    // Wrap in a div with padding-top to clear the absolutely positioned headers.
    let html = '';
    if (tableOffsetPx > 0) {
      html += `      <div style="padding-top: ${tableOffsetPx}px;">\n`;
    }
    html += `      <table class="detail-table">
        <tbody>\n`;

    for (const line of lines) {
      const art = line['Articulo'] || {};
      const codigo = art['Codigo'] || '';
      const nombre = art['Nombre'] || '';
      const cantidad = line['Cantidad'] ?? 0;
      const unitario = isImpIncluidos
        ? (line['PrecioUnitario'] ?? 0)
        : (line['PrecioUnitarioNeto'] ?? 0);
      const descuento = line['Descuento'] ?? 0;
      const subtotal = line['SubTotal'] ?? 0;

      html += `          <tr>
            <td style="text-align:left">${this.escapeHtml(String(codigo))}</td>
            <td style="text-align:left">${this.escapeHtml(String(nombre))}</td>
            <td style="text-align:center">${cantidad}</td>
            <td style="text-align:right">${this.formatNumber(unitario)}</td>
            <td style="text-align:right">${this.formatNumber(descuento)}</td>
            <td style="text-align:right">${this.formatNumber(subtotal)}</td>
          </tr>\n`;
    }

    html += `        </tbody>
      </table>\n`;

    // Subtotals block
    html += this.renderSubtotals(data, opts);

    if (tableOffsetPx > 0) {
      html += `      </div>\n`;
    }

    return html;
  }

  /**
   * Render subtotals, taxes, total
   */
  private renderSubtotals(data: InvoiceData, opts: RenderOptions): string {
    let html = `      <div class="subtotals-block">
        <div style="font-size: 12px; text-align:left;">Moneda: ${data.Moneda?.ISO4217 || 'UYU'}</div>
        <table class="subtotals-table">
          <tbody>\n`;

    // Discount global
    if (data.hasDtoGlobal) {
      html += `            <tr>
              <td style="width: 50%">Descuento:</td>
              <td style="text-align: right; width: 50%">(${this.formatNumber(data.invoice?.['PorcentajeDescGlobal'] || 0)} %) ${this.formatNumber(data.MontoDtoGlobal || 0)}</td>
            </tr>\n`;
    }

    // Subtotal
    if (!data.isCFE) {
      html += `            <tr>
              <td style="width: 50%">Subtotal:</td>
              <td style="text-align: right; width: 50%">${this.formatNumber(data.Subtotal || 0)}</td>
            </tr>\n`;

      // Impuestos
      const impuestos = data.Impuestos || [];
      for (const imp of impuestos) {
        html += `            <tr>
              <td style="width: 50%">${this.escapeHtml(imp.Nombre)} :</td>
              <td style="text-align: right; width: 50%">${this.formatNumber(imp.Valor)}</td>
            </tr>\n`;
      }
    } else {
      // CFE desglosados
      const desglosados = data.SubtotalesDesglosados || [];
      for (const s of desglosados) {
        html += `            <tr>
              <td style="width: 50%">${this.escapeHtml(s.Key)} :</td>
              <td style="text-align: right; width: 50%">${this.formatNumber(s.Value)}</td>
            </tr>\n`;
      }
    }

    // Redondeo
    if (data.hasRedondeo) {
      html += `            <tr>
              <td style="width: 50%">Redondeo:</td>
              <td style="text-align: right; width: 50%">${this.formatNumber(data.Redondeo || 0)}</td>
            </tr>\n`;
    }

    // Total
    const simbolo = data.Moneda?.Simbolo || '$';
    html += `            <tr class="total-row">
              <td style="width: 50%">Total:</td>
              <td style="text-align: right; width: 50%">${simbolo} ${this.formatNumber(data.Total || 0)}</td>
            </tr>\n`;

    html += `          </tbody>
        </table>
      </div>\n`;

    return html;
  }

  /**
   * Render detail table as z-code directives (for template export)
   */
  private renderDetailTableDirectives(section: DetailSectionDefinition): string {
    return `      <table class="detail-table">
        <tr>
          <div z-code="true" z-override-parent="true"> HTML(\`<th style="@estilos">@campo</th>\`,
            [{estilos: "width: 18%; text-align:left", campo:"CÓDIGO" },
            {estilos: "width: 35%; text-align:left", campo:"DESCRIPCIÓN" },
            {estilos: "width: 8%; text-align:center", campo:"CANT." },
            {estilos: "width: 14%; text-align:right", campo:"UNITARIO" },
            {estilos: "width: 10%; text-align:right", campo:"DESC" },
            {estilos: "width: 15%; text-align:right", campo:"IMPORTE" }
            ]) </div>
        </tr>
      </table>
      <table class="detail-table">
        <div z-code="true" z-override-parent="true">
          HTML('<tr><td style="@codstyle">@cod</td>
                <td style="@nomstyle">@nombre</td>
                <td style="@cantstyle">@cant</td>
                <td style="@unitstyle">@unitario</td>
                <td style="@descstyle">@desc</td>
                <td style="@subtstyle">@subtotal</td></tr>', Articulos.map( function (art) {
                  return { codstyle:"width: 18%; text-align:left", cod: art.Articulo.Codigo,
                           nomstyle:"width: 35%; text-align:left", nombre: art.Articulo.Nombre,
                           cantstyle:"width: 8%; text-align:center", cant: art.Cantidad,
                           unitstyle:"width: 14%; text-align:right", unitario: Format(isImpIncluidos ? UnitarioBruto(art) : UnitarioNeto(art)),
                           descstyle: "width: 10%; text-align:right", desc: Format(Dto(art)),
                           subtstyle: "width: 15%; text-align:right", subtotal: Format(TotalConDto(art)) }
                } ))
        </div>
      </table>\n`;
  }

  // ─────────────────────────────────────────────────────────────────
  // Element Rendering
  // ─────────────────────────────────────────────────────────────────

  private renderElement(
    element: TemplateElement,
    template: ReportTemplate,
    data: InvoiceData,
    opts: RenderOptions
  ): string {
    // Skip print-only elements in screen mode and vice versa
    if (element.screenOnly && opts.includePrintStyles) {
      // Include but mark as screen-only
    }

    // Check visibility
    if (!this.evaluateVisibility(element, data, opts)) {
      return '';
    }

    const posStyle = this.getPositionCSS(element);
    const contentStyle = this.getContentCSS(element, template);

    switch (element.type) {
      case 'text':
        return this.renderTextElement(element, posStyle, contentStyle);
      case 'dataField':
        return this.renderDataFieldElement(element, posStyle, contentStyle, data, opts);
      case 'formula':
        return this.renderFormulaElement(element, posStyle, contentStyle, data, opts);
      case 'image':
        return this.renderImageElement(element, posStyle, contentStyle, data, opts);
      case 'line':
        return this.renderLineElement(element, posStyle);
      case 'rectangle':
        return this.renderRectangleElement(element, posStyle);
      case 'qrCode':
        return this.renderQRElement(element, posStyle, data, opts);
      case 'barcode':
        return this.renderBarcodeElement(element, posStyle, data, opts);
      default:
        return '';
    }
  }

  private renderTextElement(el: TextElement, pos: string, content: string): string {
    return `      <div class="element element-text" style="${pos}${content}">${this.escapeHtml(el.content)}</div>\n`;
  }

  private renderDataFieldElement(
    el: DataFieldElement, pos: string, content: string,
    data: InvoiceData, opts: RenderOptions
  ): string {
    if (opts.resolveData) {
      const value = this.resolveBinding(el.binding.source, data);
      const formatted = el.binding.format
        ? this.applyFormat(value, el.binding.format)
        : String(value ?? el.binding.defaultValue ?? '');
      return `      <div class="element element-datafield" style="${pos}${content}">${this.escapeHtml(formatted)}</div>\n`;
    } else {
      // Export as z-code directive
      return `      <div class="element element-datafield" style="${pos}${content}" z-code="true">${el.binding.source}</div>\n`;
    }
  }

  private renderFormulaElement(
    el: FormulaElement, pos: string, content: string,
    data: InvoiceData, opts: RenderOptions
  ): string {
    if (opts.resolveData) {
      const value = this.evaluateExpression(el.expression, data);
      const formatted = el.format
        ? this.applyFormat(value, el.format)
        : String(value ?? '');
      return `      <div class="element element-formula" style="${pos}${content}">${this.escapeHtml(formatted)}</div>\n`;
    } else {
      return `      <div class="element element-formula" style="${pos}${content}" z-code="true">${this.escapeHtml(el.expression)}</div>\n`;
    }
  }

  private renderImageElement(
    el: ImageElement, pos: string, content: string,
    data: InvoiceData, opts: RenderOptions
  ): string {
    let src = '';
    if (el.source.type === 'static' && el.source.url) {
      src = el.source.url;
    } else if (el.source.type === 'dataField' && el.source.binding && opts.resolveData) {
      src = this.resolveBinding(el.source.binding, data) || '';
    }

    if (src) {
      return `      <div class="element element-image" style="${pos}"><img src="${this.escapeHtml(src)}" style="object-fit: ${el.fit};" /></div>\n`;
    }
    return `      <div class="element element-image" style="${pos} background: #f5f5f5; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999;">Imagen</div>\n`;
  }

  private renderLineElement(el: LineElement, pos: string): string {
    const borderStyle = `${mmToPx(el.lineStyle.width)}px ${el.lineStyle.style} ${el.lineStyle.color}`;
    if (el.direction === 'horizontal') {
      return `      <div class="element element-line" style="${pos} border-top: ${borderStyle};"></div>\n`;
    } else {
      return `      <div class="element element-line" style="${pos} border-left: ${borderStyle};"></div>\n`;
    }
  }

  private renderRectangleElement(el: RectangleElement, pos: string): string {
    let style = pos;
    if (el.fillColor) style += ` background-color: ${el.fillColor};`;
    if (el.strokeColor) {
      style += ` border: ${mmToPx(el.strokeWidth || 0.3)}px ${el.strokeStyle || 'solid'} ${el.strokeColor};`;
    }
    if (el.style.borderRadius) {
      style += ` border-radius: ${mmToPx(el.style.borderRadius)}px;`;
    }
    return `      <div class="element element-rectangle" style="${style}"></div>\n`;
  }

  private renderQRElement(
    el: QRCodeElement, pos: string,
    data: InvoiceData, opts: RenderOptions
  ): string {
    // In preview, show placeholder. Real QR generation happens server-side
    if (opts.resolveData) {
      const qrData = this.resolveBinding(el.dataBinding, data) || 'QR';
      return `      <div class="element" style="${pos} background: repeating-conic-gradient(#333 0% 25%, #fff 0% 50%) 50%/6px 6px; display: flex; align-items: center; justify-content: center;"><span style="background:#fff; padding:2px 4px; font-size:8px;">QR</span></div>\n`;
    }
    return `      <div class="element" style="${pos}" z-code="true">HTML(\`<img src="data:image/jpg;base64,@base64" style="max-width:100%;" />\`, { base64: QRBase64 })</div>\n`;
  }

  private renderBarcodeElement(
    el: BarcodeElement, pos: string,
    data: InvoiceData, opts: RenderOptions
  ): string {
    return `      <div class="element" style="${pos} background: #fff; border: 1px solid #e0e0e0; display: flex; align-items: center; justify-content: center; font-size: 10px; letter-spacing: 2px;">|||||||||||</div>\n`;
  }

  // ─────────────────────────────────────────────────────────────────
  // CSS Helpers
  // ─────────────────────────────────────────────────────────────────

  private getPositionCSS(el: TemplateElement): string {
    const left = mmToPx(el.position.x);
    const top = mmToPx(el.position.y);
    const width = mmToPx(el.size.width);
    const height = mmToPx(el.size.height);

    return `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; z-index: ${el.zIndex};`;
  }

  private getContentCSS(el: TemplateElement, template: ReportTemplate): string {
    let css = '';
    const font = el.style.font || template.page.defaultFont;

    if (font) {
      css += ` font-family: ${font.family}, sans-serif;`;
      css += ` font-size: ${font.size}pt;`;
      css += ` font-weight: ${font.weight};`;
      css += ` font-style: ${font.style};`;
      css += ` color: ${font.color};`;
    }

    if (el.style.textAlign) css += ` text-align: ${el.style.textAlign};`;
    if (el.style.backgroundColor) css += ` background-color: ${el.style.backgroundColor};`;
    if (el.style.opacity != null && el.style.opacity < 1) css += ` opacity: ${el.style.opacity};`;

    if (el.style.verticalAlign) {
      css += ` display: flex;`;
      css += ` align-items: ${el.style.verticalAlign === 'top' ? 'flex-start' : el.style.verticalAlign === 'middle' ? 'center' : 'flex-end'};`;
    }

    if (el.style.padding) {
      css += ` padding: ${mmToPx(el.style.padding.top)}px ${mmToPx(el.style.padding.right)}px ${mmToPx(el.style.padding.bottom)}px ${mmToPx(el.style.padding.left)}px;`;
    }

    if (el.style.borders) {
      const b = el.style.borders;
      if (b.top) css += ` border-top: ${mmToPx(b.top.width)}px ${b.top.style} ${b.top.color};`;
      if (b.right) css += ` border-right: ${mmToPx(b.right.width)}px ${b.right.style} ${b.right.color};`;
      if (b.bottom) css += ` border-bottom: ${mmToPx(b.bottom.width)}px ${b.bottom.style} ${b.bottom.color};`;
      if (b.left) css += ` border-left: ${mmToPx(b.left.width)}px ${b.left.style} ${b.left.color};`;
    }

    if (el.style.borderRadius) css += ` border-radius: ${mmToPx(el.style.borderRadius)}px;`;
    if (el.style.overflow === 'hidden') css += ` overflow: hidden;`;
    if (el.style.overflow === 'ellipsis') css += ` overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;

    return css;
  }

  // ─────────────────────────────────────────────────────────────────
  // Data Resolution
  // ─────────────────────────────────────────────────────────────────

  /**
   * Resolve a dot-notation binding path against the data object.
   * e.g., "invoice.Tipo.Nombre" → data.invoice.Tipo.Nombre
   *        "comp.Fecha" → data.invoice.Fecha (comp is alias for invoice)
   */
  resolveBinding(path: string, data: InvoiceData): any {
    if (!path || !data) return undefined;

    // Normalize common Zureo aliases
    let normalizedPath = path
      .replace(/^comp\./, 'invoice.')
      .replace(/^data\./, '');

    const parts = normalizedPath.split('.');
    let current: any = data;

    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * Evaluate a simple expression against the data context.
   * Supports basic arithmetic and property access.
   * NOTE: Uses Function() for MVP. Will be replaced with mathjs sandbox in Phase 2.
   */
  private evaluateExpression(expression: string, data: InvoiceData): any {
    if (!expression) return '';
    try {
      // Create a safe-ish context with common aliases
      const context: Record<string, any> = {
        ...data,
        comp: data.invoice,
        Format: (v: number) => this.formatNumber(v),
        DateFormat: (d: string, fmt: string) => this.formatDate(d, fmt)
      };

      // Build argument names and values
      const keys = Object.keys(context);
      const values = Object.values(context);

      const fn = new Function(...keys, `"use strict"; return (${expression});`);
      return fn(...values);
    } catch (e) {
      console.warn(`Expression evaluation failed: "${expression}"`, e);
      return `[Error: ${expression}]`;
    }
  }

  /**
   * Check element visibility rule
   */
  private evaluateVisibility(
    element: TemplateElement,
    data: InvoiceData,
    opts: RenderOptions
  ): boolean {
    if (!element.visibility || element.visibility.type === 'always') return true;
    if (!opts.resolveData) return true; // In export mode, always include

    if (element.visibility.expression) {
      const result = this.evaluateExpression(element.visibility.expression, data);
      return !!result;
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────────
  // Formatting
  // ─────────────────────────────────────────────────────────────────

  private applyFormat(value: any, format: FormatDefinition): string {
    if (value == null) return '';

    switch (format.type) {
      case 'number':
        return this.formatNumber(Number(value), format.decimals);
      case 'currency': {
        const symbol = format.currencyCode === 'USD' ? 'US$ ' : '$ ';
        return symbol + this.formatNumber(Number(value), format.decimals ?? 2);
      }
      case 'date':
        return this.formatDate(String(value), format.pattern || 'dd/MM/yyyy');
      case 'percentage':
        return this.formatNumber(Number(value) * 100, format.decimals ?? 1) + '%';
      default:
        return String(value);
    }
  }

  formatNumber(value: number, decimals: number = 2): string {
    if (value == null || isNaN(value)) return '0,00';
    return value.toLocaleString('es-UY', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  formatDate(dateStr: string, pattern: string = 'dd/MM/yyyy'): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, '0');
      const mins = date.getMinutes().toString().padStart(2, '0');

      return pattern
        .replace('dd', day)
        .replace('MM', month)
        .replace('yyyy', String(year))
        .replace('HH', hours)
        .replace('mm', mins);
    } catch {
      return dateStr;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
