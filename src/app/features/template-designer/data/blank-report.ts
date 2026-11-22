import { ReportTemplate } from '../../../core/models/template.model';
import { PAPER_PRESETS } from '../utils/coordinate-utils';
import { createDefaultTemplate } from './default-template';

export type ReportStartingPoint = 'example' | 'a4' | 'ticket-80' | 'ticket-58';

export function createReportStartingPoint(start: ReportStartingPoint): ReportTemplate {
  const template = createDefaultTemplate();
  if (start === 'example') return template;

  const paper = PAPER_PRESETS.find(preset => preset.type === start)!;
  return {
    ...template,
    metadata: { ...template.metadata, description: '', tags: [] },
    page: {
      ...template.page, paperType: start, width: paper.width, height: paper.height,
      dynamicHeight: paper.dynamicHeight, margins: { ...paper.defaultMargins }
    },
    sections: {
      header: { ...template.sections.header, height: 24, elements: [] },
      detail: { ...template.sections.detail, height: 0, elements: [], maxRowsPerPage: undefined, showColumnHeaders: true },
      footer: { ...template.sections.footer, height: 12, elements: [] }
    }
  };
}
