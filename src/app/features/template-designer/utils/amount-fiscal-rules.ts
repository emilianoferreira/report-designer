import { FiscalRole, FISCAL_ROLE_LABELS, ValidationContext } from '../../../core/models/fiscal.model';
import { LayoutContent, LayoutEvidence } from '../../../core/models/layout-evidence.model';
import { RenderEvidence } from '../services/render-evidence';
import { fiscalFieldFact, printedCurrencyCode, printedDecimalMatches, FieldEvidence } from './fiscal-field-evidence';
import { supportsFiscalBrowserRules } from './fiscal-context';
import { RuleResult } from './static-fiscal-rules';
import { observePrintedFields } from './printed-field-observations';
import { CFE_FORMAT_SOURCE } from './fiscal-rule-catalogue';

export interface AmountRequirement {
  path: string;
  role: FiscalRole;
  applicability: 'required' | 'optional' | 'pending' | 'not-applicable';
  reason: string;
  negativeIndicator?: boolean;
  vat?: boolean;
  text?: boolean;
  signPending?: boolean;
}
const known = (context: ValidationContext, path: string): unknown => {
  const fact = fiscalFieldFact(context, path); return fact.state === 'known' ? fact.value : undefined;
};
const decimalEqual = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' &&
  printedDecimalMatches(a, b, { decimalSeparator: '.' }) === true;
const normalize = (text: string) => text.normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();

/** Representation obligations only. No sums, rate multiplication, base calculation or reconciliation. */
export function amountRequirements(context: ValidationContext): AmountRequirement[] {
  const type = known(context, 'cfeType'), sales = [101, 102, 103, 111, 112, 113].includes(type as number);
  const result: AmountRequirement[] = [];
  const add = (path: string, role: FiscalRole, applicability: AmountRequirement['applicability'], reason: string,
    extra: Partial<AmountRequirement> = {}) => result.push({ path, role, applicability, reason, ...extra });
  add('currency', 'totals.currency', sales || type === 182 ? 'required' : 'pending', 'Moneda de los importes; no se deduce de un símbolo.', { text: true });
  for (const [path, role] of [['totalAmount', 'totals.amount'], ['totalPayable', 'totals.payable']] as const)
    add(path, role, sales ? 'required' : 'not-applicable', 'Total del comprobante y total a pagar conservan significados distintos.');
  for (const [path, role] of [['nonBillableAmount', 'totals.non-billable'], ['retainedAmount', 'totals.withholdings'], ['fiscalCreditAmount', 'totals.fiscal-credit']] as const) {
    const applicable = path === 'fiscalCreditAmount' ? type === 182 : path === 'retainedAmount' ? sales || type === 182 : sales;
    add(path, role, !applicable ? 'not-applicable' : known(context, path) !== undefined ? 'required' : 'pending', 'Importe informado cuando corresponde; cero no equivale a ausencia.');
  }
  const indexes = (collection: string) => {
    const rows = known(context, collection);
    const indexes = new Set(Array.isArray(rows) ? rows.map((_, index) => index) : []);
    for (const path of Object.keys(context.fieldFacts ?? {})) {
      const match = new RegExp('^' + collection.replace(/\./g, '\\.') + '\\.(\\d+)\\.').exec(path);
      if (match) indexes.add(Number(match[1]));
    }
    return [...indexes].sort((a, b) => a - b);
  };
  const taxes = (collection: string) => {
    for (const index of indexes(collection)) {
      const root = `${collection}.${index}`, kind = known(context, root + '.kind'), vat = kind === 'vat';
      const applicability = !sales && type !== 182 ? 'not-applicable' : kind === undefined ? 'pending' :
        vat && type === 182 ? 'pending' : vat && [101, 102, 103].includes(type as number) ? 'optional' : 'required';
      add(root + '.name', 'tax.name', applicability, 'Identificación del tributo por instancia.', { text: true, vat });
      add(root + '.amount', vat ? 'totals.tax' : 'tax.amount', applicability, 'Importe por tributo; no valida su cálculo.', { vat });
      add(root + '.taxableAmount', vat ? 'totals.net' : 'tax.taxable-amount', 'pending', 'Base informada según tributo; no se recalcula.', { vat });
      add(root + '.rate', 'tax.rate', 'pending', 'Tasa informada según tributo; no se aplica al cálculo.', { vat });
    }
  };
  for (const index of indexes('lines')) {
    const root = `lines.${index}`, operationPath = root + '.operationType';
    const operation = Object.prototype.hasOwnProperty.call(context.fieldFacts ?? {}, operationPath)
      ? known(context, operationPath) : known(context, 'operationType');
    for (const [field, role] of [['quantity', 'detail.quantity'], ['unitPrice', 'detail.unit-price'], ['amount', 'detail.amount'],
      ['discountAmount', 'detail.discount'], ['surchargeAmount', 'detail.surcharge']] as const) {
      let applicability: AmountRequirement['applicability'] = type === 182 ? 'not-applicable' : 'pending';
      if (sales) applicability = field === 'quantity' || field === 'unitPrice' ? operation === 'goods' ? 'required' : operation === 'services' ? 'optional' : 'pending' : 'required';
      if (sales && (field === 'discountAmount' || field === 'surchargeAmount') && known(context, root + '.' + field) === undefined) applicability = 'pending';
      if (type === 181 && field === 'quantity' && operation === 'goods') applicability = 'required';
      add(root + '.' + field, role, applicability, 'Campo del ítem; servicios y operaciones mixtas se resuelven por línea.',
        { negativeIndicator: field === 'amount' && known(context, root + '.billingIndicator') === 7,
          signPending: field === 'amount' && ![1, 2, 3, 4, 5, 6, 7].includes(known(context, root + '.billingIndicator') as number) });
    }
    taxes(root + '.taxes');
  }
  for (const index of indexes('adjustments')) {
    const root = `adjustments.${index}`;
    add(root + '.description', 'adjustments.description', sales ? 'required' : 'pending', 'Concepto informado del ajuste global.', { text: true });
    add(root + '.amount', 'adjustments.amount', sales && known(context, root + '.kind') !== undefined ? 'required' : 'pending',
      'Ajuste global identificado: descuento/recargo no implica por sí solo un signo negativo. Indicadores especiales requieren revisión.',
      { signPending: Object.prototype.hasOwnProperty.call(context.fieldFacts ?? {}, root + '.billingIndicator') });
  }
  taxes('taxes');
  return result;
}

