import { CFE_TYPES, FiscalRole, FISCAL_ROLE_LABELS, ValidationContext } from '../../../core/models/fiscal.model';
import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { RenderEvidence } from '../services/render-evidence';
import { fiscalFieldFact, printedCurrencyCode } from './fiscal-field-evidence';
import { supportsFiscalBrowserRules } from './fiscal-context';
import { comparePrintedAmount } from './amount-fiscal-rules';
import { observePrintedFields, PrintedFieldObservation } from './printed-field-observations';
import { CFE_FORMAT_SOURCE } from './fiscal-rule-catalogue';
import { RuleResult } from './static-fiscal-rules';

const known = (context: ValidationContext, path: string): unknown => {
  const fact = fiscalFieldFact(context, path); return fact.state === 'known' ? fact.value : undefined;
};
const normalize = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
type ReferenceField = 'cfeType' | 'series' | 'number' | 'reason' | 'date' | 'amount' | 'currency' | 'documentDescription';
const roles: Record<ReferenceField, FiscalRole> = { cfeType: 'reference.type', series: 'reference.series', number: 'reference.number',
  reason: 'reference.reason', date: 'reference.date', amount: 'reference.amount', currency: 'reference.currency', documentDescription: 'reference.description' };
// Formato CFE 25.2, zona F. These input combinations cannot establish a printed obligation.
const globalExcluded = ['cfeType', 'cfeTypeName', 'series', 'number', 'date', 'amount', 'currency', 'exchangeRate'];
const remitoExcluded = ['amount', 'currency', 'exchangeRate'];
export interface ReferenceRequirement {
  index: number;
  mode: 'individual' | 'global' | 'pending';
  dataPending: boolean;
  fields: Array<{ field: ReferenceField; path: string; role: FiscalRole; obligation: 'required' | 'provided' | 'optional' | 'not-applicable' | 'pending' }>;
}
export interface ReferenceRequirements {
  needed: 'required' | 'pending';
  collectionKnown: boolean;
  complete: boolean;
  count?: number;
  rows: ReferenceRequirement[];
  diagnostics: string[];
}

