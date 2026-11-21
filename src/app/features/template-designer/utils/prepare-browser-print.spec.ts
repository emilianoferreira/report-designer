import { prepareBrowserPrint } from './prepare-browser-print';
import { createDefaultTemplate } from '../data/default-template';
import { buildValidationContext } from './fiscal-context';
import { RenderEvidence } from '../services/render-evidence';

describe('Shared browser print preparation', () => {
  let frame: HTMLIFrameElement;
  beforeEach(() => { frame = document.createElement('iframe'); document.body.append(frame); });
  afterEach(() => frame.remove());
  const context = () => buildValidationContext(undefined, { invoice: {}, company: {}, invoiceLines: [], fiscal: { schemaVersion: '1.0', isCfe: true, cfeType: 111 } });
  const evidence = (): RenderEvidence => ({ version: '1.0', elements: [], diagnostics: [] });
  it('returns pending resource evidence instead of a confirmed violation or an exception', async () => {
    const doc = frame.contentDocument!;
    doc.body.innerHTML = '<div class="page"><img /></div>';
    spyOn(doc.images[0], 'decode').and.returnValue(Promise.reject(new Error('image')));
    const prepared = await prepareBrowserPrint(doc, createDefaultTemplate(), context(), evidence(), () => true);
    expect(prepared?.resourcesReady).toBeFalse();
    expect(prepared?.report.results.some(r => r.ruleId === 'TEC-OVERLAP' && r.status === 'fail')).toBeFalse();
  });
  it('does not publish or paginate a stale document after resource resolution', async () => {
    const doc = frame.contentDocument!;
    doc.body.innerHTML = '<div class="page"><img /></div>';
    let resolve!: () => void;
    spyOn(doc.images[0], 'decode').and.returnValue(new Promise<void>(done => { resolve = done; }));
    let current = true;
    const pending = prepareBrowserPrint(doc, createDefaultTemplate(), context(), evidence(), () => current);
    current = false; resolve();
    expect(await pending).toBeUndefined();
    expect(doc.querySelector('[data-render-page]')).toBeNull();
  });
  it('bounds resource waiting and keeps timeout results pending', async () => {
    const doc = frame.contentDocument!;
    doc.body.innerHTML = '<div class="page"><img /></div>';
    spyOn(doc.images[0], 'decode').and.returnValue(new Promise<void>(() => {}));
    const observations = evidence();
    const prepared = await prepareBrowserPrint(doc, createDefaultTemplate(), context(), observations, () => true, 1);
    expect(prepared?.resourcesReady).toBeFalse();
    expect(observations.diagnostics.some(d => d.code === 'resource-error')).toBeTrue();
  });
});
