/**
 * Core Template Data Model
 * Defines the complete JSON schema for invoice template design
 * This is the contract between frontend and backend
 */

// ============================================================================
// METADATA & SETTINGS
// ============================================================================

export interface ReportTemplate {
  schemaVersion: '1.0';
  metadata: TemplateMetadata;
  page: PageSettings;
  sections: TemplateSections;
  dataSources: DataSourceConfig;
  styles: Record<string, StyleDefinition>;
  variables: TemplateVariable[];
}

export interface TemplateMetadata {
  id: string;              // UUID
  name: string;
  description: string;
  version: number;         // auto-increment on save
  author: string;
  companyId: string;       // multi-tenant isolation
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  basedOn?: string;        // parent template ID for inheritance
}

export interface PageSettings {
  width: number;           // mm, default 210 (A4)
  height: number;          // mm, default 297 (A4)
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  orientation: 'portrait' | 'landscape';
  defaultFont: FontSettings;
}

export interface FontSettings {
  family: string;          // e.g., 'Arial'
  size: number;            // pt
  weight: 'normal' | 'bold';
  style: 'normal' | 'italic';
  color: string;           // hex color
}

// ============================================================================
// SECTIONS
// ============================================================================

export interface TemplateSections {
  header: SectionDefinition;
  detail: DetailSectionDefinition;
  footer: SectionDefinition;
  pageHeader?: SectionDefinition;   // repeats on every page after first
  pageFooter?: SectionDefinition;   // repeats on every page
}

export interface SectionDefinition {
  height: number;           // mm
  backgroundColor?: string;
  elements: TemplateElement[];
  printOnFirstPage: boolean;
  printOnLastPage: boolean;
  printOnEveryPage: boolean;
}

export interface DetailSectionDefinition extends SectionDefinition {
  dataSource: string;       // key into dataSources, e.g., 'invoiceLines'
  rowHeight: number;        // mm, default row height
  autoGrow: boolean;        // rows can grow if content overflows
  maxRowsPerPage?: number;
  alternateRowColor?: string;
  showGridLines: boolean;
  gridLineColor?: string;
  gridLineWidth?: number;   // mm
  groupBy?: string;         // field name for grouping
  groupHeader?: SectionDefinition;
  groupFooter?: SectionDefinition;
}

// ============================================================================
// ELEMENTS (Union Type & Base)
// ============================================================================

export type TemplateElement =
  | TextElement
  | DataFieldElement
  | FormulaElement
  | ImageElement
  | LineElement
  | RectangleElement
  | QRCodeElement
  | BarcodeElement;

export type ElementType =
  | 'text'
  | 'dataField'
  | 'formula'
  | 'image'
  | 'line'
  | 'rectangle'
  | 'qrCode'
  | 'barcode';

export interface BaseElement {
  id: string;               // UUID
  type: ElementType;
  name: string;             // user-friendly name
  position: {
    x: number;              // mm from left margin
    y: number;              // mm from section top
  };
  size: {
    width: number;          // mm
    height: number;         // mm
  };
  style: ElementStyle;
  visibility: VisibilityRule;
  locked: boolean;
  zIndex: number;
  printOnly: boolean;
  screenOnly: boolean;
}

export interface ElementStyle {
  font?: FontSettings;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: string;
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  borders?: {
    top?: BorderDefinition;
    right?: BorderDefinition;
    bottom?: BorderDefinition;
    left?: BorderDefinition;
  };
  borderRadius?: number;    // mm
  overflow?: 'visible' | 'hidden' | 'ellipsis';
  opacity?: number;         // 0-1
  namedStyle?: string;      // reference to styles map
}

export interface BorderDefinition {
  width: number;            // mm
  style: 'solid' | 'dashed' | 'dotted' | 'double';
  color: string;
}

export interface VisibilityRule {
  type: 'always' | 'conditional';
  expression?: string;      // e.g., "data.showDiscount === true"
}

// ============================================================================
// ELEMENT IMPLEMENTATIONS
// ============================================================================

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;          // static text content
}

export interface DataFieldElement extends BaseElement {
  type: 'dataField';
  binding: {
    source: string;         // e.g., 'invoice.customerName'
    format?: FormatDefinition;
    defaultValue?: string;
  };
}

export interface FormulaElement extends BaseElement {
  type: 'formula';
  expression: string;       // e.g., "invoice.subtotal * 0.21"
  format?: FormatDefinition;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  source: {
    type: 'static' | 'dataField';
    url?: string;           // for static
    binding?: string;       // for dataField, e.g., 'company.logoUrl'
  };
  fit: 'contain' | 'cover' | 'stretch' | 'none';
}

export interface LineElement extends BaseElement {
  type: 'line';
  direction: 'horizontal' | 'vertical' | 'diagonal';
  lineStyle: {
    width: number;          // mm
    style: 'solid' | 'dashed' | 'dotted';
    color: string;
  };
}

export interface RectangleElement extends BaseElement {
  type: 'rectangle';
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;     // mm
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
}

export interface QRCodeElement extends BaseElement {
  type: 'qrCode';
  dataBinding: string;      // expression producing the QR content
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  foregroundColor?: string;
  backgroundColor?: string;
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  barcodeType: 'CODE128' | 'EAN13' | 'EAN8' | 'CODE39';
  dataBinding: string;
  showText: boolean;
  barWidth?: number;        // mm
  barHeight?: number;       // mm
}

// ============================================================================
// FORMATTING
// ============================================================================

export interface FormatDefinition {
  type: 'text' | 'number' | 'currency' | 'date' | 'percentage';
  pattern?: string;         // e.g., '#,##0.00', 'dd/MM/yyyy'
  locale?: string;          // e.g., 'es-AR'
  currencyCode?: string;    // e.g., 'ARS'
  decimals?: number;
}

// ============================================================================
// DATA SOURCES & BINDING
// ============================================================================

export interface DataSourceConfig {
  primary: {
    entity: string;         // e.g., 'invoice'
    fields: DataFieldDefinition[];
  };
  detail: {
    entity: string;         // e.g., 'invoiceLine'
    fields: DataFieldDefinition[];
    parentKey: string;      // FK field
  };
  lookups: Record<string, LookupDataSource>;
}

export interface DataFieldDefinition {
  key: string;              // e.g., 'customerName'
  path: string;             // e.g., 'invoice.customer.name'
  label: string;            // e.g., 'Customer Name'
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'image';
  category: string;         // for grouping in field picker
}

export interface LookupDataSource {
  entity: string;
  fields: DataFieldDefinition[];
  joinField: string;
}

export interface StyleDefinition extends ElementStyle {
  // Named style reusable across elements
}

export interface TemplateVariable {
  name: string;
  expression: string;
  format?: FormatDefinition;
}

// ============================================================================
// RUNTIME DATA (for preview/rendering)
// ============================================================================

export interface InvoiceData {
  invoice: Record<string, any>;
  invoiceLines: Array<Record<string, any>>;
  company: Record<string, any>;
  [key: string]: any;
}

export interface RenderRequest {
  templateId: string;
  templateVersion: number;
  data: InvoiceData;
  options?: {
    format?: 'pdf' | 'html' | 'image';
    copies?: number;
    watermark?: string;
  };
}
