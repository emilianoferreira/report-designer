/**
 * Element Factory
 * Creates new template elements with sensible defaults
 * Each element type gets a unique ID and standard dimensions
 */

import { v4 as uuid } from 'uuid';
import {
  TextElement,
  DataFieldElement,
  FormulaElement,
  ImageElement,
  LineElement,
  RectangleElement,
  QRCodeElement,
  BarcodeElement,
  TemplateElement,
  ElementType,
  FontSettings
} from '../../../core/models/template.model';

/**
 * Default font settings for all new elements
 */
const DEFAULT_FONT: FontSettings = {
  family: 'Arial',
  size: 10,
  weight: 'normal',
  style: 'normal',
  color: '#000000'
};

/**
 * Factory function to create a new element of any type
 * @param type - Element type
 * @param position - Starting position {x, y} in mm
 * @param overrides - Optional property overrides
 * @returns New element with default values
 */
export function createElement(
  type: ElementType,
  position: { x: number; y: number } = { x: 10, y: 10 },
  overrides?: Partial<any>
): TemplateElement {
  const baseId = uuid();
  const baseName = getDefaultNameForType(type);

  switch (type) {
    case 'text':
      return createTextElement(position, baseName, baseId, overrides);
    case 'dataField':
      return createDataFieldElement(position, baseName, baseId, overrides);
    case 'formula':
      return createFormulaElement(position, baseName, baseId, overrides);
    case 'image':
      return createImageElement(position, baseName, baseId, overrides);
    case 'line':
      return createLineElement(position, baseName, baseId, overrides);
    case 'rectangle':
      return createRectangleElement(position, baseName, baseId, overrides);
    case 'qrCode':
      return createQRCodeElement(position, baseName, baseId, overrides);
    case 'barcode':
      return createBarcodeElement(position, baseName, baseId, overrides);
    default:
      throw new Error(`Unknown element type: ${type}`);
  }
}

/**
 * Create a text element (static text)
 * Default: 40mm x 8mm
 */
function createTextElement(
  position: { x: number; y: number },
  name: string,
  id: string,
  overrides?: any
): TextElement {
  return {
    id,
    type: 'text',
    name: overrides?.name || name,
    position,
    size: { width: 40, height: 8, ...overrides?.size },
    style: {
      font: DEFAULT_FONT,
      textAlign: 'left',
      ...overrides?.style
    },
    visibility: { type: 'always' },
    locked: false,
    zIndex: 1,
    printOnly: false,
    screenOnly: false,
    content: 'Lorem ipsum'
  };
}

/**
 * Create a data field element
 * Default: 40mm x 6mm
 */
function createDataFieldElement(
  position: { x: number; y: number },
  name: string,
  id: string,
  overrides?: any
): DataFieldElement {
  return {
    id,
    type: 'dataField',
    name: overrides?.name || name,
    position,
    size: { width: 40, height: 6, ...overrides?.size },
    style: {
      font: DEFAULT_FONT,
      textAlign: 'left',
      ...overrides?.style
    },
    visibility: { type: 'always' },
    locked: false,
    zIndex: 1,
    printOnly: false,
    screenOnly: false,
    binding: {
      source: 'data.fieldName',
      ...overrides?.binding
    }
  };
}

/**
 * Create a formula element
 * Default: 40mm x 6mm
 */
function createFormulaElement(
  position: { x: number; y: number },
  name: string,
  id: string,
  overrides?: any
): FormulaElement {
  return {
    id,
    type: 'formula',
    name: overrides?.name || name,
    position,
    size: { width: 40, height: 6, ...overrides?.size },
    style: {
      font: DEFAULT_FONT,
      textAlign: 'left',
      ...overrides?.style
    },
    visibility: { type: 'always' },
    locked: false,
    zIndex: 1,
    printOnly: false,
    screenOnly: false,
    expression: '1 + 1',
    format: { type: 'number', decimals: 2 }
  };
}

/**
 * Create an image element
 * Default: 30mm x 20mm
 */