/** Format interpretation is deliberately narrower than a general number parser. */
export function comparePrintedAmount(expected: string, printed: string, field: FieldEvidence): boolean | undefined {
  if (field.association !== 'whole') return undefined;
  if (field.presentation === 'raw') return printedDecimalMatches(expected, printed.trim(), { decimalSeparator: '.' });
  const format = field.numericFormat;
  if (!format || !Number.isInteger(format.fractionDigits) || format.fractionDigits < 0 || format.fractionDigits > 20 ||
      expected.replace(/[-.]/g, '').replace(/^0+/, '').length > 15) return undefined;
  if (!printed.startsWith(format.prefix)) return undefined;
  const number = printed.slice(format.prefix.length);
  // Avoid certifying a renderer rounding decision or loss of decimal precision.
  return printedDecimalMatches(expected, number, format);
}

export function evaluateAmountPrint(context: ValidationContext, doc: Document | undefined, evidence: RenderEvidence,
  layout: LayoutEvidence | undefined, paginationPending?: string): RuleResult[] {
  const requirements = amountRequirements(context), results: RuleResult[] = [];
  const applicable = supportsFiscalBrowserRules(context);
  const add = (ruleId: string, path: string, role: FiscalRole, status: RuleResult['status'], message: string,
    page?: number, content: LayoutContent[] = []) => results.push({ id: ruleId, ruleId, findingId: `${ruleId}:${path}:page:${page ?? 'document'}`,
      page, fieldPath: ruleId === 'AMT-COVERAGE' ? undefined : path.split(':')[0], title: ruleId === 'AMT-COVERAGE' ? 'Cobertura de importes, moneda y signos' : FISCAL_ROLE_LABELS[role], status, message, severity: status === 'fail' ? 'error' : 'info', output: 'browser',
      category: 'normative', reference: 'Representación impresa, cuerpo: importes, moneda y signos', source: CFE_FORMAT_SOURCE,
      evidenceIds: content.map(c => c.instanceId), elements: content.flatMap(c => c.elementId && ['header', 'detail', 'footer'].includes(c.section ?? '') ?
        [{ id: c.elementId, section: c.section as 'header' | 'detail' | 'footer' }] : []),
      action: 'Revisar origen, significado y formato del campo; no calcular ni completar valores por inferencia.' });
  const printedFields = applicable ? observePrintedFields(doc, evidence, layout, paginationPending) : [];
  for (const requirement of requirements) {
    const expectedValue = known(context, requirement.path);
    let expected = typeof expectedValue === 'string' ? expectedValue : undefined;
    if (requirement.negativeIndicator && expected && !expected.startsWith('-') && !decimalEqual(expected, '0')) expected = '-' + expected;
    const candidates = printedFields.filter(({ entry, field }) => {
        const path = field.fiscalPath;
        const unifiedTotal = (requirement.path === 'totalAmount' || requirement.path === 'totalPayable') &&
          (path === 'totalAmount' || path === 'totalPayable') && decimalEqual(known(context, 'totalAmount'), known(context, 'totalPayable'));
        return (entry.roles.includes(requirement.role) || (unifiedTotal && entry.roles.some(role => ['totals.amount', 'totals.payable'].includes(role)))) &&
          (path === requirement.path || unifiedTotal);
    });
    const directPages = new Set(candidates.filter(o => o.field.fiscalPath === requirement.path).map(o => o.page));
    const observations = candidates.filter(o => o.field.fiscalPath === requirement.path || !directPages.has(o.page));
    if (!observations.length || !applicable || expected === undefined || requirement.applicability === 'pending') {
      add('AMT-FIELD', requirement.path, requirement.role,
        applicable && requirement.applicability === 'not-applicable' ? 'not-applicable' : 'pending',
        requirement.reason + ' Falta dato o asociación visible inequívoca; no demuestra omisión impresa.'); continue;
    }
    for (const observation of observations) {
      const field = observation.entry.fields![0], printed = observation.node.textContent?.trim() ?? '';
      let comparison = requirement.text ? normalize(expected) === normalize(printed) : comparePrintedAmount(expected, printed, field);
      // A discount/charge may use an accounting sign as a label convention. Without a verified
      // sign contract, an equal magnitude with the opposite sign is not a confirmed violation.
      if (!requirement.text && comparison === false && /^(adjustments\.|lines\.\d+\.(discountAmount|surchargeAmount)$)/.test(requirement.path) &&
          comparePrintedAmount(expected.startsWith('-') ? expected.slice(1) : '-' + expected, printed, field) === true) comparison = undefined;
      if (requirement.signPending) comparison = undefined;
      if (requirement.path === 'currency' && (!printedCurrencyCode(expected) || !printedCurrencyCode(printed))) comparison = undefined;
      // An equal total may satisfy the other role. A wrong amount is attributed only to its own binding.
      const direct = field.fiscalPath === requirement.path;
      if (!direct && comparison === false) comparison = undefined;
      // An optional field, when actually printed, still needs to match its explicitly bound source.
      const canFail = comparison === false && layout?.pending.length === 0 && requirement.applicability !== 'not-applicable' &&
        (field.presentation === 'raw' || (!requirement.text && !!field.numericFormat));
      add('AMT-FIELD', requirement.path + ':' + observation.entry.instanceId, requirement.role,
        requirement.applicability === 'not-applicable' ? 'not-applicable' : comparison === true ? 'pass' : canFail ? 'fail' : 'pending',
        comparison === true ? 'Valor y signo visibles coinciden con el campo de origen; no verifica aritmética fiscal.' :
          canFail ? 'El campo explícito imprime un valor, moneda o signo diferente del origen o del indicador conocido.' :
            'No se confirma correspondencia: formato, precisión, signo condicionado o alcance pendiente.', observation.page, observation.content);
      if (direct && requirement.applicability !== 'not-applicable' && !requirement.text && !['detail.quantity', 'tax.rate'].includes(requirement.role) && field.numericFormat?.prefix === 'US$ ' && printed.startsWith('US$ ')) {
        const currency = printedCurrencyCode(known(context, 'currency'));
        add('AMT-CURRENCY', requirement.path + ':' + observation.entry.instanceId, 'totals.currency',
          currency && comparison !== undefined && layout?.pending.length === 0 ? currency === 'USD' ? 'pass' : 'fail' : 'pending',
          'El prefijo US$ del formato identifica USD; un símbolo $ aislado no identifica la moneda.', observation.page, observation.content);
      }
      const regime = known(context, 'issuerRegime');
      if (requirement.applicability !== 'not-applicable' && requirement.vat && requirement.text && !observation.entry.roles.includes('footer.iva-legend') && ['vat-minimum', 'monotributo', 'monotributo-mides'].includes(String(regime)))
        add('AMT-VAT-MENTION', requirement.path + ':' + observation.entry.instanceId, requirement.role,
          comparison === true && /^IVA(?:\s+(?:B[ÁA]SIC[AO]|M[ÍI]NIM[AO]|\d+(?:[.,]\d+)?\s*%))*$/.test(normalize(printed)) &&
            !context.diagnostics.some(d => d.kind === 'profile-mismatch' && d.field === 'issuerRegime') && layout?.pending.length === 0 ? 'fail' : 'pending',
          'Las menciones de IVA en el cuerpo están restringidas para el régimen; no se interpreta un número aislado como una mención.', observation.page, observation.content);
    }
  }
  add('AMT-COVERAGE', 'coverage', 'totals.amount', 'pending', 'Sin cálculo de impuestos ni conciliación. Omisiones sin cobertura completa, agrupaciones y signos de ajustes especiales requieren revisión.');
  return results;
}
