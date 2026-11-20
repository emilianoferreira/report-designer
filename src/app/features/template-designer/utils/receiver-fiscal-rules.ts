import { FiscalFact, FiscalField, FiscalRole, FISCAL_ROLE_LABELS, ValidationContext } from '../../../core/models/fiscal.model';
import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { RenderEvidence } from '../services/render-evidence';
import { RuleResult } from './static-fiscal-rules';
import { detectContentConflicts } from '../../../shared/utils/content-overlap';
import { mmToPx } from './coordinate-utils';
import { supportsFiscalBrowserRules } from './fiscal-context';
import { hasPlainPrintedText } from './printed-field-observations';

const source = 'https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012';
const value = <T>(fact: FiscalFact<T> | undefined): T | undefined => fact?.state === 'known' ? fact.value : undefined;
const normalize = (text: string) => text.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleUpperCase('es-UY');
export interface ReceiverRequirement {
  role: FiscalRole;
  field?: FiscalField;
  expected?: string;
  applicability: 'required' | 'optional' | 'pending' | 'not-applicable';
  reason: string;
}
export interface ReceiverRequirements {
  fields: ReceiverRequirement[];
  threshold: { status: 'pass' | 'pending' | 'not-applicable'; exceeded?: boolean; reason: string };
  secrecy: boolean | undefined;
}

/** Compare an already supplied net amount with a legal threshold. No tax/base calculation,
 * exchange conversion, system-date lookup, absolute-value guess or floating-point arithmetic. */
export function receiverThreshold(context: ValidationContext): ReceiverRequirements['threshold'] {
  const f = context.facts, date = value(f.issueDate)?.slice(0, 10);
  const net = value(f.netAmount), ui = value(f.uiValue);
  const pending = (reason: string): ReceiverRequirements['threshold'] => ({ status: 'pending', reason });
  const ticket = [101, 102, 103].includes(value(f.cfeType) ?? 0);
  if (!date || date < (ticket ? '2012-05-08' : '2014-08-22')) return pending('Fecha desconocida o período histórico fuera de la versión de umbrales cubierta.');
  if (value(f.currency) !== 'UYU') return pending('El umbral requiere neto en UYU; no se convierten monedas.');
  if (!net || !ui || !/^\d+(\.\d+)?$/.test(net) || !/^\d+(\.\d+)?$/.test(ui) ||
      ui.replace(/[.0]/g, '') === '') return pending('Faltan neto no negativo y cotización UI positiva inequívocos.');
  const previousYear = String(Number(date.slice(0, 4)) - 1) + '-12-31';
  if (value(f.uiValueDate)?.slice(0, 10) !== previousYear || !value(f.uiValueSource))
    return pending('Falta cotización UI del cierre del año civil anterior con procedencia explícita.');
  // Bounds prevent pathological inputs; normal fiscal decimals need far fewer digits.
  if (net.length > 100 || ui.length > 100) return pending('Precisión del dato fuera del alcance del comparador.');
  const scale = Math.max(net.split('.')[1]?.length ?? 0, ui.split('.')[1]?.length ?? 0);
  const scaled = (decimal: string) => {
    const [whole, fraction = ''] = decimal.split('.');
    return BigInt(whole + fraction.padEnd(scale, '0'));
  };
  const limit = date >= '2022-11-01' ? 5000n : 10000n;
  const exceeded = scaled(net) > scaled(ui) * limit;
  return { status: 'pass', exceeded, reason: `Comparación estricta con ${limit} UI del cierre anterior: ${exceeded ? 'supera' : 'no supera'} el umbral. No verifica el cálculo del neto ni la autenticidad de la cotización.` };
}

