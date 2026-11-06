import { LabelElement } from '../../../core/models/price-label-template.model';
import { mmToPx } from '../../template-designer/utils/coordinate-utils';

/** Physical appearance shared by the editor and printable HTML. Undefined zoom means print units. */
export function labelPresentation(element: LabelElement, zoom?: number): Record<string, string> {
  const style = element.style || {};
  const css: Record<string, string> = {};
  const mm = (value: number) => zoom === undefined ? value + 'mm' : mmToPx(value) * zoom + 'px';
  const font = style.font;
  if (font) {
    css['font-family'] = font.family + ', sans-serif';
    css['font-size'] = zoom === undefined ? font.size + 'pt' : font.size * (96 / 72) * zoom + 'px';
    css['font-weight'] = font.weight;
    css['font-style'] = font.style;
    css['color'] = font.color;
  }
  if (style.textAlign) css['text-align'] = style.textAlign;
  if (style.backgroundColor) css['background-color'] = style.backgroundColor;
  if (style.borderColor && style.borderWidth) css['border'] = mm(style.borderWidth) + ' ' + (style.borderStyle || 'solid') + ' ' + style.borderColor;
  if (style.borderRadius) css['border-radius'] = mm(style.borderRadius);
  if (style.verticalAlign) {
    css['display'] = 'flex';
    css['align-items'] = style.verticalAlign === 'middle' ? 'center' : style.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start';
    if (style.textAlign === 'center') css['justify-content'] = 'center';
    if (style.textAlign === 'right') css['justify-content'] = 'flex-end';
  }
  return css;
}
