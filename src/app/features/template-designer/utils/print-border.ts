/** An element's own overflow clips its descendants, while ancestor overflow can clip its border. */
export function borderFitsBrowserPage(node: Element, page: Element, view: Window, pageHeight?: number): boolean {
  const rect = node.getBoundingClientRect(), surface = page.getBoundingClientRect();
  const limit = Math.min(surface.bottom, surface.top + (pageHeight ?? surface.height));
  if (rect.width <= 0 || rect.height <= 0 || rect.left < surface.left || rect.top < surface.top ||
      rect.right > surface.right || rect.bottom > limit) return false;
  for (let ancestor = node.parentElement; ancestor && ancestor !== page.parentElement; ancestor = ancestor.parentElement) {
    const css = view.getComputedStyle(ancestor), box = ancestor.getBoundingClientRect();
    const left = box.left + ancestor.clientLeft, top = box.top + ancestor.clientTop;
    if ((css.overflowX !== 'visible' && (rect.left < left || rect.right > left + ancestor.clientWidth)) ||
        (css.overflowY !== 'visible' && (rect.top < top || rect.bottom > top + ancestor.clientHeight))) return false;
  }
  return true;
}
