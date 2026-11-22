import { LabelPrintSessionService, expandLabelBatch } from './label-print-session.service';
import { SAMPLE_PRICE_LABEL_ARTICLES, SAMPLE_PRICE_LABEL_COMPANY } from '../price-label-designer/data/sample-price-label-data';
import { createDefaultPriceLabelTemplate } from '../price-label-designer/data/default-price-label-template';
import { PriceLabelRendererService } from '../price-label-designer/services/price-label-renderer.service';

describe('Label print batch', () => {
  const [a, b, c] = SAMPLE_PRICE_LABEL_ARTICLES;
  it('preserves selection order and produces eight labels across pages', () => {
    const articles = expandLabelBatch([{article:a,quantity:2},{article:b,quantity:5},{article:c,quantity:1}]);
    expect(articles.map(a => a.id)).toEqual([a.id,a.id,b.id,b.id,b.id,b.id,b.id,c.id]);
    const template = createDefaultPriceLabelTemplate();
    template.label.columns = 2; template.label.rows = 2;
    const html = new PriceLabelRendererService().renderToHtml(template, articles, 1, SAMPLE_PRICE_LABEL_COMPANY);
    expect((html.match(/class="label-cell"/g) || []).length).toBe(8);
    expect((html.match(/class="page"/g) || []).length).toBe(2);
    expect(JSON.stringify(template)).not.toContain('quantity');
  });
  it('accepts 100 but rejects overflow without changing the batch', () => {
    const state = new LabelPrintSessionService(); state.add(a); state.quantity(a.id,100);
    expect(state.total).toBe(100);
    expect(() => state.add(b)).toThrow(); expect(state.lines.length).toBe(1);
    for (const quantity of [0,-1,1.5,NaN,Infinity,101]) {
      expect(() => state.quantity(a.id,quantity)).toThrow(); expect(state.total).toBe(100);
    }
  });
  it('deduplicates selection and retains order when removing', () => {
    const state = new LabelPrintSessionService(); state.add(a); state.add(b); state.add(a); state.add(c);
    state.remove(b.id);
    expect(state.lines.map(l => l.article.id)).toEqual([a.id,c.id]);
    expect(state.total).toBe(2);
    expect(() => expandLabelBatch([])).toThrow();
    expect(() => expandLabelBatch([{article:a,quantity:1},{article:a,quantity:1}])).toThrow();
  });
  it('retains the legacy copies renderer behavior', () => {
    const html = new PriceLabelRendererService().renderToHtml(createDefaultPriceLabelTemplate(), [a,b], 2, SAMPLE_PRICE_LABEL_COMPANY);
    expect((html.match(/class="label-cell"/g) || []).length).toBe(4);
  });
});