/** Source diagnostics are separate from printed violations. No external existence or XML validation. */
export function referenceRequirements(context: ValidationContext): ReferenceRequirements {
  const references = known(context, 'references'), list = Array.isArray(references) ? references : undefined;
  const type = known(context, 'cfeType'), lines = known(context, 'lines');
  const needed = [102, 103, 112, 113].includes(type as number) || known(context, 'ownCollection') === true ||
    (Array.isArray(lines) && lines.some(line => (type === 181 && line.billingIndicator === 8) || (type === 182 && line.billingIndicator === 9)));
  const result: ReferenceRequirements = { needed: needed ? 'required' : 'pending', collectionKnown: !!list,
    complete: known(context, 'referencesComplete') === true && !!list, count: list?.length, rows: [], diagnostics: [] };
  if (!list) result.diagnostics.push('La colección está ausente, mal formada o es contradictoria; no se reconstruye desde el texto.');
  else {
    if (needed && !list.length) result.diagnostics.push('El origen aporta una lista vacía en una operación que requiere referencias; no prueba omisión del molde.');
    if (list.length > 40) result.diagnostics.push('El origen aporta más de 40 referencias. Es un diagnóstico de datos: no se sustituye por referencia global ni se cuenta cada repetición de impresión.');
  }
  if (!result.complete) result.diagnostics.push('El origen no declara una colección completa e inequívoca; no se certifica cobertura de todas las referencias.');
  const indexes = new Set(list?.map((_, index) => index) ?? []);
  for (const path of Object.keys(context.fieldFacts ?? {})) {
    const match = /^references\.(\d+)\./.exec(path); if (match) indexes.add(Number(match[1]));
  }
  const ids = new Map<string, number>(), identities = new Set<string>();
  for (const index of indexes) {
    const id = known(context, `references.${index}.id`);
    if (typeof id === 'string') ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const root = `references.${index}`, global = known(context, root + '.global');
    const mode = global === true ? 'global' : global === false ? 'individual' : 'pending';
    const id = known(context, root + '.id'), code = known(context, root + '.cfeType'), typeName = known(context, root + '.cfeTypeName');
    let dataPending = mode === 'pending' || (typeof id === 'string' && ids.get(id)! > 1);
    const supplied = (field: string) => Object.prototype.hasOwnProperty.call(context.fieldFacts ?? {}, root + '.' + field);
    if (mode === 'global' && globalExcluded.some(supplied)) {
      dataPending = true; result.diagnostics.push(`Referencia ${index + 1}: el origen combina la modalidad global con campos de una referencia individual.`);
    }
    if (type === 181 && remitoExcluded.some(supplied)) {
      result.diagnostics.push(`Referencia ${index + 1}: revisar los campos monetarios del origen para e-Remito (zona F).`);
    }
    const amount = known(context, root + '.amount');
    if (typeof amount === 'string' && amount.startsWith('-')) {
      result.diagnostics.push(`Referencia ${index + 1}: el origen declara un monto negativo en F.8.`);
    }
    const label = CFE_TYPES.find(type => type.value === code)?.label;
    if (typeof typeName === 'string' && label && normalize(typeName) !== normalize(label)) {
      dataPending = true; result.diagnostics.push(`Referencia ${index + 1}: el nombre suministrado contradice el código de tipo.`);
    }
    const series = known(context, root + '.series'), number = known(context, root + '.number');
    if (mode === 'individual' && typeof code === 'number' && typeof series === 'string' && typeof number === 'string') {
      const key = JSON.stringify([code, normalize(series), /^\d+$/.test(number) ? number.replace(/^0+(?=\d)/, '') : normalize(number)]);
      if (identities.has(key)) result.diagnostics.push(`Referencia ${index + 1}: identificación repetida en el origen; requiere revisión, no se elimina ni se fusiona.`);
      identities.add(key);
    }
    if (typeof id === 'string' && ids.get(id)! > 1) result.diagnostics.push(`Referencia ${index + 1}: identificador de origen duplicado; asociación pendiente.`);
    if (mode === 'pending' || (mode === 'global' && known(context, root + '.reason') === undefined) ||
        (mode === 'individual' && [code, series, number].some(value => value === undefined))) {
      result.diagnostics.push(`Referencia ${index + 1}: faltan datos para verificar la modalidad y su identificación o razón.`);
    }
    result.rows.push({ index, mode, dataPending, fields: (Object.keys(roles) as ReferenceField[]).map(field => {
      const path = root + '.' + field;
      let obligation: ReferenceRequirement['fields'][number]['obligation'] = 'pending';
      if ((mode === 'global' && globalExcluded.includes(field)) || (type === 181 && remitoExcluded.includes(field))) obligation = 'not-applicable';
      else if ((mode === 'global' && field === 'reason') || (mode === 'individual' && ['cfeType', 'series', 'number'].includes(field))) obligation = 'required';
      else if (mode !== 'pending') obligation = known(context, path) === undefined ? 'optional' : 'provided';
      return { field, path, role: roles[field], obligation };
    }) });
  }
  return result;
}

function compareReferenceField(context: ValidationContext, index: number, field: ReferenceField, observation: PrintedFieldObservation): boolean | undefined {
  const expected = known(context, `references.${index}.${field}`), printed = observation.node.textContent?.trim() ?? '';
  if (field === 'cfeType') {
    const label = CFE_TYPES.find(type => type.value === expected)?.label;
    if (!label) return undefined; // Preserve unsupported and contingency codes without guessing labels.
    if (normalize(printed) === normalize(label)) return true;
    // Numeric code alone does not prove omission of a valid textual label elsewhere.
    return CFE_TYPES.some(type => normalize(type.label) === normalize(printed)) ? false : undefined;
  }
  if (typeof expected !== 'string') return undefined;
  if (field === 'amount') return expected.startsWith('-') ? undefined : comparePrintedAmount(expected, printed, observation.field);
  if (field === 'currency') return printedCurrencyCode(expected) && printedCurrencyCode(printed) ? normalize(expected) === normalize(printed) : undefined;
  if (field === 'date') {
    const day = expected.slice(0, 10), format = observation.field.dateFormat;
    const compareDay = (actual: string) => actual === day ? true : expected.length === 10 ? false : undefined;
    if (observation.field.presentation === 'raw' && /^\d{4}-\d{2}-\d{2}$/.test(printed)) return compareDay(printed);
    if (format === 'yyyy-MM-dd' && /^\d{4}-\d{2}-\d{2}$/.test(printed)) return compareDay(printed);
    if (format === 'dd/MM/yyyy' && /^\d{2}\/\d{2}\/\d{4}$/.test(printed)) return compareDay(printed.split('/').reverse().join('-'));
    return undefined;
  }
  if (field === 'number' && /^\d+$/.test(expected) && /^\d+$/.test(printed))
    return expected.replace(/^0+(?=\d)/, '') === printed.replace(/^0+(?=\d)/, '');
  return normalize(expected) === normalize(printed);
}

