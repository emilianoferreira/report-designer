import { LabelPrintProfileId, LabelTemplate, ThermalLabelProfile } from '../../../core/models/price-label-template.model';
import { createDefaultPriceLabelTemplate } from './default-price-label-template';

export const PRICE_LABEL_PRESETS = [
  { id: '50x30', label: '50 × 30 mm', width: 50, height: 30, columns: 4, rows: 8 },
  { id: '60x40', label: '60 × 40 mm', width: 60, height: 40, columns: 3, rows: 6 },
  { id: '40x25', label: '40 × 25 mm', width: 40, height: 25, columns: 4, rows: 10 },
  { id: 'custom', label: 'Personalizado', width: 0, height: 0, columns: 0, rows: 0 }
];

export function defaultThermalLabelProfile(width: number, height: number): ThermalLabelProfile {
  return { width, height, printableWidth: width, offsetX: 0, offsetY: 0, media: 'gap' };
}

export function createGuidedLabelTemplate(name: string, width: number, height: number, support: LabelPrintProfileId): LabelTemplate {
  const template = createDefaultPriceLabelTemplate();
  const { page, label } = template;
  const preset = PRICE_LABEL_PRESETS.find(item => item.width === width && item.height === height);
  const gapX = width === 50 ? label.gapX : 2;
  const columns = Math.max(1, Math.floor((page.width - page.marginLeft - page.marginRight + gapX) / (width + gapX)));
  const rows = Math.max(1, Math.floor((page.height - page.marginTop - page.marginBottom + label.gapY) / (height + label.gapY)));
  const scaleX = width / label.width;
  const scaleY = height / label.height;
  const elements = template.elements.map(element => {
    const { position, size, style } = element;
    const textScale = Math.min(1, scaleX, scaleY);
    return {
      ...element,
      position: { x: position.x * scaleX, y: position.y * scaleY },
      size: { width: size.width * scaleX, height: size.height * scaleY },
      style: style.font && textScale < 1
        ? { ...style, font: { ...style.font, size: Math.max(4, Math.round(style.font.size * textScale)) } }
        : style
    };
  });
  return {
    ...template, name, elements,
    label: { ...label, width, height, gapX, columns: preset?.columns ?? columns, rows: preset?.rows ?? rows },
    ...(support === 'thermal' ? { printProfiles: { schemaVersion: 1, thermal: defaultThermalLabelProfile(width, height), defaultProfile: 'thermal' } } : {})
  };
}