/** Applicability only; field roles and declared profile never supply missing fiscal facts. */
export function receiverRequirements(context: ValidationContext): ReceiverRequirements {
  const f = context.facts;
  const fields: ReceiverRequirement[] = [
    { role: 'recipient.name', field: 'receiverName' }, { role: 'recipient.document', field: 'receiverDocumentNumber' },
    { role: 'recipient.address', field: 'receiverAddress' }, { role: 'recipient.country', field: 'receiverCountry' },
    { role: 'recipient.document-type', field: 'receiverDocumentType' }, { role: 'recipient.label' }
  ].map(row => ({ ...row, role: row.role as FiscalRole, field: row.field as FiscalField | undefined,
    applicability: 'pending', reason: 'Falta contexto inequívoco del receptor.' }));
  const result: ReceiverRequirements = { fields, threshold: { status: 'pending', reason: 'Falta resolver la operación.' }, secrecy: value(f.professionalSecrecy) };
  const type = value(f.cfeType);
  if (!supportsFiscalBrowserRules(context)) return result;
  const set = (roles: FiscalRole[], applicability: ReceiverRequirement['applicability'], reason: string, expected?: string) => {
    for (const row of fields.filter(field => roles.includes(field.role))) Object.assign(row, { applicability, reason,
      expected: expected ?? (row.field ? value<unknown>(f[row.field]) : undefined) });
  };
  if (value(f.receiverSectorException) !== false) {
    fields.forEach(row => row.reason = 'Excepción sectorial aplicable o desconocida: requiere revisión particular.');
    return result;
  }
  const consumer = value(f.finalConsumer), exporting = value(f.exportOperation), foreign = value(f.receiverNonResidentWithoutRut);
  const docType = value(f.receiverDocumentType);
  if (consumer === true && ['RUC', 'RUT'].includes(normalize(docType ?? ''))) {
    fields.forEach(row => row.reason = 'Consumo final con receptor identificado por RUC: revisar el régimen particular de la operación.');
    return result;
  }
  if ([111, 112, 113].includes(type!) && consumer === true) {
    fields.forEach(row => row.reason = 'Tipo e-Factura y condición consumo final contradictorios: revisar origen.'); return result;
  }
  if ((consumer === false && foreign === true) || (foreign === true && ['RUC', 'RUT'].includes(normalize(docType ?? '')))) {
    fields.forEach(row => row.reason = 'Condiciones del receptor contradictorias; no se selecciona una excepción.'); return result;
  }
  const required = (roles: FiscalRole[], reason: string) => set(roles, 'required', reason);
  const optional = (roles: FiscalRole[], reason: string) => set(roles, 'optional', reason);
  if (consumer === false && ['RUC', 'RUT'].includes(normalize(docType ?? '')) && foreign === false) {
    required(['recipient.name', 'recipient.document', 'recipient.address'], 'Operación con contribuyente identificado por RUC (14º.8–10).');
    set(['recipient.label'], 'required', 'Rótulo de identificación del contribuyente.', 'RUC COMPRADOR');
    optional(['recipient.country', 'recipient.document-type'], 'No constituyen obligación universal adicional en 14º.8–10.');
    result.threshold = { status: 'not-applicable', reason: 'La identificación por RUC no depende del umbral.' };
  } else if (exporting === true && consumer === true) {
    required(['recipient.name', 'recipient.address'], 'Exportación: identificación mediante nombre y domicilio (14º, excepción a).');
    optional(['recipient.label', 'recipient.document', 'recipient.country', 'recipient.document-type'], 'Excepción de exportación a los ordinales 11 y 12.');
    result.threshold = { status: 'not-applicable', reason: 'La excepción de exportación sustituye los ordinales 11 y 12.' };
  } else if (type === 182 && (value(f.receiverIsIndividual) === true || foreign === true) && value(f.hasWithholdingsOrPerceptions) === true) {
    required(['recipient.name', 'recipient.document'], 'e-Resguardo a persona física o entidad exterior: nombre e identificación (14º, excepción b).');
    optional(['recipient.address', 'recipient.label', 'recipient.country', 'recipient.document-type'], 'Excepción específica del retenido; no extenderla a créditos fiscales.');
    result.threshold = { status: 'not-applicable', reason: 'Identificación del retenido independiente del importe.' };
  } else if (consumer === true && exporting === false && (type !== 182 || (value(f.receiverIsIndividual) === false && foreign === false))) {
    if (foreign === undefined) return result;
    if (foreign === true && value(f.receiverIsIndividual) !== false) return result;
    if (foreign) {
      required(['recipient.name', 'recipient.address'], 'Entidad no residente sin RUT: nombre y domicilio al omitir rótulo.');
      optional(['recipient.label'], 'Entidad no residente sin RUT: puede omitirse CONSUMO FINAL.');
    } else {
      set(['recipient.label'], 'required', 'Restante operación sin excepción (14º.11).', 'CONSUMO FINAL');
      optional(['recipient.name', 'recipient.address'], 'Nombre y domicilio no son universales en consumo final.');
    }
    result.threshold = receiverThreshold(context);
    if (value(f.hasWithholdingsOrPerceptions) === true || result.threshold.exceeded === true)
      required(['recipient.document', 'recipient.country'], 'Documento y país por retenciones/percepciones o umbral superado (14º.12).');
    else if (value(f.hasWithholdingsOrPerceptions) === false && result.threshold.exceeded === false)
      optional(['recipient.document', 'recipient.country'], 'No supera umbral y no documenta retenciones/percepciones.');
    optional(['recipient.document-type'], 'El tipo no es obligación universal de impresión del ordinal 12; no se infiere su codificación.');
  }
  // An unknown secrecy condition may change where identity is printed. Do not confirm omissions.
  if (result.secrecy === undefined) fields.forEach(row => { row.applicability = 'pending'; row.reason = 'Se desconoce si la identificación está amparada en secreto profesional.'; });
  return result;
}

