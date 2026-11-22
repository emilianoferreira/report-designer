import JsBarcode from 'jsbarcode';
import { LabelCalibration, LabelTemplate, PriceLabelArticle } from '../../../core/models/price-label-template.model';
import { createDefaultPriceLabelTemplate } from './default-price-label-template';

export const labelCalibrations: { id: LabelCalibration; name: string; width: number; height: number }[] = [
  { id: 'a4-control', name: 'Calibración A4 · hoja de control', width: 210, height: 297 },
  { id: 'a4-grid', name: 'Calibración A4 · plancha 4 × 8', width: 50, height: 30 },
  { id: 'thermal-50x30', name: 'Calibración térmica · 50 × 30 mm', width: 50, height: 30 },
  { id: 'thermal-60x40', name: 'Calibración térmica · 60 × 40 mm', width: 60, height: 40 }
];

export function createCalibrationTemplate(value: string | null): LabelTemplate | undefined {
  const format = labelCalibrations.find(candidate => candidate.id === value);
  if (!format) return undefined;
  const { id, name, width, height } = format;
  const template = createDefaultPriceLabelTemplate();
  template.calibration = id;
  template.name = name;
  const grid = id === 'a4-grid';
  const margin = grid ? 5 : 0;
  template.page = {
    mode: 'sheet', size: 'A4', orientation: 'portrait', width: 210, height: 297,
    marginTop: margin, marginRight: margin, marginBottom: margin, marginLeft: margin
  };
  template.label = {
    width, height, columns: grid ? 4 : 1, rows: grid ? 8 : 1, gapX: 0, gapY: grid ? 2 : 0,
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0
  };
  if (isThermalCalibration(id)) {
    template.printProfiles = { schemaVersion: 1, thermal: {
      width, height, printableWidth: width, offsetX: 0, offsetY: 0, media: 'gap'
    } };
  }
  template.elements = [{
    id: 'calibration-artwork', name: 'Marcas y códigos de calibración', type: 'image',
    position: { x: 0, y: 0 }, size: { width, height }, style: {}, zIndex: 1, locked: true,
    sourceType: 'binding', binding: 'article.image', fit: 'contain'
  }];
  return template;
}

export function isThermalCalibration(calibration?: LabelCalibration): boolean {
  return calibration === 'thermal-50x30' || calibration === 'thermal-60x40';
}

export function calibrationArticles(calibration: LabelCalibration): PriceLabelArticle[] {
  const format = labelCalibrations.find(candidate => candidate.id === calibration);
  if (!format) return [];
  const { width, height } = format;
  const count = calibration === 'a4-control' ? 1 : calibration === 'a4-grid' ? 32 : 12;
  return Array.from({ length: count }, (_, index) => {
    const artwork = new CalibrationArtwork(width, height);
    const number = index + 1;
    const row = Math.floor(index / 4) + 1;
    const column = index % 4 + 1;
    const code = calibration === 'a4-control' ? 'CAL-A4'
      : calibration === 'a4-grid' ? `F${row}C${column}`
      : number % 2 ? ean(number) : `C${String(number).padStart(2, '0')}`;
    if (calibration === 'a4-control') drawControl(artwork);
    else if (calibration === 'a4-grid') drawCell(artwork, row, column, code);
    else drawThermal(artwork, width, height, number, code);
    return { id: `calibration-${number}`, name: code, code, barcode: code, price: null, image: artwork.toDataUrl() };
  });
}

function drawControl(art: CalibrationArtwork): void {
  art.corners(15, 15, 195, 282, 1.6);
  art.text(105, 26, 'Calibración de impresión · A4', 23, true);
  art.ruler(55, 58, 100, 10);
  art.text(105, 64, '100 mm entre marcas', 9);
  art.ruler(25, 75, 100, 10, true);
  art.text(39, 78, '100 mm', 8);
  art.text(41, 175, 'entre marcas', 8);
  art.barcode(83, 166, 10, ean(1), 'EAN13');
  art.barcode(148, 166, 10, 'CAL-A4', 'CODE128');
  art.text(83, 181, `EAN-13  ${ean(1)}`, 8);
  art.text(148, 181, 'CODE128  CAL-A4', 8);
}

