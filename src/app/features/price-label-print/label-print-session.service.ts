import { Injectable } from '@angular/core';
import { PriceLabelArticle } from '../../core/models/price-label-template.model';

export interface LabelPrintLine { article: PriceLabelArticle; quantity: number; }
export function expandLabelBatch(lines: readonly LabelPrintLine[]): PriceLabelArticle[] {
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (!lines.length || total > 100 || new Set(lines.map(l => l.article.id)).size !== lines.length ||
      lines.some(l => !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 100))
    throw new Error('El lote debe contener entre 1 y 100 etiquetas, sin artículos duplicados.');
  return lines.flatMap(line => Array.from({ length: line.quantity }, () => line.article));
}
@Injectable()
export class LabelPrintSessionService {
  lines: LabelPrintLine[] = [];
  get total(): number { return this.lines.reduce((sum, l) => sum + l.quantity, 0); }
  add(article: PriceLabelArticle): void {
    if (this.lines.some(l => l.article.id === article.id)) return;
    this.commit([...this.lines, { article, quantity: 1 }]);
  }
  quantity(id: string, quantity: number): void {
    this.commit(this.lines.map(l => l.article.id === id ? { ...l, quantity } : l));
  }
  remove(id: string): void { this.lines = this.lines.filter(l => l.article.id !== id); }
  private commit(lines: LabelPrintLine[]): void { expandLabelBatch(lines); this.lines = lines; }
}
