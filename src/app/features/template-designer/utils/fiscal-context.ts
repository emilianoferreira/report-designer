import {
  CFE_TYPES, FiscalContextDiagnostic, FiscalData, FiscalFacts, FiscalField, FiscalProfile,
  FiscalSource, FISCAL_REGIMES, FISCAL_ROLE_LABELS, PrintSupport, ReceiverPrintRole, ValidationContext
} from '../../../core/models/fiscal.model';
import { InvoiceData } from '../../../core/models/template.model';

type Parser = (value: unknown) => unknown;
/** Scope shared by the matrix and the browser rules. An absent historical profile is supported. */
export function supportsFiscalBrowserRules(context: ValidationContext): boolean {
  const { profile, facts, diagnostics } = context;
  const cfeType = facts.cfeType;
  return facts.isCfe.state === 'known' && facts.isCfe.value &&
    cfeType.state === 'known' && CFE_TYPES.some(type => type.value === cfeType.value) &&
    (!profile || (profile.schemaVersion === '1.0' && profile.output === 'browser' && profile.jurisdiction === 'UY')) &&
    !diagnostics.some(d => d.kind === 'unsupported-version' || (d.kind === 'profile-mismatch' && d.field === 'cfeType'));
}
const text: Parser = value => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const boolean: Parser = value => typeof value === 'boolean' ? value : undefined;
const integer: Parser = value => typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
const oneOf = (values: readonly string[]): Parser => value => values.includes(value as string) ? value : undefined;
const decimal: Parser = value => {
  if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value.trim())) return undefined;
  const [whole, fraction = ''] = value.trim().replace(/^-/, '').split('.');
  const normalized = whole.replace(/^0+(?=\d)/, '') + (fraction.replace(/0+$/, '') ? '.' + fraction.replace(/0+$/, '') : '');
  return (value.trim().startsWith('-') && normalized !== '0' ? '-' : '') + normalized;
};
const date: Parser = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) return undefined;
  const day = value.slice(0, 10);
  const parsed = new Date(day + 'T00:00:00Z');
  return Number.isFinite(Date.parse(value)) && Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day ? value : undefined;
};
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const absent = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim());
/** Validate shapes only, never whether a fiscal field is legally required. */
const collectionFields = new Map<Parser, Record<string, Parser>>();
const list = (fields: Record<string, Parser>): Parser => {
 const parse: Parser = value => {
  if (!Array.isArray(value)) return undefined;
  const result: Record<string, unknown>[] = [];
  for (const row of value) {
    if (!object(row)) return undefined;
    const normalized: Record<string, unknown> = {};
    for (const [key, parser] of Object.entries(fields)) {
      if (absent(row[key])) continue;
      const parsed = parser(row[key]);
      if (parsed === undefined) return undefined;
      normalized[key] = parsed;
    }
    result.push(normalized);
  }
  return result;
 };
 collectionFields.set(parse, fields);
 return parse;
};
const taxes = list({ kind: oneOf(['vat', 'withholding', 'perception', 'other']), code: text, name: text, rate: decimal, taxableAmount: decimal, amount: decimal });
const parsers: Record<FiscalField, Parser> = {
  isCfe: boolean, cfeType: integer,
  issuerRegime: oneOf(FISCAL_REGIMES.map(r => r.value)), operationType: oneOf(['goods', 'services', 'mixed']),
  exemptionLegalReference: text, partialExemption: boolean, professionalSecrecy: boolean,
  ownCollection: boolean, thirdPartyCollection: boolean, sector: text,
  issuerRut: text, issuerName: text, issuerTradeName: text, issuerAddress: text,
  receiverDocumentType: text, receiverDocumentNumber: text, receiverCountry: text,
  receiverName: text, receiverAddress: text, finalConsumer: boolean,
  exportOperation: boolean, receiverNonResidentWithoutRut: boolean, receiverIsIndividual: boolean,
  receiverSectorException: boolean,
  thirdPartyGoods: boolean, goodsOwnerName: text, goodsOwnerDocument: text,
  series: text, number: text, issueDate: date, signatureDate: date, paymentMethod: oneOf(['cash', 'credit']),
  currency: text, netAmount: decimal, exchangeRate: decimal, exchangeRateDate: date, totalAmount: decimal, totalPayable: decimal,
  nonBillableAmount: decimal, retainedAmount: decimal, fiscalCreditAmount: decimal,
  hasWithholdingsOrPerceptions: boolean, uiValue: decimal, uiValueDate: date, uiValueSource: text,
  securityCode: text, signatureHash: text, qrPayload: text,
  caeNumber: text, caeFrom: text, caeTo: text, caeExpiryDate: date,
  issuerStartDate: date, issuerResolution: text, verificationUrl: text, adenda: text,
  lines: list({ id: text, operationType: oneOf(['goods', 'services', 'mixed']), description: text, quantity: decimal, unitPrice: decimal, amount: decimal,
    billingIndicator: integer, discountAmount: decimal, surchargeAmount: decimal, taxes, mandatoryLegend: text }),
  adjustments: list({ kind: oneOf(['discount', 'surcharge']), description: text, amount: decimal, billingIndicator: integer }),
  taxes,
  referencesComplete: boolean,
  references: list({ id: text, documentDescription: text, global: boolean, cfeType: integer, cfeTypeName: text, series: text, number: text, reason: text,
    date, amount: decimal, currency: text, exchangeRate: decimal })
};

