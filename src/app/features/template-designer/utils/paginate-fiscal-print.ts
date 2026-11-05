import { ReportTemplate } from '../../../core/models/template.model';
import { mmToPx } from './coordinate-utils';

export interface PrintPagination {
  pages: number;
  pending?: string;
}

/** Split the resolved detail table after resource loading. The original document
 * stays intact until the complete sequence of sheets fits. */
export function paginateFiscalPrint(doc: Document, template: ReportTemplate): PrintPagination {
  if (template.page.dynamicHeight || template.compliance?.medium === 'roll') return { pages: 1 };
  const page = doc.querySelector<HTMLElement>('body > .page');
  const header = page?.querySelector<HTMLElement>('.section-header');
  const detail = page?.querySelector<HTMLElement>('.section-detail');
  const footer = page?.querySelector<HTMLElement>('.section-footer');
  if (!page || !header || !detail || !footer) return { pages: 1 };
  const table = detail.querySelector<HTMLTableElement>('.detail-table');
  const rows = Array.from(table?.tBodies[0]?.rows ?? []);
  const height = mmToPx(template.page.height);
  const limit = template.sections.detail.maxRowsPerPage;
  const rowLimit = Number.isSafeInteger(limit) && limit! > 0 ? limit! : Infinity;
  if (page.getBoundingClientRect().height <= height + 0.05 && rows.length <= rowLimit) return { pages: 1 };
  const pending = (message: string): PrintPagination => ({ pages: 1, pending: message });
  if (!table || !rows.length || template.sections.pageHeader || template.sections.pageFooter ||
      template.sections.detail.groupHeader || template.sections.detail.groupFooter || template.sections.detail.groupBy) {
    return pending('La estructura del molde requiere revisar los saltos de hoja.');
  }
  if (!Number.isFinite(height) || height <= 0) return pending('La altura de hoja no está definida.');

  const detailShell = detail.cloneNode(true) as HTMLElement;
  detailShell.style.minHeight = '0';
  detailShell.querySelector('tbody')!.replaceChildren();
  const totals = detailShell.querySelector('.subtotals-block');
  totals?.remove();
  // Freeze the resolved column widths so each sheet measures the same way.
  const columns = doc.createElement('colgroup');
  for (const cell of Array.from(rows[0].cells)) {
    const column = doc.createElement('col');
    column.style.width = cell.getBoundingClientRect().width + 'px';
    columns.append(column);
  }
  const shellTable = detailShell.querySelector('table')!;
  shellTable.style.tableLayout = 'fixed';
  shellTable.prepend(columns);

  const continuationFooter = footer.cloneNode(false) as HTMLElement;
  const seals = Array.from(footer.querySelectorAll<HTMLElement>('[data-render-element]'))
    .filter(element => element.querySelector('svg[data-qr-modules]') && element.getBoundingClientRect().height > 0);
  const sealTop = seals.length ? Math.min(...seals.map(seal => seal.offsetTop)) : 0;
  let sealHeight = 0;
  for (const seal of seals) {
    const copy = seal.cloneNode(true) as HTMLElement;
    const top = seal.offsetTop - sealTop;
    copy.style.top = top + 'px';
    sealHeight = Math.max(sealHeight, top + seal.getBoundingClientRect().height);
    continuationFooter.append(copy);
  }
  continuationFooter.style.minHeight = sealHeight + 'px';

  const sheets: HTMLElement[] = [];
  let draft: HTMLElement | undefined;
  const build = (start: number, end: number, last: boolean) => {
    draft?.remove();
    const sheet = page.cloneNode(false) as HTMLElement;
    sheet.style.minHeight = '0';
    const body = detailShell.cloneNode(true) as HTMLElement;
    const tbody = body.querySelector('tbody')!;
    for (let i = start; i < end; i++) tbody.append(rows[i].cloneNode(true));
    if (last && totals) body.append(totals.cloneNode(true));
    const number = doc.createElement('div');
    number.dataset['renderPageLabel'] = '';
    number.style.cssText = 'text-align:right;font-size:12pt;line-height:1.4';
    number.textContent = 'Página 1 de 1';
    sheet.append(header.cloneNode(true), body, (last ? footer : continuationFooter).cloneNode(true), number);
    page.after(sheet);
    draft = sheet;
    return sheet;
  };
  const fits = (sheet: HTMLElement) => {
    const box = sheet.getBoundingClientRect();
    if (box.height > height + 0.05) return false;
    return Array.from(sheet.querySelectorAll('[data-render-element], [data-render-generated]')).every(element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return true;
      return rect.top >= box.top - 0.05 && rect.bottom <= box.bottom + 0.05 &&
        rect.left >= box.left - 0.05 && rect.right <= box.right + 0.05;
    });
  };
  const fail = () => {
    draft?.remove();
    return pending('Una fila o una sección fija no cabe en la hoja. Ajustá el tamaño o el diseño.');
  };
  for (let start = 0; start < rows.length;) {
    if (rows.length - start <= rowLimit && fits(build(start, rows.length, true))) {
      sheets.push(draft!);
      break;
    }
    let low = start + 1;
    let high = Math.min(rows.length - 1, start + rowLimit);
    let end = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(build(start, middle, false))) {
        end = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    if (end === start) return fail();
    const accepted = build(start, end, false);
    accepted.remove();
    draft = undefined;
    sheets.push(accepted);
    start = end;
  }
  draft?.remove();
  for (const [index, sheet] of sheets.entries()) {
    sheet.dataset['renderPage'] = String(index + 1);
    sheet.querySelector('[data-render-page-label]')!.textContent =
      sheets.length > 1 ? `Página ${index + 1} de ${sheets.length}` : '';
    sheet.style.height = template.page.height + 'mm';
    if (index < sheets.length - 1) sheet.style.breakAfter = 'page';
  }
  page.replaceWith(...sheets);
  return { pages: sheets.length };
}
