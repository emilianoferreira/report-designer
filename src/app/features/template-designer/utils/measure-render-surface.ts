/** CSS pixels in the unscaled print document. Keep fixed sheets and roll content visible. */
export function measureRenderSurface(doc: Document, nominalHeight: number, dynamicHeight: boolean): number {
  const pages = Array.from(doc.querySelectorAll<HTMLElement>('body > .page'));
  if (!pages.length) return nominalHeight;
  const first = pages[0].getBoundingClientRect();
  const last = pages[pages.length - 1].getBoundingClientRect();
  return Math.max(dynamicHeight ? 0 : nominalHeight * pages.length, last.bottom - first.top);
}
