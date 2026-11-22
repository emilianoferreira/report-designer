import { LabelPrintProfileId, LabelTemplate } from '../../../core/models/price-label-template.model';

export interface LabelPrintLayout {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  columns: number;
  gapX: number;
  gapY: number;
  capacity: number;
}

type LayoutResult = { layout: LabelPrintLayout; error?: never } | { layout?: never; error: string };

const fitTolerance = 0.001;

export function labelSheetName(template: LabelTemplate): string {
  const { width, height } = template.page;
  return (width === 210 && height === 297) || (width === 297 && height === 210) ? 'Hoja A4' : 'Hoja personalizada';
}

export function defaultLabelPrintProfile(template: LabelTemplate): LabelPrintProfileId {
  if (template.printProfiles?.thermal && (template.printProfiles.defaultProfile === 'thermal' || !resolveLabelLayout(template).layout)) {
    return 'thermal';
  }
  return 'sheet';
}

export function labelPageNumber(index: number, capacity: number): number {
  return Math.floor(index / capacity) + 1;
}

export function labelPageCount(total: number, capacity: number): number {
  return total > 0 && capacity > 0 ? labelPageNumber(total - 1, capacity) : 0;
}

export function resolveLabelLayout(template: LabelTemplate, profile: LabelPrintProfileId = 'sheet'): LayoutResult {
  if (!template?.page || !template?.label || !Array.isArray(template.elements)) return { error: 'Plantilla incompleta.' };
  const { page, label } = template;
  if ([label.width, label.height].some(value => !Number.isFinite(value) || value <= 0)) {
    return { error: 'Ingresa dimensiones positivas para la etiqueta.' };
  }
  if (profile === 'thermal') {
    const roll = template.printProfiles?.thermal;
    if (!roll) return { error: 'El molde no tiene un perfil térmico.' };
    if ([roll.width, roll.height, roll.printableWidth].some(value => !Number.isFinite(value) || value <= 0) ||
        [roll.offsetX, roll.offsetY].some(value => !Number.isFinite(value) || value < 0) ||
        !['gap', 'black-mark', 'continuous'].includes(roll.media)) {
      return { error: 'Ingresa dimensiones positivas, desplazamientos válidos y un tipo de rollo.' };
    }
    if (roll.printableWidth > roll.width || label.width + roll.offsetX > roll.printableWidth + fitTolerance ||
        label.height + roll.offsetY > roll.height + fitTolerance) {
      return { error: 'La etiqueta y sus desplazamientos superan el área imprimible del rollo.' };
    }
    return { layout: {
      width: roll.width, height: roll.height, marginTop: roll.offsetY, marginRight: 0,
      marginBottom: 0, marginLeft: roll.offsetX, columns: 1, gapX: 0, gapY: 0, capacity: 1
    } };
  }
  if ([page.width, page.height].some(v => !Number.isFinite(v) || v <= 0) ||
      [page.marginLeft, page.marginRight, page.marginTop, page.marginBottom, label.gapX, label.gapY].some(v => !Number.isFinite(v) || v < 0) ||
      [label.columns, label.rows].some(v => !Number.isInteger(v) || v < 1)) {
    return { error: 'Ingresa dimensiones positivas, márgenes y separaciones válidos, y cantidades enteras de filas y columnas.' };
  }
  if (label.columns * label.width + (label.columns - 1) * label.gapX > page.width - page.marginLeft - page.marginRight + fitTolerance) {
    return { error: 'Las columnas y separaciones superan el ancho útil de la hoja. Reduce las columnas, el ancho, la separación o los márgenes.' };
  }
  if (label.rows * label.height + (label.rows - 1) * label.gapY > page.height - page.marginTop - page.marginBottom + fitTolerance) {
    return { error: 'Las filas y separaciones superan el alto útil de la hoja. Reduce las filas, el alto, la separación o los márgenes.' };
  }
  // Historical continuous molds used this same page grid. Thermal output requires an explicit profile.
  return { layout: { ...page, columns: label.columns, gapX: label.gapX, gapY: label.gapY, capacity: label.columns * label.rows } };
}
