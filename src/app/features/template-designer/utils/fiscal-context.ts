import {
  FiscalContextDiagnostic, FiscalData, FiscalFacts, FiscalField, FiscalProfile,
  FiscalSource, FISCAL_REGIMES, ValidationContext
} from '../../../core/models/fiscal.model';
import { InvoiceData } from '../../../core/models/template.model';

type Parser = (value: unknown) => unknown;
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
const list = (fields: Record<string, Parser>): Parser => value => {
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
const taxes = list({ code: text, name: text, rate: decimal, taxableAmount: decimal, amount: decimal });
const parsers: Record<FiscalField, Parser> = {
  isCfe: boolean, cfeType: integer,
  issuerRegime: oneOf(FISCAL_REGIMES.map(r => r.value)), operationType: oneOf(['goods', 'services', 'mixed']),
  exemptionLegalReference: text, partialExemption: boolean, professionalSecrecy: boolean,
  ownCollection: boolean, thirdPartyCollection: boolean, sector: text,
  issuerRut: text, issuerName: text, issuerTradeName: text, issuerAddress: text,
  receiverDocumentType: text, receiverDocumentNumber: text, receiverCountry: text,
  receiverName: text, receiverAddress: text, finalConsumer: boolean,
  series: text, number: text, issueDate: date, signatureDate: date, paymentMethod: oneOf(['cash', 'credit']),
  currency: text, netAmount: decimal, totalAmount: decimal, totalPayable: decimal,
  nonBillableAmount: decimal, retainedAmount: decimal, fiscalCreditAmount: decimal,
  hasWithholdingsOrPerceptions: boolean, uiValue: decimal, uiValueDate: date,
  securityCode: text, signatureHash: text, qrPayload: text,
  caeNumber: text, caeFrom: text, caeTo: text, caeExpiryDate: date,
  issuerStartDate: date, issuerResolution: text, verificationUrl: text, adenda: text,
  lines: list({ id: text, description: text, quantity: decimal, unitPrice: decimal, amount: decimal,
    billingIndicator: integer, discountAmount: decimal, surchargeAmount: decimal, taxes, mandatoryLegend: text }),
  adjustments: list({ kind: oneOf(['discount', 'surcharge']), description: text, amount: decimal, billingIndicator: integer }),
  taxes,
  references: list({ global: boolean, cfeType: integer, series: text, number: text, reason: text,
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
  return {
    profile: profile ? structuredClone(profile) : undefined,
    facts,
    diagnostics
  };
}
