import { LabelTemplate } from '../../../core/models/price-label-template.model';
import { labelLayoutError } from './label-layout';

/** Validate HTTP data before any component consumes it. Unknown metadata is preserved. */
export function templateErrors(template: LabelTemplate): string[] {
  const layout = labelLayoutError(template);
  if (layout) return [layout];
  const errors: string[] = [];
  if (template.type !== 'price-label' || template.unit !== 'mm') errors.push('Tipo o unidad incompatible.');
  if (typeof template.name !== 'string') errors.push('Nombre de plantilla inválido.');
  const ids = new Set<string>();
  for (const el of template.elements) {
    if (!el || typeof el.id !== 'string' || ids.has(el.id) || typeof el.name !== 'string' || !el.position || !el.size || !el.style || !['text','price','barcode','image'].includes(el.type)) {
      errors.push('Objeto incompleto, duplicado o incompatible.'); continue;
    }
    ids.add(el.id);
    if (![el.position.x,el.position.y,el.size.width,el.size.height,el.zIndex].every(Number.isFinite)) errors.push(el.name+': geometría inválida.');
    if ('binding' in el && el.binding !== undefined && typeof el.binding !== 'string') errors.push(el.name+': vínculo inválido.');
    if (el.type === 'text' && typeof el.content !== 'string') errors.push(el.name+': texto inválido.');
    if (el.type === 'price' && (typeof el.binding !== 'string' || !Number.isInteger(el.decimals) || el.decimals < 0 || el.decimals > 4 || (el.currencyPath !== undefined && typeof el.currencyPath !== 'string'))) errors.push(el.name+': configuración de precio inválida.');
    if (el.type === 'barcode' && !['EAN8','EAN13','CODE128','CODE39'].includes(el.barcodeType)) errors.push(el.name+': formato de barras inválido.');
    if (el.type === 'image' && (!['url','binding'].includes(el.sourceType) || !['contain','cover','stretch'].includes(el.fit) || (el.url !== undefined && typeof el.url !== 'string'))) errors.push(el.name+': imagen inválida.');
    const font=el.style.font;
    if (font && (typeof font.family !== 'string' || !Number.isFinite(font.size) || font.size < 4 || font.size > 72)) errors.push(el.name+': fuente inválida.');
    if (el.style.opacity !== undefined && (!Number.isFinite(el.style.opacity) || el.style.opacity < 0 || el.style.opacity > 1)) errors.push(el.name+': opacidad inválida.');
    for (const key of ['borderWidth','borderRadius'] as const) if (el.style[key] !== undefined && (!Number.isFinite(el.style[key]) || el.style[key]! < 0)) errors.push(el.name+': borde inválido.');
  }
  return errors;
}