export function evaluateReferencePrint(context: ValidationContext, doc: Document | undefined, evidence: RenderEvidence,
  layout: LayoutEvidence | undefined, paginationPending?: string): RuleResult[] {
  const plan = referenceRequirements(context), results: RuleResult[] = [];
  const applicable = supportsFiscalBrowserRules(context);
  const add = (ruleId: string, identity: string, title: string, status: RuleResult['status'], message: string,
    category: RuleResult['category'] = 'normative', page?: number, contents: LayoutContent[] = []) => results.push({
      id: ruleId, ruleId, findingId: `${ruleId}:${identity}:page:${page ?? 'document'}`, title, status, message, category,
      fieldPath: identity.match(/^references\.\d+(?:\.[A-Za-z]+)?/)?.[0],
      severity: status === 'fail' ? 'error' : 'info', output: 'browser', page, source: category === 'normative' ? CFE_FORMAT_SOURCE : '',
      reference: 'Zona F y representación impresa: referencias', evidenceIds: contents.map(c => c.instanceId),
      elements: contents.flatMap(c => c.elementId && ['header', 'detail', 'footer'].includes(c.section ?? '') ? [{ id: c.elementId, section: c.section as 'header' | 'detail' | 'footer' }] : []),
      action: 'Revisar cada referencia y su origen; no fusionar documentos ni completar identificaciones por inferencia.' });
  add('REF-NEED', 'need', 'Obligatoriedad de referencias', 'pending', plan.needed === 'required' ?
    'La operación requiere referencias. Se verifica cada instancia; el origen incompleto no demuestra una omisión impresa.' : 'Las demás obligaciones dependen de la operación; no se declaran opcionales por no ser una nota.');
  add('REF-COLLECTION', 'collection', 'Cobertura de la colección de referencias', applicable && plan.complete && !plan.diagnostics.length ? 'pass' : 'pending',
    plan.diagnostics.join(' ') || `El origen declara ${plan.count} referencias completas; esta declaración no certifica existencia, XML ni impresión integral.`, 'technical');
  const printed = applicable ? observePrintedFields(doc, evidence, layout, paginationPending) : [];
  for (const row of plan.rows) {
    const passed = new Map<ReferenceField, PrintedFieldObservation[]>();
    for (const field of row.fields) {
      const matches = printed.filter(observation => observation.entry.roles.includes(field.role) &&
        (observation.field.fiscalPath === field.path || (field.field === 'cfeType' &&
          observation.field.fiscalPath === `references.${row.index}.cfeTypeName` && typeof known(context, `references.${row.index}.cfeTypeName`) === 'string')));
      if (!applicable || row.dataPending || field.obligation === 'not-applicable' || !matches.length) {
        const notApplicable = applicable && !row.dataPending && (field.obligation === 'not-applicable' ||
          (field.obligation === 'optional' && plan.complete && !matches.length));
        add('REF-FIELD', field.path, FISCAL_ROLE_LABELS[field.role], notApplicable ? 'not-applicable' : 'pending',
          `Referencia ${row.index + 1}: ${row.dataPending ? 'modo o datos contradictorios/desconocidos.' : notApplicable ?
            'campo excluido para este tipo o modalidad, u opcional no informado en la colección completa del origen.' : 'Falta dato o asociación visible inequívoca; no demuestra omisión.'}`); continue;
      }
      for (const observation of matches) {
        const comparison = compareReferenceField(context, row.index, field.field, observation);
        const canFail = comparison === false && layout?.pending.length === 0 &&
          (observation.field.presentation === 'raw' || (field.field === 'amount' && !!observation.field.numericFormat) ||
            (field.field === 'date' && !!observation.field.dateFormat));
        const status = comparison === true ? 'pass' : canFail ? 'fail' : 'pending';
        add('REF-FIELD', field.path + ':' + observation.entry.instanceId, FISCAL_ROLE_LABELS[field.role], status,
          `Referencia ${row.index + 1}: ` + (status === 'pass' ? 'el campo visible coincide con su propia instancia de origen.' : status === 'fail' ?
            'el campo explícito imprime un valor distinto de su propia referencia de origen.' : 'valor, formato o suficiencia no verificables.'), 'normative', observation.page, observation.content);
        if (status === 'pass') passed.set(field.field, [...(passed.get(field.field) ?? []), observation]);
        if (field.field === 'amount' && observation.field.numericFormat?.prefix === 'US$ ' && observation.node.textContent?.trim().startsWith('US$ ')) {
          const currency = printedCurrencyCode(known(context, `references.${row.index}.currency`));
          add('REF-CURRENCY', field.path + ':' + observation.entry.instanceId, 'Moneda del importe referenciado',
            currency && comparison !== undefined && !layout?.pending.length ? currency === 'USD' ? 'pass' : 'fail' : 'pending',
            'US$ identifica USD en este formato; se compara con la moneda de la referencia, nunca con la del comprobante actual.', 'normative', observation.page, observation.content);
        }
      }
    }
    let grouped = false;
    if (!row.dataPending && row.mode === 'global' && passed.get('reason')?.length) {
      for (const observation of passed.get('reason')!) add('REF-ASSOCIATION', `references.${row.index}:${observation.entry.instanceId}`, 'Razón de referencia global', 'pass',
        'Razón global íntegra y asociada a su instancia. No acredita que sea legalmente imposible identificar los documentos.', 'normative', observation.page, observation.content);
      grouped = true;
    } else if (!row.dataPending && row.mode === 'individual') {
      for (const page of new Set((passed.get('cfeType') ?? []).map(observation => observation.page))) {
        const identity = (['cfeType', 'series', 'number'] as const).map(field => (passed.get(field) ?? []).filter(observation => observation.page === page));
        if (identity.some(candidates => candidates.length !== 1)) continue;
        const contents = identity.flatMap(candidates => candidates[0].content), boxes = contents.map(c => c.bounds);
        const top = Math.max(...boxes.map(b => b.y)), bottom = Math.min(...boxes.map(b => b.y + b.height));
        const left = Math.min(...boxes.map(b => b.x)), right = Math.max(...boxes.map(b => b.x + b.width));
        const own = new Set(printed.filter(observation => observation.page === page &&
          observation.field.fiscalPath?.startsWith(`references.${row.index}.`)).flatMap(observation => observation.content.map(c => c.instanceId)));
        const foreign = layout?.content.some(c => c.page === page && c.kind === 'text' && c.roles.some(role => role.startsWith('reference.')) && !own.has(c.instanceId) &&
          c.bounds.y < bottom && c.bounds.y + c.bounds.height > top && c.bounds.x < right && c.bounds.x + c.bounds.width > left);
        if (bottom <= top || foreign) continue;
        add('REF-ASSOCIATION', `references.${row.index}`, 'Identificación de referencia individual', 'pass',
          'Tipo en palabras, serie y número coinciden con la misma instancia y se identifican en un renglón sin otras referencias intercaladas. Campos adicionales mantienen sus propios resultados.', 'normative', page, contents);
        grouped = true;
      }
    }
    if (!grouped) add('REF-ASSOCIATION', `references.${row.index}`, 'Asociación de la referencia', 'pending',
      'No se certifica asociación visual completa. Se admiten composiciones distintas y referencias repartidas en páginas; no se rechazan por su disposición.');
  }
  add('REF-COVERAGE', 'coverage', 'Alcance de la validación de referencias', 'pending',
    'Existencia y aceptación en DGI, elegibilidad global, documentos sin codificación, omisiones sin cobertura completa y otras composiciones requieren evidencia adicional.');
  return results;
}
