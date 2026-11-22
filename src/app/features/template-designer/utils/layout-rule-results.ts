import { LayoutConflict, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { RuleResult } from './static-fiscal-rules';
import { pxToMm } from './coordinate-utils';

export function layoutRuleResults(layout: LayoutEvidence, conflicts: LayoutConflict[]): RuleResult[] {
  const results: RuleResult[] = conflicts.map(conflict => {
    const id = conflict.kind === 'overlap' ? 'TEC-OVERLAP' : 'TEC-CLIP';
    const elements: RuleResult['elements'] = [];
    for (const contentId of conflict.contentIds) {
      const content = layout.content.find(c => c.instanceId === contentId);
      const section = content?.section;
      if (content?.elementId && (section === 'header' || section === 'detail' || section === 'footer') &&
          !elements.some(e => e.id === content.elementId && e.section === section)) elements.push({ id: content.elementId, section });
    }
    return { id, ruleId: id, findingId: conflict.id, page: conflict.page, status: conflict.status,
      severity: conflict.status === 'fail' ? 'error' : 'warning', category: 'technical', output: 'browser',
      evidenceIds: conflict.contentIds, title: conflict.kind === 'overlap' ? 'Contenido superpuesto' : 'Contenido recortado',
      message: `Página ${conflict.page}, x=${pxToMm(conflict.bounds.x).toFixed(2)} mm, y=${pxToMm(conflict.bounds.y).toFixed(2)} mm. ` +
        (conflict.status === 'fail' ? 'Se detectó afectación de tinta en las primitivas soportadas.' : 'Hay una intersección potencial; la tinta de un recurso o estilo no pudo verificarse.'),
      action: 'Revisar los elementos y los datos de esta página; ajustar el diseño manualmente si corresponde.',
      source: '', reference: 'Inspección técnica de contenido del navegador; no es una regla de ubicación DGI.', elements };
  });
  layout.pending.forEach((message, index) => results.push({ id: 'TEC-LAYOUT', ruleId: 'TEC-LAYOUT', findingId: `layout-pending:${index}`,
    status: 'pending', severity: 'info', category: 'technical', output: 'browser', evidenceIds: [],
    title: 'Cobertura de inspección geométrica', message, action: 'Revisar la evidencia pendiente.', source: '',
    reference: 'Inspección técnica del navegador', elements: [] }));
  return results;
}
