import { FiscalField, FiscalRole, FISCAL_ROLE_LABELS } from '../../../core/models/fiscal.model';
import { TemplateElement } from '../../../core/models/template.model';

const fieldRoles: Partial<Record<FiscalField, FiscalRole>> = {
  issuerName: 'issuer.name', issuerTradeName: 'issuer.trade-name', issuerRut: 'issuer.rut',
  issuerAddress: 'issuer.address', exemptionLegalReference: 'issuer.exemption-basis',
  cfeType: 'document.type', series: 'document.series', number: 'document.number',
  issueDate: 'document.date', paymentMethod: 'document.payment', receiverName: 'recipient.name',
  receiverDocumentNumber: 'recipient.document', receiverCountry: 'recipient.country', receiverAddress: 'recipient.address',
  currency: 'totals.currency', totalAmount: 'totals.amount', totalPayable: 'totals.payable',
  nonBillableAmount: 'totals.non-billable', retainedAmount: 'totals.withholdings', fiscalCreditAmount: 'totals.fiscal-credit',
  qrPayload: 'security.qr', securityCode: 'security.code', caeNumber: 'footer.cae',
  caeFrom: 'footer.cae-range', caeTo: 'footer.cae-range', caeExpiryDate: 'footer.cae-expiry',
  issuerStartDate: 'footer.issuer-start', issuerResolution: 'footer.issuer-start',
  verificationUrl: 'footer.verification', adenda: 'adenda.content'
};

/** Binding to a numeric type code is a suggestion of meaning, not proof of its printed wording. */
export const FISCAL_BINDING_FIELDS = Object.entries(fieldRoles).map(([field, role]) => ({
  path: `fiscal.${field}`, description: FISCAL_ROLE_LABELS[role]
}));

const legacyRoles: Record<string, FiscalRole> = {
  'company.Nombre': 'issuer.name', 'company.NombreComercial': 'issuer.trade-name', 'company.RUT': 'issuer.rut',
  'invoice.Empresa.Parametros.EFA_Emisor_Nombre': 'issuer.name',
  'invoice.Empresa.Parametros.EFA_Emisor_NComercial': 'issuer.trade-name',
  'invoice.Empresa.Parametros.EFA_Emisor_RUT': 'issuer.rut',
  'invoice.Empresa.Parametros.EFA_Emisor_Direccion': 'issuer.address',
  'CFE.TipoComprobanteFiscal.Nombre': 'document.type',
  'invoice.Numero.Serie': 'document.series', 'invoice.Numero.Numero': 'document.number',
  'invoice.Fecha': 'document.date', 'CFE.CodSeguridad': 'security.code', 'CFE.Adenda': 'adenda.content',
  'invoice.Numero.CAEIdentificador': 'footer.cae', 'invoice.Numero.CAEDesde': 'footer.cae-range',
  'invoice.Numero.CAEHasta': 'footer.cae-range', 'invoice.Numero.CAEFechaVto': 'footer.cae-expiry',
  'Moneda.ISO4217': 'totals.currency'
};

/** Pure suggestions from exact bindings only. Never infer from text, names or formulas. */
export function suggestFiscalRoles(element: TemplateElement): FiscalRole[] {
  const binding = element.type === 'dataField' ? element.binding.source :
    element.type === 'qrCode' ? element.dataBinding : undefined;
  if (!binding) return [];
  const map: Partial<Record<string, FiscalRole>> = binding.startsWith('fiscal.') ? fieldRoles : legacyRoles;
  const key = binding.startsWith('fiscal.') ? binding.slice(7) : binding;
  const role = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
  if (!role || (element.fiscalRoles ?? []).includes(role)) return [];
  // A generic QR element is not necessarily a DGI QR, and text is not a QR symbol.
  if ((element.type === 'qrCode') !== (role === 'security.qr')) return [];
  return [role];
}