function drawCell(art: CalibrationArtwork, row: number, column: number, code: string): void {
  art.corners(2, 2, 48, 28, 0.9);
  art.text(25, 7, `Fila ${row}   Columna ${column}`, 9, true);
  art.barcode(25, 10, 9, code, 'CODE128');
  art.text(25, 24, code, 8);
}

function drawThermal(art: CalibrationArtwork, width: number, height: number, number: number, code: string): void {
  const horizontal = width - 20;
  const vertical = height - 10;
  art.corners(3, 3, width - 3, height - 3, 1);
  art.ruler(10, 6, horizontal, 5);
  art.ruler(6, 5, vertical, 5, true);
  art.text(width / 2, 9.2, `H ${horizontal} mm  /  V ${vertical} mm`, 6);
  art.barcode(width / 2 + 2, height / 2 - 3.2, height === 30 ? 8 : 11, code, number % 2 ? 'EAN13' : 'CODE128');
  art.text(width / 2 + 2, height / 2 + (height === 30 ? 8.3 : 11.3), code, 7.2);
  art.text(width / 2, height - 2.2, `${String(number).padStart(2, '0')}/12   |   ${width} × ${height} mm`, 6.8, true);
}

function ean(number: number): string {
  const payload = `20012345${String(number).padStart(4, '0')}`;
  const total = [...payload].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0);
  return payload + ((10 - total % 10) % 10);
}

const mmPerPoint = 25.4 / 72;
const barcodeModule = 0.32;

/** The artwork uses the same physical coordinates and barcode values as the printed references. */
class CalibrationArtwork {
  private readonly elements: string[] = [];

  constructor(private readonly width: number, private readonly height: number) {}

  private line(x1: number, y1: number, x2: number, y2: number, points = 0.35): void {
    this.elements.push(`<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke-width="${points * mmPerPoint}"/>`);
  }

  corners(left: number, top: number, right: number, bottom: number, radius: number): void {
    for (const x of [left, right]) {
      for (const y of [top, bottom]) {
        this.line(x - radius, y, x + radius, y, 0.55);
        this.line(x, y - radius, x, y + radius, 0.55);
      }
    }
  }

  ruler(x: number, y: number, length: number, step: number, vertical = false): void {
    const line = (a: number, b: number, c: number, d: number, weight?: number) =>
      vertical ? this.line(x + b, y + a, x + d, y + c, weight) : this.line(x + a, y + b, x + c, y + d, weight);
    line(0, 0, length, 0, 0.55);
    for (let offset = 0; offset <= length; offset += step) {
      line(offset, offset === 0 || offset === length ? -1.2 : 0, offset, 1.2);
    }
  }

  text(x: number, y: number, content: string, points: number, bold = false): void {
    this.elements.push(`<text x="${x}" y="${y}" stroke="none" text-anchor="middle" xml:space="preserve" font-size="${points * mmPerPoint}" font-weight="${bold ? 700 : 400}">${content}</text>`);
  }

  barcode(center: number, top: number, height: number, value: string, format: 'EAN13' | 'CODE128'): void {
    const target: { encodings?: { data: string }[] } = {};
    JsBarcode(target, value, { format, flat: true });
    const modules = target.encodings!.map(encoding => encoding.data).join('');
    const start = center - modules.length * barcodeModule / 2;
    for (const run of modules.matchAll(/1+/g)) {
      this.elements.push(`<rect x="${start + run.index! * barcodeModule}" y="${top}" width="${run[0].length * barcodeModule}" height="${height}" stroke="none"/>`);
    }
  }

  toDataUrl(): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.width} ${this.height}" font-family="Arial, sans-serif" stroke="#000" fill="#000">${this.elements.join('')}</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
}
