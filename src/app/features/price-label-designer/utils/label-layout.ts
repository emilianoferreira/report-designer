import { LabelTemplate } from '../../../core/models/price-label-template.model';

export function labelLayoutError(template: LabelTemplate): string {
  if (!template?.page || !template?.label || !Array.isArray(template.elements)) return 'Plantilla incompleta.';
  const { page, label } = template;
  if ([page.width, page.height, label.width, label.height].some(v => !Number.isFinite(v) || v <= 0) ||
      [page.marginLeft, page.marginRight, page.marginTop, page.marginBottom, label.gapX, label.gapY].some(v => !Number.isFinite(v) || v < 0) ||
      [label.columns, label.rows].some(v => !Number.isInteger(v) || v < 1)) {
    return 'Ingresa dimensiones positivas, márgenes y separaciones válidos, y cantidades enteras de filas y columnas.';
  }
  if (label.columns * label.width + (label.columns - 1) * label.gapX > page.width - page.marginLeft - page.marginRight + 0.001) {
    return 'Las columnas y separaciones superan el ancho útil de la hoja. Reduce las columnas, el ancho, la separación o los márgenes.';
  }
  if (label.rows * label.height + (label.rows - 1) * label.gapY > page.height - page.marginTop - page.marginBottom + 0.001) {
    return 'Las filas y separaciones superan el alto útil de la hoja. Reduce las filas, el alto, la separación o los márgenes.';
  }
  return '';
}