/** Only mappings observed in the existing ERP contract. No guessed CFE codes,
 * no fiscal meaning assigned to Total/Subtotal, no hash reconstructed from CodSeguridad.
 */
const legacyPaths: Partial<Record<FiscalField, string[]>> = {
  isCfe: ['isCFE'], finalConsumer: ['isConsumoFinal'], currency: ['Moneda.ISO4217'],
  issuerRut: ['invoice.Empresa.Parametros.EFA_Emisor_RUT', 'company.RUT'],
  issuerName: ['invoice.Empresa.Parametros.EFA_Emisor_Nombre', 'company.Nombre'],
  issuerTradeName: ['invoice.Empresa.Parametros.EFA_Emisor_NComercial', 'company.NombreComercial'],
  issuerAddress: ['invoice.Empresa.Parametros.EFA_Emisor_Direccion'],
  series: ['invoice.Numero.Serie'], number: ['invoice.Numero.Numero'], issueDate: ['invoice.Fecha'],
  securityCode: ['CFE.CodSeguridad'], adenda: ['CFE.Adenda'],
  caeNumber: ['invoice.Numero.CAEIdentificador'], caeFrom: ['invoice.Numero.CAEDesde'],
  caeTo: ['invoice.Numero.CAEHasta'], caeExpiryDate: ['invoice.Numero.CAEFechaVto']
};
function readPath(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => object(current) ? current[key] : undefined, data);
}

/** Pure, non-mutating normalization. Profile is an expectation, not a fallback source.
 * Conflicts retain every candidate and deliberately expose no selected value.
 * Diagnostics describe input problems, not normative findings or print restrictions.
 */
function readPrintSupport(input: unknown): PrintSupport | undefined {
  if (!object(input)) return undefined;
  if (input['kind'] === 'blank' && Object.keys(input).length === 1) return { kind: 'blank' };
  if (input['kind'] !== 'preprinted' || !Array.isArray(input['pages']) || !input['pages'].length) return undefined;
  const pages: Extract<PrintSupport, { kind: 'preprinted' }>['pages'][number][] = [];
  const seen = new Set<number>();
  for (const entry of input['pages']) {
    if (!object(entry)) return undefined;
    const page = entry['page'], roles = entry['roles'];
    if (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || seen.has(page) ||
        !Array.isArray(roles) || !roles.every(role => typeof role === 'string' && role.startsWith('recipient.') &&
          Object.prototype.hasOwnProperty.call(FISCAL_ROLE_LABELS, role))) return undefined;
    seen.add(page);
    pages.push({ page, roles: [...new Set(roles as ReceiverPrintRole[])] });
  }
  return { kind: 'preprinted', pages };
}

