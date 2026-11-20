/** Stage 1 contracts. These declarations are not evidence of DGI compliance. */
export const CFE_TYPES = [
  { value: 101, label: 'e-Ticket' },
  { value: 102, label: 'Nota de crédito de e-Ticket' },
  { value: 103, label: 'Nota de débito de e-Ticket' },
  { value: 111, label: 'e-Factura' },
  { value: 112, label: 'Nota de crédito de e-Factura' },
  { value: 113, label: 'Nota de débito de e-Factura' },
  { value: 181, label: 'e-Remito' },
  { value: 182, label: 'e-Resguardo' }
] as const;

export const FISCAL_REGIMES = [
  { value: 'general', label: 'General' },
  { value: 'exempt', label: 'Contribuyente exonerado' },
  { value: 'vat-minimum', label: 'IVA mínimo' },
  { value: 'monotributo', label: 'Monotributo' },
  { value: 'monotributo-mides', label: 'Monotributo social MIDES' }
] as const;
export type FiscalRegime = typeof FISCAL_REGIMES[number]['value'];
export type FiscalOperation = 'goods' | 'services' | 'mixed';

/** Expectations for a reusable mold, never an individual customer's fiscal data. */
export interface FiscalProfile {
  schemaVersion: '1.0';
  jurisdiction: 'UY';
  output: 'browser';
  cfeType?: number; // Retain unsupported codes; do not silently convert them to an MVP type.
  issuerRegime?: FiscalRegime;
  operationType?: FiscalOperation;
  medium?: 'sheet' | 'roll';
  printingMode?: 'blank-paper' | 'preprinted';
  /** Declared alternative; never evidence that its legal conditions are met. */
  distribution?: 'standard' | 'sequential';
  adendaPlacement?: 'separate-page' | 'after-cfe' | 'within-body';
}

/** Base-10 strings preserve decimal precision. No tax calculations in stage 1. */
export type FiscalDecimal = string;
export interface FiscalAdjustment {
  kind?: 'discount' | 'surcharge';
  description?: string;
  amount?: FiscalDecimal;
  billingIndicator?: number;
}
export interface FiscalTax {
  /** Explicit origin classification; names and rates never infer tax kind. */
  kind?: 'vat' | 'withholding' | 'perception' | 'other';
  code?: string;
  name?: string;
  rate?: FiscalDecimal;
  taxableAmount?: FiscalDecimal;
  amount?: FiscalDecimal;
}
export interface FiscalLine {
  id?: string;
  operationType?: FiscalOperation;
  description?: string;
  quantity?: FiscalDecimal;
  unitPrice?: FiscalDecimal;
  amount?: FiscalDecimal;
  billingIndicator?: number;
  discountAmount?: FiscalDecimal;
  surchargeAmount?: FiscalDecimal;
  taxes?: FiscalTax[];
  mandatoryLegend?: string;
}
export interface FiscalReference {
  id?: string;
  documentDescription?: string;
  global?: boolean;
  cfeType?: number;
  /** Optional supplied display name, checked against the referenced code before use. */
  cfeTypeName?: string;
  series?: string;
  number?: string;
  reason?: string;
  date?: string;
  amount?: FiscalDecimal;
  currency?: string;
  exchangeRate?: FiscalDecimal;
}

/** Optional facts supplied by an invoice adapter or an explicitly declared scenario.
 * Missing, empty and false are different. Empty arrays mean a known empty list;
 * missing arrays mean that the source did not provide that information.
 * Dates are ISO strings supplied by the source, never the current system date.
 */
export interface FiscalData {
  schemaVersion: '1.0';
  isCfe?: boolean;
  cfeType?: number;
  issuerRegime?: FiscalRegime;
  operationType?: FiscalOperation;
  exemptionLegalReference?: string;
  partialExemption?: boolean;
  professionalSecrecy?: boolean;
  ownCollection?: boolean;
  thirdPartyCollection?: boolean;
  sector?: string;
  issuerRut?: string;
  issuerName?: string;
  issuerTradeName?: string;
  issuerAddress?: string;
  receiverDocumentType?: string;
  receiverDocumentNumber?: string;
  receiverCountry?: string;
  receiverName?: string;
  receiverAddress?: string;
  finalConsumer?: boolean;
  /** Explicit operation facts, never inferred from country, text or CFE type. */
  exportOperation?: boolean;
  receiverNonResidentWithoutRut?: boolean;
  receiverIsIndividual?: boolean;
  /** True means a particular receiver exception needs separate normative review.
   * False explicitly declares that no such exception applies; absent is unknown. */
  receiverSectorException?: boolean;
  thirdPartyGoods?: boolean;
  goodsOwnerName?: string;
  goodsOwnerDocument?: string;
  series?: string;
  number?: string;
  issueDate?: string;
  signatureDate?: string;
  paymentMethod?: 'cash' | 'credit';
  currency?: string;
  netAmount?: FiscalDecimal;
  /** Rate to UYU supplied by the origin; never fetched or calculated implicitly. */
  exchangeRate?: FiscalDecimal;
  exchangeRateDate?: string;
  totalAmount?: FiscalDecimal;
  totalPayable?: FiscalDecimal;
  nonBillableAmount?: FiscalDecimal;
  retainedAmount?: FiscalDecimal;
  fiscalCreditAmount?: FiscalDecimal;
  hasWithholdingsOrPerceptions?: boolean;
  uiValue?: FiscalDecimal;
  uiValueDate?: string;
  uiValueSource?: string;
  securityCode?: string;
  signatureHash?: string;
  qrPayload?: string;
  caeNumber?: string;
  caeFrom?: string;
  caeTo?: string;
  caeExpiryDate?: string;
  issuerStartDate?: string;
  issuerResolution?: string;
  verificationUrl?: string;
  adenda?: string;
  lines?: FiscalLine[];
  adjustments?: FiscalAdjustment[];
  taxes?: FiscalTax[];
  references?: FiscalReference[];
  /** Explicit source claim about the supplied collection, never inferred from its length. */
  referencesComplete?: boolean;
}