export function evaluateReceiverPrint(context: ValidationContext, doc: Document | undefined,
  evidence: RenderEvidence, layout: LayoutEvidence | undefined, paginationPending?: string): RuleResult[] {
  const requirements = receiverRequirements(context), results: RuleResult[] = [];
  const add = (id: string, status: RuleResult['status'], message: string, page?: number, contents: LayoutContent[] = [], instance?: string) => {
    const elements = contents.flatMap(c => c.elementId && ['header', 'detail', 'footer'].includes(c.section ?? '') ?
      [{ id: c.elementId, section: c.section as 'header' | 'detail' | 'footer' }] : []);
    const titles: Record<string, string> = { 'REC-THRESHOLD': 'Umbral de identificación del receptor', 'REC-BOX': 'Recuadro del receptor',
      'REC-SECRECY': 'Identificación amparada en secreto profesional', 'REC-CHARACTERS': 'Altura de caracteres del receptor' };
    results.push({ id, ruleId: id, findingId: `${id}${instance ? ':' + instance : ''}:page:${page ?? 'document'}`, page, status,
      fieldPath: requirements.fields.find(field => id === 'REC-FIELD.' + field.role.slice(10))?.field,
      title: titles[id] ?? FISCAL_ROLE_LABELS[('recipient.' + id.slice('REC-FIELD.'.length)) as FiscalRole] ?? id, message, severity: status === 'fail' ? 'error' : 'info',
      category: 'normative', source, reference: '14º, Identificación del receptor y excepciones', output: 'browser',
      evidenceIds: contents.map(c => c.instanceId), elements, action: 'Revisar datos del receptor y su representación; no completar por inferencia.' });
  };
  add('REC-THRESHOLD', requirements.threshold.status, requirements.threshold.reason);
  const conflicts = layout ? detectContentConflicts(layout) : [];
  const pages = Array.from(doc?.querySelectorAll('body > .page') ?? []);
  for (let index = 0; index < Math.max(pages.length, 1); index++) {
    const page = index + 1, root = pages[index];
    const safe = (c: LayoutContent) => c.page === page && c.certainty === 'measured' && !c.clipped &&
      c.ink.length > 0 && !conflicts.some(conflict => conflict.page === page && conflict.contentIds.includes(c.instanceId));
    const nodes = Array.from(root?.querySelectorAll('[data-render-element], [data-render-content]') ?? []);
    const cache = new Map<LayoutContent, Element | undefined>();
    const nodeFor = (c: LayoutContent) => {
      if (cache.has(c)) return cache.get(c);
      const matches = nodes.filter(node => c.elementId ? node.getAttribute('data-render-element') === c.elementId :
        evidence.content?.some(entry => entry.instanceId === node.getAttribute('data-render-content') && c.instanceId.startsWith(`page:${page}:${entry.instanceId}:`)));
      const node = matches.length === 1 ? matches[0] : undefined;
      cache.set(c, node); return node;
    };
    const safeText = (c: LayoutContent) => safe(c) && c.kind === 'text' && !!nodeFor(c) && hasPlainPrintedText(nodeFor(c)!) &&
      layout!.content.filter(other => other.page === page && other.kind === 'text' && nodeFor(other) === nodeFor(c)).every(safe);
    const candidatesFor = (requirement: ReceiverRequirement) => layout?.content.filter(c => c.roles.includes(requirement.role) &&
      safeText(c) && !c.sourcePaths.some(path => path.startsWith('fiscal.') && path !== 'fiscal.' + requirement.field)) ?? [];
    for (const requirement of requirements.fields) {
      const id = 'REC-FIELD.' + requirement.role.slice(10);
      if (requirement.applicability !== 'required') {
        add(id, requirement.applicability === 'pending' ? 'pending' : 'not-applicable', requirement.reason, page); continue;
      }
      if (!doc || !layout?.ready || !root || paginationPending || requirement.expected === undefined) {
        add(id, 'pending', requirement.reason + ' Falta dato o salida verificable.', page); continue;
      }
      const candidates = candidatesFor(requirement);
      if (!candidates.length) add(id, 'pending', requirement.reason + ' Falta una correspondencia inequívoca entre campo y valor visible.', page);
      for (const node of new Set(candidates.map(c => nodeFor(c)!))) {
        const elementId = node.getAttribute('data-render-element');
        const entries = evidence.content?.filter(entry => elementId ? entry.elementId === elementId :
          entry.instanceId === node.getAttribute('data-render-content')) ?? [];
        const entry = entries[0];
        const bound = candidates.filter(c => nodeFor(c) === node);
        const printed = normalize(node.textContent ?? '');
        const expected = normalize(requirement.expected);
        if (printed === expected && entries.length === 1 && entry.emitted) {
          add(id, 'pass', requirement.reason + ' Valor visible coincidente con el origen.', page, bound, entry.instanceId);
          continue;
        }
        const explicit = !!requirement.field && entries.length === 1 && entry.emitted && entry.fields?.length === 1 &&
          entry.fields[0].fiscalPath === requirement.field && entry.fields[0].association === 'whole' && entry.fields[0].presentation === 'raw';
        const punctuationOnly = requirement.field === 'receiverDocumentNumber' &&
          printed.replace(/[.\s-]/g, '') === expected.replace(/[.\s-]/g, '');
        const countryAlias = requirement.field === 'receiverCountry' && !(/^[A-Z]{2}$/.test(printed) && /^[A-Z]{2}$/.test(expected));
        const confirmed = explicit && printed && !/[*•…]/.test(printed) && !punctuationOnly && !countryAlias &&
          !layout.pending.length && requirements.secrecy === false;
        add(id, confirmed ? 'fail' : 'pending', confirmed ? 'El campo fiscal explícito del receptor imprime un valor diferente del origen conocido.' :
          requirement.reason + ' La evidencia disponible no permite confirmar la correspondencia.', page, bound, entry?.instanceId);
      }
    }
    const labelRequirement = requirements.fields.find(field => field.role === 'recipient.label')!;
    const labels = candidatesFor(labelRequirement).filter(c =>
      labelRequirement.expected && normalize(nodeFor(c)?.textContent ?? '') === normalize(labelRequirement.expected));
    const label = labels.length === 1 ? labels[0] : undefined;
    const documentRequirement = requirements.fields.find(field => field.role === 'recipient.document')!;
    const documents = candidatesFor(documentRequirement).filter(c =>
      documentRequirement.expected && normalize(nodeFor(c)?.textContent ?? '') === normalize(documentRequirement.expected));
    const documentContent = documents.length === 1 ? documents[0] : undefined;
    const inside = (inner: LayoutContent, outer: LayoutContent) => inner.bounds.x >= outer.bounds.x && inner.bounds.y >= outer.bounds.y &&
      inner.bounds.x + inner.bounds.width <= outer.bounds.x + outer.bounds.width && inner.bounds.y + inner.bounds.height <= outer.bounds.y + outer.bounds.height;
    const boxes = layout?.content.filter(c => {
      if (!safe(c) || c.kind !== 'decoration' || !label || !inside(label, c)) return false;
      if (labelRequirement.expected === 'RUC COMPRADOR' && (!documentContent || !inside(documentContent, c) ||
          documentContent.bounds.y < label.bounds.y + label.bounds.height)) return false;
      const node = nodeFor(c), style = node && doc?.defaultView?.getComputedStyle(node);
      return style && ['Top', 'Right', 'Bottom', 'Left'].every(edge =>
        style.getPropertyValue('border-' + edge.toLowerCase() + '-style') === 'solid' &&
        parseFloat(style.getPropertyValue('border-' + edge.toLowerCase() + '-width')) > 0 &&
        /^rgb\(/.test(style.getPropertyValue('border-' + edge.toLowerCase() + '-color'))) &&
        parseFloat(style.borderRadius || '0') === 0;
    }) ?? [];
    if (!paginationPending && layout?.ready && requirements.secrecy === false && labelRequirement.applicability === 'required' && boxes.length === 1 &&
        boxes[0].roles.includes('recipient.boundary') && !layout.pending.length) {
      const box = boxes[0], fits = box.bounds.width + 0.05 >= mmToPx(40) && box.bounds.height + 0.05 >= mmToPx(10);
      add('REC-BOX', fits ? 'pass' : 'fail', fits ? 'Recuadro rectangular medido de al menos 40 × 10 mm con contenido asociado; altura física de caracteres pendiente.' :
        'El único recuadro rectangular explícito que contiene la identificación mide menos de 40 × 10 mm.', page, [box, label!, ...(documentContent ? [documentContent] : [])]);
    } else add('REC-BOX', 'pending', 'Falta recuadro rectangular medible y asociación inequívoca; el rol no acredita dimensiones ni caracteres.', page);
    add('REC-CHARACTERS', 'pending', 'La altura física de caracteres de identificación no se deduce del tamaño de fuente CSS.', page);
    if (requirements.secrecy === true) add('REC-SECRECY', 'pending', 'La identificación puede estar en cabecera o trasladarse a adenda. Falta certificar su delimitación y prioridad.', page);
  }
  return results;
}