function createImageElement(
  position: { x: number; y: number },
  name: string,
  id: string,
  overrides?: any
): ImageElement {
  return {
    id,
    type: 'image',
    name: overrides?.name || name,
    position,
    size: { width: 30, height: 20, ...overrides?.size },
    style: {
      ...overrides?.style
    },
    visibility: { type: 'always' },
    locked: false,
    zIndex: 1,
    printOnly: false,
    screenOnly: false,
    source: {
      type: 'static',
      url: 'https://via.placeholder.com/300x200',
      ...overrides?.source
    },
    fit: 'contain'
  };
}

/**
 * Create a line element
 * Default: 50mm wide, horizontal
 */
function createLineElement(
  position: { x: number; y: number },
  name: string,
  id: string,
  overrides?: any
): LineElement {
  return {
    id,
    type: 'line',
    name: overrides?.name || name,
    position,
    size: { width: 50, height: 0, ...overrides?.size },
    style: {
      ...overrides?.style
    },
    visibility: { type: 'always' },
    locked: false,
    zIndex: 1,
    printOnly: false,
    screenOnly: false,
    direction: 'horizontal',
    lineStyle: {
      width: 0.5,
      style: 'solid',
      color: '#000000'
    }
  };
}

/**
 * Create a rectangle element
 * Default: 40mm x 20mm
 */
function createRectangleElement(
  position: { x: number; y: number },
  name: string,
  id: string,
  overrides?: any
): RectangleElement {
  return {
    id,
    type: 'rectangle',
    name: overrides?.name || name,
    position,
    size: { width: 40, height: 20, ...overrides?.size },
    style: {
      ...overrides?.style
    },
    visibility: { type: 'always' },
    locked: false,
    zIndex: 0,
    printOnly: false,
    screenOnly: false,
    strokeColor: '#cccccc',
    strokeWidth: 0.3,
    strokeStyle: 'solid'
  };
}

/**
 * Create a QR code element
 * Default: 25mm x 25mm
 */
function createQRCodeElement(
  position: { x: number; y: number },
  name: string,
  id: string,
  overrides?: any
): QRCodeElement {
  return {
    id,
    type: 'qrCode',
    name: overrides?.name || name,
    position,
    size: { width: 25, height: 25, ...overrides?.size },
    style: {
      ...overrides?.style
    },
    visibility: { type: 'always' },
    locked: false,
    zIndex: 1,
    printOnly: false,
    screenOnly: false,
    dataBinding: 'data.qrContent',
    errorCorrection: 'M',
    foregroundColor: '#000000',
    backgroundColor: '#ffffff'
  };
}

/**
 * Create a barcode element
 * Default: 50mm x 15mm
 */
function createBarcodeElement(
  position: { x: number; y: number },
  name: string,
  id: string,
  overrides?: any
): BarcodeElement {
  return {
    id,
    type: 'barcode',
    name: overrides?.name || name,
    position,
    size: { width: 50, height: 15, ...overrides?.size },
    style: {
      ...overrides?.style
    },
    visibility: { type: 'always' },
    locked: false,
    zIndex: 1,
    printOnly: false,
    screenOnly: false,
    barcodeType: 'CODE128',
    dataBinding: 'data.barcodeContent',
    showText: true,
    barWidth: 0.5,
    barHeight: 12
  };
}

/**
 * Get a human-readable default name for an element type
 */
function getDefaultNameForType(type: ElementType): string {
  const nameMap: Record<ElementType, string> = {
    text: 'Text',
    dataField: 'Data Field',
    formula: 'Formula',
    image: 'Image',
    line: 'Line',
    rectangle: 'Rectangle',
    qrCode: 'QR Code',
    barcode: 'Barcode'
  };
  return nameMap[type] || type;
}

/**
 * Clone an existing element (deep copy)
 * Generates a new ID and appends " Copy" to the name
 */
export function cloneElement(element: TemplateElement): TemplateElement {
  const cloned = JSON.parse(JSON.stringify(element));
  cloned.id = uuid();
  cloned.name = `${cloned.name} Copy`;
  // Offset position slightly so it's not exactly on top
  cloned.position.x += 2;
  cloned.position.y += 2;
  return cloned;
}

/**
 * Merge partial element updates into an element
 * Used when the user edits properties
 */
export function updateElement<T extends TemplateElement>(
  element: T,
  updates: Partial<T>
): T {
  return { ...element, ...updates };
}
