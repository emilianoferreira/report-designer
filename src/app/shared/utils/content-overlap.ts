import { LayoutBox, LayoutConflict, LayoutEvidence } from '../../core/models/layout-evidence.model';

export function intersection(a: LayoutBox, b: LayoutBox): LayoutBox | undefined {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0.05 && height > 0.05 ? { x, y, width, height } : undefined;
}

/** Pure detector: no DOM, template, fiscal or label designer dependencies. */
export function detectContentConflicts(evidence: LayoutEvidence): LayoutConflict[] {
  if (!evidence.ready) return [];
  const results: LayoutConflict[] = [];
  const content = evidence.content;
  for (let i = 0; i < content.length; i++) {
    const a = content[i];
    if (a.clipped && a.kind !== 'decoration') results.push({ id: `clip:${a.instanceId}`, kind: 'clipped',
      status: a.certainty === 'measured' ? 'fail' : 'pending', page: a.page, contentIds: [a.instanceId], bounds: a.bounds });
    for (let j = i + 1; j < content.length; j++) {
      const b = content[j];
      if (a.paintGroup && a.paintGroup === b.paintGroup) continue;
      if (a.page !== b.page || (a.kind === 'decoration' && b.kind === 'decoration')) continue;
      const bounds = intersection(a.bounds, b.bounds);
      if (!bounds) continue;
      // A background behind content is a valid composition, even when opaque.
      if ((a.kind === 'decoration' && a.order < b.order) || (b.kind === 'decoration' && b.order < a.order)) continue;
      const uncertain = a.certainty === 'unsupported' || b.certainty === 'unsupported';
      let area = 0;
      paintedIntersection: for (const inkA of a.ink) for (const inkB of b.ink) {
        const hit = intersection(inkA, inkB);
        if (hit) area += hit.width * hit.height;
        if (area >= 2) break paintedIntersection;
      }
      if (area < 2 && !uncertain) continue;
      results.push({ id: `overlap:${a.instanceId}:${b.instanceId}`, kind: 'overlap',
        status: uncertain ? 'pending' : 'fail', page: a.page, contentIds: [a.instanceId, b.instanceId], bounds });
    }
  }
  return results;
}
