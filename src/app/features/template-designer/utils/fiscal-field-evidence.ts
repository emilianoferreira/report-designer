import { FiscalFact, ValidationContext } from '../../../core/models/fiscal.model';

export interface FieldEvidence {
  sourcePath: string;
  /** Only an explicit fiscal binding establishes a canonical field; never row position alone. */
  fiscalPath?: string;
  instance?: { collectionPath: string; index: number };
  association: 'whole' | 'composite';
  presentation?: 'raw' | 'formatted';
  /** Actual renderer format, not a fiscal currency inferred from a symbol. */
  numericFormat?: { decimalSeparator: '.' | ','; groupingSeparator?: '.' | ',' | ' '; fractionDigits: number; prefix: string };
  dateFormat?: 'yyyy-MM-dd' | 'dd/MM/yyyy';
}

export function describeFieldEvidence(paths: readonly string[]): FieldEvidence[] {
  return paths.map(sourcePath => {
    const match = /^(.*)\.(\d+)\.[^.]/.exec(sourcePath);
    return { sourcePath, ...(sourcePath.startsWith('fiscal.') ? { fiscalPath: sourcePath.slice(7) } : {}),
      ...(match ? { instance: { collectionPath: match[1], index: Number(match[2]) } } : {}),
      association: paths.length > 1 ? 'composite' : 'whole' };
  });
}

/** Never fuse different rows, invent missing values or use a profile as a fact. */
export function fiscalFieldFact(context: ValidationContext, path: string): FiscalFact<unknown> {
  if (Object.prototype.hasOwnProperty.call(context.facts, path)) return context.facts[path as keyof typeof context.facts];
  if (context.fieldFacts && Object.prototype.hasOwnProperty.call(context.fieldFacts, path)) {
    const collection = context.facts[path.split('.')[0] as keyof typeof context.facts];
    if (path.includes('.') && collection?.state === 'conflict') return { state: 'conflict', candidates: [] };
    return context.fieldFacts[path];
  }
  return { state: 'unknown', candidates: [] };
}

export interface FieldCoverage {
  fiscalPath: string;
  /** Complete means all relevant output is interpreted, not merely that a role was found. */
  state: 'partial' | 'complete' | 'unsupported';
  evidenceIds: string[];
  reason: string;
}

/** Explicit codes in Formato CFE 25.2, table D (including UI and UR).
 * An unlisted currency needs review; this subset does not establish legal validity by date. */
const printedCurrencies = new Set(['ARS', 'BRL', 'CAD', 'CLP', 'CNY', 'COP', 'EUR', 'JPY',
  'MXN', 'PYG', 'PEN', 'USD', 'UYU', 'VEF', 'UYI', 'UYR']);
export function printedCurrencyCode(value: unknown): string | undefined {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return printedCurrencies.has(code) ? code : undefined;
}

/** Exact comparison of source decimals and an explicitly known presentation format.
 * No Number coercion, rounding, tax calculation, locale guessing or implied currency. */
export function printedDecimalMatches(source: string, printed: string,
  format: { decimalSeparator: '.' | ','; groupingSeparator?: '.' | ',' | ' '; fractionDigits?: number }): boolean | undefined {
  const normalize = (value: string): string | undefined => {
    if (!/^-?\d+(\.\d+)?$/.test(value)) return undefined;
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    const magnitude = whole.replace(/^0+(?=\d)/, '') + (fraction.replace(/0+$/, '') ? '.' + fraction.replace(/0+$/, '') : '');
    return negative && magnitude !== '0' ? '-' + magnitude : magnitude;
  };
  if (format.groupingSeparator === format.decimalSeparator) return undefined;
  if (format.fractionDigits !== undefined && (!Number.isSafeInteger(format.fractionDigits) || format.fractionDigits < 0 ||
      (source.split('.')[1]?.replace(/0+$/, '').length ?? 0) > format.fractionDigits)) return undefined;
  const value = printed.trim();
  const parts = value.split(format.decimalSeparator);
  if (parts.length > 2 || (parts.length === 2 && !/^\d+$/.test(parts[1]))) return undefined;
  let whole = parts[0];
  if (format.groupingSeparator && whole.includes(format.groupingSeparator)) {
    const groups = whole.replace(/^-/, '').split(format.groupingSeparator);
    if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some(group => !/^\d{3}$/.test(group))) return undefined;
    whole = whole.split(format.groupingSeparator).join('');
  }
  if (!/^-?\d+$/.test(whole)) return undefined;
  if (format.fractionDigits !== undefined && (parts[1]?.length ?? 0) !== format.fractionDigits) return undefined;
  const expected = normalize(source), actual = normalize(whole + (parts.length === 2 ? '.' + parts[1] : ''));
  return expected === undefined || actual === undefined ? undefined : expected === actual;
}
