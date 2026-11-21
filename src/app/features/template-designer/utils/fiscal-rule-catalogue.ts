import { FiscalField, FiscalRole, ValidationContext } from '../../../core/models/fiscal.model';
import { supportsFiscalBrowserRules } from './fiscal-context';
import { receiverRequirements } from './receiver-requirements';

export const CFE_FORMAT_SOURCE = 'https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=';
export interface FiscalFieldRequirement {
  id: string;
  roles: FiscalRole[];
  source: string;
  reference: string;
  scope: 'printed-cfe';
  condition: string;
  dependencies: FiscalField[];
  applicability(context: ValidationContext): 'required' | 'optional' | 'pending' | 'not-applicable';
}
const known = (context: ValidationContext, field: FiscalField): unknown => {
  const fact = context.facts[field];
  return fact.state === 'known' ? fact.value : undefined;
};
const requirement = (id: string, roles: FiscalRole[], reference: string, condition: string,
  dependencies: FiscalField[], decide: FiscalFieldRequirement['applicability']): FiscalFieldRequirement => ({
  id, roles, source: CFE_FORMAT_SOURCE, reference, scope: 'printed-cfe', condition,
  dependencies: ['isCfe', 'cfeType', ...dependencies],
  applicability(context) {
    if (known(context, 'isCfe') === false) return 'not-applicable';
    if (!supportsFiscalBrowserRules(context)) return 'pending';
    return decide(context);
  }
});
/** Presence obligations only. A required role does not mean a field is printed or valid.
 * Unlisted obligations remain in the existing deferred catalogue, not implicitly optional.
 */
export const FISCAL_FIELD_REQUIREMENTS: readonly FiscalFieldRequirement[] = [
  requirement('ID-01.name', ['issuer.name'], 'p. 80, Identificación del emisor', 'Todos los CFE soportados', [], () => 'required'),
  requirement('ID-01.address', ['issuer.address'], 'p. 80, Identificación del emisor', 'Todos los CFE soportados', [], () => 'required'),
  requirement('ID-01.trade-name', ['issuer.trade-name'], 'p. 80, Identificación del emisor', 'Nombre comercial cuando exista', ['issuerTradeName'], c => known(c, 'issuerTradeName') === undefined ? 'pending' : 'required'),
  requirement('ID-02.identity', ['issuer.rut', 'document.type', 'document.series', 'document.number'], 'p. 80, Identificación del comprobante', 'Todos los CFE soportados', [], () => 'required'),
  requirement('CON-01.date', ['document.date'], 'p. 82, Fecha', 'Todos los CFE soportados', [], () => 'required'),
  requirement('REC-01.identity', ['recipient.name', 'recipient.document', 'recipient.address'], 'p. 81, Identificación del receptor',
    'Identificación en operaciones entre contribuyentes; secreto profesional admite traslado a adenda',
    ['finalConsumer', 'professionalSecrecy', 'receiverSectorException', 'receiverDocumentType', 'receiverNonResidentWithoutRut'], c => {
      const receiver = receiverRequirements(c);
      const identity = receiver.fields.filter(field => ['recipient.name', 'recipient.document', 'recipient.address'].includes(field.role));
      return identity.every(field => field.applicability === 'required') ? 'required' : 'pending';
    }),
  requirement('REG-01.exemption', ['issuer.regime-legend', 'issuer.exemption-basis'], 'p. 80, Identificación del emisor',
    'Contribuyente exonerado; exoneraciones parciales requieren evaluación específica', ['issuerRegime', 'partialExemption'], c => {
      const regime = known(c, 'issuerRegime');
      if (regime === undefined) return 'pending';
      if (regime !== 'exempt') return 'not-applicable';
      return known(c, 'partialExemption') === false ? 'required' : 'pending';
    }),
  requirement('CON-02.description', ['detail.description'], 'p. 82, Mercaderías o servicios', 'Detalle de la operación; e-Resguardo identifica tributos', [], c => known(c, 'cfeType') === 182 ? 'not-applicable' : 'required'),
  requirement('CON-02.quantity-price', ['detail.quantity', 'detail.unit-price'], 'p. 82, Mercaderías o servicios', 'En servicios pueden omitirse; operación mixta requiere evaluar cada ítem', ['operationType'], c => {
    if (known(c, 'cfeType') === 182) return 'not-applicable';
    if (known(c, 'cfeType') === 181) return 'pending'; // Quantity and price have different obligations.
    const operation = known(c, 'operationType');
    return operation === 'services' ? 'optional' : operation === 'goods' ? 'required' : 'pending';
  }),
  requirement('REF-01.notes', ['reference.type', 'reference.series', 'reference.number'], 'Información de referencia, zona F; p. 82', 'Notas requieren referencia; la identificación y razón dependen de referencia global', ['references'], c => {
    if (![102, 103, 112, 113].includes(known(c, 'cfeType') as number)) return 'pending';
    const refs = known(c, 'references');
    return Array.isArray(refs) && refs.length > 0 && refs.every(r => r.global === false) ? 'required' : 'pending';
  }),
  requirement('QR-01.symbol', ['security.qr'], 'p. 83, Sello digital', 'Todos los CFE soportados', [], () => 'required'),
  requirement('PIE-02.cae', ['footer.cae', 'footer.cae-range', 'footer.cae-expiry'], 'p. 83, CAE', 'Todos los CFE soportados', [], () => 'required'),
  requirement('ADE-02.mandatory', ['adenda.mandatory'], 'pp. 73 y 84, Adenda', 'Depende de constancias sectoriales y ubicaciones expresamente previstas', ['sector', 'professionalSecrecy'], () => 'pending')
];