export function buildValidationContext(
  profile: FiscalProfile | undefined, data: InvoiceData, scenario?: FiscalData
): ValidationContext {
  const diagnostics: FiscalContextDiagnostic[] = [];
  const versioned = (input: unknown, path: string): Record<string, unknown> | undefined => {
    if (input === undefined) return undefined;
    if (!object(input) || input['schemaVersion'] !== '1.0') {
      diagnostics.push({ kind: 'unsupported-version', path,
        message: `No se puede interpretar la versión de ${path}.` });
      return undefined;
    }
    return input;
  };
  const invoiceFiscal = versioned(data.fiscal, 'fiscal');
  const scenarioFiscal = versioned(scenario, 'scenario');
  const declared = versioned(profile, 'compliance');
  if (declared && (declared['jurisdiction'] !== 'UY' || declared['output'] !== 'browser')) {
    diagnostics.push({ kind: 'invalid-data', path: 'compliance',
      message: 'El perfil declara una jurisdicción o salida no compatible con este contexto.' });
  }
  const facts = {} as FiscalFacts;
  for (const key of Object.keys(parsers) as FiscalField[]) {
    const candidates: { value: unknown; source: FiscalSource; path: string }[] = [];
    let invalid = false;
    const add = (raw: unknown, source: FiscalSource, path: string) => {
      if (absent(raw)) return;
      // Legacy IDs sometimes arrive as numbers. Do not coerce booleans, dates or amounts.
      const value = parsers[key](source === 'legacy' && parsers[key] === text &&
        typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : raw);
      if (value === undefined) {
        invalid = true;
        diagnostics.push({ kind: 'invalid-data', field: key, path, message: `El dato ${path} tiene un formato no reconocido.` });
      } else candidates.push({ value, source, path });
    };
    add(invoiceFiscal?.[key], 'invoice', `fiscal.${key}`);
    for (const path of legacyPaths[key] ?? []) add(readPath(data, path), 'legacy', path);
    add(scenarioFiscal?.[key], 'scenario', `scenario.${key}`);
    const distinct = new Set(candidates.map(c => JSON.stringify(c.value)));
    const fact = distinct.size > 1 ? { state: 'conflict', candidates } :
      invalid || !candidates.length ? { state: 'unknown', candidates } :
      { state: 'known', value: candidates[0].value, candidates };
    // Assignment is driven by the exhaustive parser map above.
    (facts as unknown as Record<string, unknown>)[key] = fact;
    if (distinct.size > 1) diagnostics.push({ kind: 'conflicting-data', field: key, path: key,
      message: `Las fuentes aportan valores diferentes para ${key}.` });
  }
  for (const key of ['cfeType', 'issuerRegime', 'operationType'] as const) {
    const expected = declared?.[key];
    if (absent(expected)) continue;
    const value = parsers[key](expected);
    if (value === undefined) diagnostics.push({ kind: 'invalid-data', field: key, path: `compliance.${key}`,
      message: `El perfil contiene un valor no reconocido para ${key}.` });
    else if (facts[key].state === 'known' && facts[key].value !== value) diagnostics.push({
      kind: 'profile-mismatch', field: key, path: `compliance.${key}`,
      message: `El dato del comprobante difiere del perfil declarado (${key}).` });
  }
  if (facts.isCfe.state === 'known' && facts.isCfe.value === false &&
      (facts.cfeType.state === 'known' || declared?.['cfeType'] !== undefined)) {
    diagnostics.push({ kind: 'conflicting-data', field: 'isCfe', path: 'isCfe',
      message: 'El origen indica que no es un CFE, pero hay un tipo CFE declarado.' });
  }
  // Independently normalize scalar leaves. Collection validity remains in facts above.
  const fieldFacts: NonNullable<ValidationContext['fieldFacts']> = {};
  const leaves = (parser: Parser, raw: unknown, path: string, source: FiscalSource,
    sourcePath: string, target: Map<string, Array<{ raw: unknown; source: FiscalSource; path: string; parser: Parser }>>) => {
    const fields = collectionFields.get(parser);
    if (fields) {
      if (Array.isArray(raw)) raw.forEach((row, index) => {
        if (object(row)) for (const [key, child] of Object.entries(fields))
          leaves(child, row[key], `${path}.${index}.${key}`, source, `${sourcePath}.${index}.${key}`, target);
      });
    } else if (!absent(raw)) {
      const entries = target.get(path) ?? [];
      entries.push({ raw, source, path: sourcePath, parser }); target.set(path, entries);
    }
  };
  const nested = new Map<string, Array<{ raw: unknown; source: FiscalSource; path: string; parser: Parser }>>();
  for (const [key, parser] of Object.entries(parsers)) {
    fieldFacts[key] = facts[key as FiscalField];
    if (!collectionFields.has(parser)) continue;
    // A malformed collection from one of two sources prevents aligning their rows by index.
    // A single source still contributes its independently valid siblings.
    if (facts[key as FiscalField].state === 'unknown' && !absent(invoiceFiscal?.[key]) && !absent(scenarioFiscal?.[key])) continue;
    leaves(parser, invoiceFiscal?.[key], key, 'invoice', `fiscal.${key}`, nested);
    leaves(parser, scenarioFiscal?.[key], key, 'scenario', `scenario.${key}`, nested);
  }
  for (const [path, entries] of nested) {
    let invalid = false;
    const candidates = entries.flatMap(entry => {
      const value = entry.parser(entry.raw);
      if (value === undefined) { invalid = true; return []; }
      return [{ value, source: entry.source, path: entry.path }];
    });
    const distinct = new Set(candidates.map(candidate => JSON.stringify(candidate.value)));
    fieldFacts[path] = distinct.size > 1 ? { state: 'conflict', candidates } :
      invalid || !candidates.length ? { state: 'unknown', candidates } :
      { state: 'known', value: candidates[0].value, candidates };
  }
  return {
    profile: profile ? structuredClone(profile) : undefined,
    facts, printSupport: readPrintSupport(data.printSupport),
    diagnostics, fieldFacts
  };
}