export type FiscalField = Exclude<keyof FiscalData, 'schemaVersion'>;
export type FiscalSource = 'invoice' | 'legacy' | 'scenario';
export interface FiscalCandidate<T> { value: T; source: FiscalSource; path: string; }
export type FiscalFact<T> =
  | { state: 'unknown'; candidates: FiscalCandidate<T>[] }
  | { state: 'known'; value: T; candidates: FiscalCandidate<T>[] }
  | { state: 'conflict'; candidates: FiscalCandidate<T>[] };
export type FiscalFacts = { [K in FiscalField]: FiscalFact<NonNullable<FiscalData[K]>> };
export interface FiscalContextDiagnostic {
  kind: 'invalid-data' | 'unsupported-version' | 'conflicting-data' | 'profile-mismatch';
  field?: FiscalField;
  path: string;
  message: string;
}
export interface ValidationContext {
  /** Declared mold expectations, kept separate from document facts. */
  profile?: FiscalProfile;
  facts: FiscalFacts;
  diagnostics: FiscalContextDiagnostic[];
  /** Canonical scalar paths, including collection index; optional for old callers.
   * A valid sibling survives malformed collection data. Never proves collection completeness. */
  fieldFacts?: Record<string, FiscalFact<unknown>>;
}

export const FISCAL_ROLE_LABELS = {
  'issuer.name': 'Razón social del emisor',
  'issuer.trade-name': 'Nombre comercial del emisor',
  'issuer.rut': 'RUT del emisor',
  'issuer.address': 'Domicilio fiscal del emisor',
  'issuer.logo': 'Logo',
  'issuer.regime-legend': 'Leyenda de régimen fiscal',
  'issuer.exemption-basis': 'Norma de exoneración',
  'document.type': 'Tipo de CFE',
  'document.series': 'Serie',
  'document.number': 'Número',
  'document.payment': 'Forma de pago',
  'document.date': 'Fecha de emisión',
  'recipient.name': 'Nombre del receptor',
  'recipient.document': 'Documento del receptor',
  'recipient.document-type': 'Tipo de documento del receptor',
  'recipient.country': 'País del documento del receptor',
  'recipient.address': 'Domicilio del receptor',
  'recipient.label': 'RUC COMPRADOR / CONSUMO FINAL',
  'recipient.boundary': 'Recuadro de identificación del receptor',
  'detail.description': 'Descripción del ítem',
  'detail.quantity': 'Cantidad',
  'detail.unit-price': 'Precio unitario',
  'detail.amount': 'Importe del ítem',
  'detail.discount': 'Descuento del ítem (importe)',
  'detail.surcharge': 'Recargo del ítem (importe)',
  'detail.sign': 'Signo del importe',
  'totals.currency': 'Moneda',
  'totals.tax': 'IVA discriminado',
  'totals.net': 'Montos netos por tasa de IVA',
  'totals.amount': 'Total del comprobante',
  'totals.payable': 'Total a pagar',
  'totals.non-billable': 'Monto no facturable',
  'totals.withholdings': 'Retenciones / percepciones',
  'totals.fiscal-credit': 'Crédito fiscal',
  'adjustments.description': 'Concepto del ajuste',
  'adjustments.amount': 'Importe del ajuste',
  'tax.name': 'Nombre de retención / percepción',
  'tax.rate': 'Tasa del tributo',
  'tax.taxable-amount': 'Base imponible del tributo',
  'payment.description': 'Identificación del medio de pago',
  'payment.amount': 'Importe del medio de pago',
  'detail.mandatory-legend': 'Constancia obligatoria del ítem',
  'document.collection-legend': 'Leyenda de cobranza',
  'document.third-party-legend': 'Leyenda de pagos por cuenta de terceros',
  'document.third-party-goods': 'Leyenda Bienes de Terceros',
  'document.goods-owner': 'Identificación del propietario de los bienes',
  'tax.amount': 'Importe de retención / percepción',
  'reference.type': 'Tipo de documento referenciado',
  'reference.series': 'Serie referenciada',
  'reference.number': 'Número referenciado',
  'reference.reason': 'Razón de referencia',
  'reference.date': 'Fecha referenciada',
  'reference.amount': 'Importe referenciado',
  'reference.currency': 'Moneda referenciada',
  'reference.description': 'Identificación de documento sin codificación',
  'security.qr': 'QR de consulta DGI',
  'security.code': 'Código de seguridad',
  'footer.cae': 'Número de CAE',
  'footer.cae-range': 'Rango autorizado',
  'footer.cae-expiry': 'Vencimiento del CAE',
  'footer.issuer-start': 'Ingreso al régimen / resolución',
  'footer.verification': 'Leyenda y sitio de verificación',
  'footer.iva-legend': 'Leyenda de IVA',
  'adenda.label': 'Rótulo ADENDA',
  'adenda.boundary': 'Recuadro delimitador de adenda',
  'adenda.content': 'Contenido de adenda',
  'adenda.mandatory': 'Constancia obligatoria'
} as const;
export type FiscalRole = keyof typeof FISCAL_ROLE_LABELS;
