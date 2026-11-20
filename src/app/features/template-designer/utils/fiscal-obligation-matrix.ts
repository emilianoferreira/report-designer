import { CFE_TYPES, FiscalField, FiscalRole, FISCAL_ROLE_LABELS, ValidationContext } from '../../../core/models/fiscal.model';
import { CFE_FORMAT_SOURCE } from './fiscal-rule-catalogue';
import { supportsFiscalBrowserRules } from './fiscal-context';

export const FISCAL_MATRIX_VERSION = '1.1';
export type Obligation = 'required' | 'optional' | 'conditional' | 'not-applicable' | 'pending';
export type SupportedCfeType = typeof CFE_TYPES[number]['value'];
export interface ObligationCase {
  condition: string;
  outcome: Obligation | 'prohibited';
  reference: string;
  roles?: FiscalRole[];
}
export interface FiscalObligation {
  id: string;
  role?: FiscalRole;
  title: string;
  scope: 'printed-cfe';
  source: string;
  reference: string;
  /** Baseline reviewed, not a claim that this date is the original effective date. */
  reviewedOn: string;
  effectiveFrom?: string;
  condition: string;
  exceptions: string[];
  dependencies: FiscalField[];
  byType: Record<SupportedCfeType, Obligation>;
  evidence: 'text-and-source' | 'geometry' | 'graphic-and-source' | 'external';
  coverage: 'partial' | 'catalogued';
  pending: string;
  /** Declarative branches for later evaluators; no implicit execution or inferred facts. */
  cases?: ObligationCase[];
}
const resolution = 'https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012';
const types = CFE_TYPES.map(type => type.value);
const sales = [101, 102, 103, 111, 112, 113];
const notes = [102, 103, 112, 113];
type Spec = [FiscalRole, string, string, FiscalField[], Obligation?, (readonly number[])?];
// Inventory of printed fields. Conditional is a normative branch, not a compliance verdict.
const specs: Spec[] = [
  ['issuer.name', '14º.1', 'Identificación del emisor', ['issuerName'], 'required'],
  ['issuer.trade-name', '14º.2', 'Cuando exista nombre comercial', ['issuerTradeName'], 'conditional'],
  ['issuer.address', '14º.3', 'Domicilio fiscal; domicilio único permitido en regímenes previstos', ['issuerAddress', 'issuerRegime'], 'required'],
  ['issuer.rut', '14º.4', 'RUC del emisor', ['issuerRut'], 'required'],
  ['document.type', '14º.5', 'Tipo en palabras según Formato CFE', ['cfeType'], 'required'],
  ['document.series', '14º.6', 'Serie del CFE', ['series'], 'required'],
  ['document.number', '14º.6', 'Número del CFE', ['number'], 'required'],
  ['document.payment', '14º.7; Formato CFE, representación impresa', 'Forma de pago según tipo y operación', ['paymentMethod'], 'conditional', sales],
  ['issuer.regime-legend', '14º, identificación del emisor; modificativa 798/025', 'Leyenda del régimen aplicable', ['issuerRegime', 'partialExemption'], 'conditional'],
  ['issuer.exemption-basis', '14º, identificación del emisor', 'Norma de exoneración cuando corresponda', ['issuerRegime', 'partialExemption', 'exemptionLegalReference'], 'conditional'],
  ['recipient.label', '14º.8,11 y excepciones', 'RUC COMPRADOR o CONSUMO FINAL según operación', ['finalConsumer', 'exportOperation', 'receiverNonResidentWithoutRut', 'professionalSecrecy'], 'conditional'],
  ['recipient.boundary', '14º.8,11 y excepciones', 'Recuadro de 40 × 10 mm cuando se exige rótulo', ['finalConsumer', 'exportOperation', 'receiverNonResidentWithoutRut', 'professionalSecrecy'], 'conditional'],
  ['recipient.name', '14º.9 y excepciones a 11/12', 'Contribuyente; exportación; no residente sin RUT; e-Resguardo según receptor', ['finalConsumer', 'exportOperation', 'receiverNonResidentWithoutRut', 'receiverIsIndividual', 'professionalSecrecy'], 'conditional'],
  ['recipient.address', '14º.10 y excepciones a 11/12', 'Domicilio según operación, receptor y excepción', ['finalConsumer', 'exportOperation', 'receiverNonResidentWithoutRut', 'professionalSecrecy'], 'conditional'],
  ['recipient.document', '14º.8,12 y excepciones', 'RUC; umbral neto o retenciones; identificación del retenido', ['finalConsumer', 'netAmount', 'currency', 'uiValue', 'uiValueDate', 'issueDate', 'hasWithholdingsOrPerceptions', 'professionalSecrecy'], 'conditional'],
  ['recipient.document-type', 'Formato CFE, representación impresa: receptor', 'Tipo de identificación según documento y país; no universal', ['receiverDocumentType', 'receiverCountry'], 'conditional'],
  ['recipient.country', '14º.12; multipágina', 'País emisor del documento cuando sea exigible', ['finalConsumer', 'netAmount', 'uiValue', 'uiValueDate', 'hasWithholdingsOrPerceptions', 'exportOperation'], 'conditional'],
  ['document.date', '14º.13', 'Fecha del comprobante', ['issueDate'], 'required'],
  ['detail.description', '14º.14', 'Detalle; e-Resguardo identifica tributos conforme al Formato', ['lines'], 'required', [...sales, 181]],
  ['detail.quantity', '14º.14', 'Cantidad por ítem; servicios admiten omisión', ['operationType', 'lines'], 'conditional', [...sales, 181]],
  ['detail.unit-price', '14º.14', 'Precio por ítem; los servicios admiten omisión. La excepción de precios de exportación corresponde al e-Remito de exportación.', ['operationType', 'lines'], 'conditional', [...sales, 181]],
  ['detail.amount', '14º.14', 'Importe por ítem según tipo y operación. Revisar el alcance específico del e-Remito.', ['lines'], 'conditional', [...sales, 181]],
  ['totals.tax', '14º.15,16 y restricciones por régimen', 'Neto e IVA por tasa; tickets no requieren discriminación', ['issuerRegime', 'taxes'], 'conditional', sales],
  ['totals.net', '14º.15 y restricciones por régimen', 'Montos netos por tasa; tickets admiten monto bruto sin discriminación', ['issuerRegime', 'taxes'], 'conditional', sales],
  ['totals.amount', 'Formato CFE A.125; representación impresa', 'Total del comprobante según tipo', ['totalAmount'], 'conditional', sales],
  ['totals.payable', 'Formato CFE A.125.1; representación impresa', 'Total a pagar; puede compartir impresión con total si coinciden', ['totalAmount', 'totalPayable'], 'conditional', sales],
  ['totals.currency', 'Formato CFE, representación impresa: cuerpo', 'Moneda de los importes aplicables', ['currency'], 'conditional'],
  ['totals.non-billable', 'Formato CFE A.129; representación impresa', 'Monto no facturable aplicable; cero no es ausencia', ['nonBillableAmount'], 'conditional', sales],
  ['totals.withholdings', '14º.17; Formato CFE A.127/128', 'Retenciones/percepciones cuando correspondan', ['hasWithholdingsOrPerceptions', 'retainedAmount', 'taxes'], 'conditional', [...sales, 182]],
  ['totals.fiscal-credit', '1º.h modificado por 821/024; Formato CFE', 'Crédito fiscal comunicado cuando corresponda', ['fiscalCreditAmount'], 'conditional', [182]],
  ['detail.discount', '14º.18; Formato CFE B.13', 'Importe del descuento informado; no sustituir por porcentaje', ['lines'], 'conditional', sales],
  ['detail.surcharge', '14º.18; Formato CFE B.17', 'Importe del recargo informado', ['lines'], 'conditional', sales],
  ['detail.sign', 'Formato CFE B, indicador 7; representación impresa', 'Signo según indicador, sin inferirlo del tipo NC', ['lines'], 'conditional', sales],
  ['adjustments.description', '14º.18; Formato CFE D', 'Concepto y clase del ajuste global', ['adjustments'], 'conditional', sales],
  ['adjustments.amount', '14º.18; Formato CFE D.5/6/7', 'Importes y signos de ajustes globales aplicables', ['adjustments'], 'conditional', sales],
  ['tax.name', '14º.17; Formato CFE', 'Identificación de tributos aplicables', ['taxes'], 'conditional', [...sales, 182]],
  ['tax.rate', 'Formato CFE, tributos y representación impresa', 'Tasa según tributo y tipo; no universal', ['taxes'], 'conditional', [...sales, 182]],
  ['tax.taxable-amount', 'Formato CFE, tributos y representación impresa', 'Base según tributo y tipo; no universal', ['taxes'], 'conditional', [...sales, 182]],
  ['tax.amount', '14º.17; Formato CFE A.127/128', 'Importe del tributo aplicable', ['taxes'], 'conditional', [...sales, 182]],
  ['reference.type', '14º.19; Formato CFE F', 'Tipo en palabras de cada referencia individual aplicable', ['references', 'ownCollection'], 'conditional'],
  ['reference.series', '14º.19; Formato CFE F', 'Serie asociada a referencia individual; excluir global', ['references'], 'conditional'],
  ['reference.number', '14º.19; Formato CFE F', 'Número asociado a referencia individual; excluir global', ['references'], 'conditional'],
  ['reference.reason', 'Formato CFE F.6', 'Razón global obligatoria; individual si informada', ['references'], 'conditional'],
  ['reference.date', 'Formato CFE F.7', 'Fecha informada cuando aplicable; excluir global', ['references'], 'conditional'],
  ['reference.amount', 'Formato CFE F.8', 'Importe informado en referencia individual cuando aplica', ['references'], 'conditional', [...sales, 182]],
  ['reference.currency', 'Formato CFE F.9', 'Moneda informada en referencia individual cuando aplica', ['references'], 'conditional', [...sales, 182]],
  ['reference.description', 'Formato CFE F, documentos sin codificación', 'Identificación suministrada del documento; suficiencia de la razón requiere revisión', ['references'], 'conditional'],
  ['security.qr', '14º.20 y 15º; Formato CFE, sello digital', 'Símbolo válido con datos correspondientes al tipo', ['qrPayload', 'signatureHash', 'signatureDate'], 'required'],
  ['security.code', '14º.21; Formato CFE, sello digital', 'Seis primeros caracteres del hash', ['signatureHash', 'securityCode'], 'required'],
  ['footer.issuer-start', '14º.22', 'Fecha de ingreso o resolución de incorporación', ['issuerStartDate', 'issuerResolution'], 'required'],
  ['footer.verification', '14º.22', 'Sitio del emisor para tickets/notas; DGI en restantes tipos', ['verificationUrl'], 'required'],
  ['footer.iva-legend', '14º.23 y restricciones por régimen', 'Constancia IVA cuando corresponda; prohibida en regímenes previstos', ['issuerRegime'], 'conditional'],
  ['footer.cae', '14º.24', 'Número de CAE', ['caeNumber'], 'required'],
  ['footer.cae-range', '14º.25', 'Rango autorizado', ['caeFrom', 'caeTo'], 'required'],
  ['footer.cae-expiry', '14º.26', 'Leyenda y fecha de vencimiento del rango', ['caeExpiryDate'], 'required'],
  ['document.third-party-goods', '14º, traslado por depositarios', 'Bienes de Terceros en e-Remito cuando corresponda', ['thirdPartyGoods'], 'conditional', [181]],
  ['document.goods-owner', '14º, traslado por depositarios', 'Nombre e identificación del titular de bienes de terceros', ['thirdPartyGoods', 'goodsOwnerName', 'goodsOwnerDocument'], 'conditional', [181]],
  ['document.third-party-legend', '14º, mandatarios art.105 Decreto 220/998', 'Pagos por cuenta de terceros según operación', ['thirdPartyCollection'], 'conditional'],
  ['document.collection-legend', 'Formato CFE, cobranza propia', 'Cobranza propia según operación y referencias', ['ownCollection', 'references'], 'conditional'],
  ['detail.mandatory-legend', '13º.J y 14º, constancias', 'Constancia sectorial del ítem, ubicación particular si existe', ['sector', 'lines'], 'conditional'],
  ['adenda.mandatory', '13º.J y 14º, adenda', 'Constancias sectoriales y receptor amparado en secreto profesional', ['sector', 'professionalSecrecy'], 'conditional'],
  ['adenda.content', '13º.J; 14º, adenda', 'Información libre permitida; datos obligatorios conservan sus requisitos', ['adenda'], 'optional'],
  ['adenda.label', '14º, adenda', 'Rótulo cuando se imprime adenda', ['adenda', 'professionalSecrecy'], 'conditional'],
  ['adenda.boundary', '14º, adenda', 'Delimitación según alternativa de disposición', ['adenda', 'professionalSecrecy'], 'conditional'],
  ['issuer.logo', 'Formato CFE, representación impresa', 'Logo opcional; dimensiones y legibilidad se evalúan aparte', [], 'optional'],
  ['payment.description', '14º.19bis DEROGADO por 10558/2018', 'Sin obligación universal por el antiguo umbral; revisar obligación particular', ['sector'], 'pending'],
  ['payment.amount', '14º.19bis DEROGADO por 10558/2018', 'Sin obligación universal por el antiguo umbral; revisar obligación particular', ['sector'], 'pending']
];
const partial: FiscalRole[] = ['issuer.name', 'issuer.rut', 'document.type', 'document.series', 'document.number', 'document.date', 'security.qr', 'security.code', 'totals.non-billable', 'reference.reason',
  'recipient.name', 'recipient.document', 'recipient.address', 'recipient.country', 'recipient.label', 'recipient.boundary',
  'detail.quantity', 'detail.unit-price', 'detail.amount', 'detail.discount', 'detail.surcharge', 'totals.amount', 'totals.payable',
  'totals.currency', 'totals.net', 'totals.tax', 'totals.withholdings', 'totals.fiscal-credit', 'tax.name', 'tax.rate',
  'tax.taxable-amount', 'tax.amount', 'adjustments.amount', 'adjustments.description', 'detail.sign', 'reference.type', 'reference.series', 'reference.number',
  'reference.date', 'reference.amount', 'reference.currency', 'reference.description'];
const fieldRows: FiscalObligation[] = specs.map(([role, reference, condition, dependencies, status = 'pending', applicable = types]) => ({
  id: `field:${role}`, role, title: FISCAL_ROLE_LABELS[role], scope: 'printed-cfe',
  source: reference.startsWith('Formato') ? CFE_FORMAT_SOURCE : resolution, reference,
  reviewedOn: '2026-11-20', ...(role === 'recipient.document' ? { effectiveFrom: '2022-11-01' } : {}),
  condition, exceptions: role.startsWith('recipient.') ? [
    'Secreto profesional: identificación en adenda cuando se cumplen los supuestos legales.',
    'Exportación, entidades no residentes sin RUT y e-Resguardos tienen alternativas específicas; no inferirlas del país.',
    'Umbral de documento: 10.000 UI antes de 2022-11-01; 5.000 UI desde esa fecha. Excepciones sectoriales requieren revisión.'
  ] : role === 'totals.tax' || role === 'totals.net' ? [
    'Tickets y notas admiten no discriminar; IVA mínimo y monotributos restringen menciones de IVA.',
    'Exoneración parcial exige identificar las operaciones alcanzadas.'
  ] : role.startsWith('reference.') ? [
    'Referencia global no usa identificación individual; exige razón.',
    'Documentos sin codificación necesitan descripción inequívoca; no mezclar campos de referencias distintas.'
  ] : ['Aplicar las alternativas expresas de la condición; datos ausentes o contradictorios permanecen pendientes.'],
  dependencies: [...new Set<FiscalField>(['isCfe', 'cfeType', ...dependencies,
    ...(role.startsWith('recipient.') ? ['receiverSectorException', 'professionalSecrecy', 'finalConsumer', 'receiverDocumentType',
      'receiverNonResidentWithoutRut', 'receiverIsIndividual', 'exportOperation', 'hasWithholdingsOrPerceptions'] as const : []),
    ...(role === 'recipient.country' || role === 'recipient.document' ? ['netAmount', 'currency', 'issueDate', 'uiValue',
      'uiValueDate', 'uiValueSource'] as const : [])])],
  byType: Object.fromEntries(types.map(type => [type, applicable.includes(type) ? status : 'not-applicable'])) as Record<SupportedCfeType, Obligation>,
  evidence: role === 'security.qr' ? 'graphic-and-source' : role === 'adenda.boundary' || role === 'recipient.boundary' ? 'geometry' : 'text-and-source',
  coverage: partial.includes(role) ? 'partial' : 'catalogued',
  pending: role.startsWith('recipient.') ? 'Cobertura parcial por campo y página en etapa 10; excepciones sectoriales, omisiones sin cobertura completa y altura física pendientes.' :
    role.startsWith('reference.') ? 'Correspondencia parcial por instancia en etapa 12; elegibilidad global, existencia en DGI y omisiones sin cobertura completa pendientes.' :
    partial.includes(role) && /^(detail|totals|tax|adjustments)\./.test(role) ? 'Correspondencia parcial en etapa 11; omisiones, agrupaciones, redondeo no verificable y cálculos fiscales no se certifican.' :
    'Aplicabilidad específica, presencia y correspondencia por instancia; la matriz no equivale a evidencia impresa.'
}));

const formalities: Array<[string, string, string, FiscalObligation['evidence']]> = [
  ['paper', 'Soporte, dimensiones, gramaje y resolución', 'Formato CFE, representación impresa: papel', 'external'],
  ['legibility', 'Borde, altura real de caracteres, interlineado, negro y legibilidad', 'Formato CFE, representación impresa: características', 'geometry'],
  ['distribution', 'Orden y distribución; alternativa secuencial según soporte', '14º, distribución y orden', 'geometry'],
  ['logo-size', 'Dimensión máxima y legibilidad del logo opcional', 'Formato CFE, representación impresa: logo', 'geometry'],
  ['recipient-box', 'Recuadro del receptor y caracteres mínimos', '14º.8,11 y excepciones', 'geometry'],
  ['regime-box', 'Recuadro, altura y ubicación de leyenda del régimen', '14º, identificación del emisor', 'geometry'],
  ['qr-size', 'Símbolo y margen medidos por separado', 'Formato CFE, representación impresa: sello digital', 'graphic-and-source'],
  ['footer-position', 'Orden de sello, código, leyendas y CAE', '14º.20–26', 'geometry'],
  ['expiry-box', 'Recuadro y caracteres de vencimiento', '14º.26', 'geometry'],
  ['adenda-placement', 'Delimitación, alternativas y prioridad de constancias', '14º, adenda', 'geometry'],
  ['multipage', 'Identificación repetida, sello y numeración por hoja', '14º, multipágina', 'text-and-source'],
  ['reference-association', 'Necesidad, globales y asociación de todas las referencias', '14º.19; Formato CFE F', 'text-and-source'],
  ['sector-exceptions', 'Constancias y excepciones de normativa particular', '13º.J y 14º, constancias obligatorias', 'external'],
  ['thermal-publication', 'Publicación y disponibilidad de representaciones térmicas', '19º.g/h', 'external']
];
export const FISCAL_OBLIGATION_MATRIX: readonly FiscalObligation[] = [...fieldRows,
  ...formalities.map(([id, title, reference, evidence]): FiscalObligation => ({
    id: `formality:${id}`, title, scope: 'printed-cfe', source: reference.startsWith('Formato') ? CFE_FORMAT_SOURCE : resolution,
    reference, reviewedOn: '2026-11-20', condition: 'Según soporte, operación y alternativas normativas; requiere evidencia adicional.',
    exceptions: ['No interpretar una zona lógica como posición normativa; verificar las excepciones por operación.'],
    dependencies: ['isCfe', 'cfeType'], byType: Object.fromEntries(types.map(type => [type, 'conditional'])) as Record<SupportedCfeType, Obligation>,
    evidence, coverage: 'catalogued', pending: 'Cobertura parcial en etapas 1–7; no certifica impresión física ni interpreta todas las excepciones.'
  }))];

// Keep alternatives explicit rather than collapsing each family into a universal requirement.
for (const row of fieldRows) {
  const branch = (condition: string, outcome: ObligationCase['outcome'], reference = row.reference): ObligationCase => ({ condition, outcome, reference });
  if (row.role?.startsWith('recipient.')) row.cases = [
    { ...branch('Operación con contribuyente identificado por RUC.', 'required', '14º.8–10'), roles: ['recipient.label', 'recipient.document', 'recipient.name', 'recipient.address'] },
    { ...branch('Restante operación sin excepción: CONSUMO FINAL.', 'required', '14º.11'), roles: ['recipient.label'] },
    { ...branch('Monto neto supera umbral vigente o documenta retenciones/percepciones, salvo excepción expresa.', 'required', '14º.12; 531/2022'), roles: ['recipient.document', 'recipient.country'] },
    { ...branch('Exportación: sustitución de requisitos de 11/12.', 'required', '14º, excepción a)'), roles: ['recipient.name', 'recipient.address'] },
    { ...branch('e-Resguardo a persona física o entidad exterior, salvo excepción expresa.', 'required', '14º, excepción b)'), roles: ['recipient.name', 'recipient.document'] },
    { ...branch('Entidad no residente sin RUT: rótulo puede omitirse aportando nombre y domicilio.', 'optional', '14º, entidades no residentes'), roles: ['recipient.label'] },
    branch('Secreto profesional amparado: identificación puede trasladarse a adenda; verificar allí.', 'conditional', '14º, secreto profesional')
  ];
  if (row.role === 'detail.quantity' || row.role === 'detail.unit-price') row.cases = [
    branch('Venta de bienes en comprobante de venta.', 'required'),
    branch('Prestación de servicios: cantidad y precio unitario pueden omitirse.', 'optional'),
    branch('Operación mixta: resolver por ítem; tipo general no basta.', 'conditional'),
    branch('El ordinal 14 menciona expresamente el e-Remito de exportación. El tratamiento de precios del tipo 181 requiere revisión específica.', 'pending'),
    branch('e-Resguardo: usar campos de tributos.', 'not-applicable')
  ];
  if (row.role === 'totals.net' || row.role === 'totals.tax') row.cases = [
    branch('e-Factura y notas: discriminación por tasa cuando corresponda al régimen y operación.', 'conditional'),
    branch('e-Ticket y notas: puede omitirse discriminación según 14º.15/16.', 'optional'),
    branch('IVA mínimo: menciones IVA prohibidas excepto constancia prevista; monotributos: menciones y constancia prohibidas.', 'prohibited', '14º, cuerpo y regímenes; 798/025'),
    branch('Exoneración parcial: identificar operación alcanzada antes de decidir.', 'pending')
  ];
  if (row.role === 'totals.payable') row.cases = [
    branch('Total a pagar y total iguales: se admite un único importe inequívoco.', 'optional'),
    branch('Total a pagar y total diferentes: conservar sus significados separados.', 'required'),
    branch('Alguno de los dos valores desconocido: no autorizar unificación.', 'pending')
  ];
  if (row.role?.startsWith('reference.')) row.cases = [
    branch('Notas 102/103/112/113: necesidad de referencia; otros tipos dependen de operación.', 'conditional', 'Formato CFE F; 14º.19'),
    { ...branch('Referencia individual identificable cuando aplicable.', 'required', 'Formato CFE F.3–F.5'), roles: ['reference.type', 'reference.series', 'reference.number'] },
    { ...branch('Referencia global: razón obligatoria.', 'required', 'Formato CFE F.2/F.6'), roles: ['reference.reason'] },
    { ...branch('Referencia global: se excluyen identificación individual, fecha, monto y moneda.', 'not-applicable', 'Formato CFE F'), roles: ['reference.type', 'reference.series', 'reference.number', 'reference.date', 'reference.amount', 'reference.currency'] },
    { ...branch('Referencia individual: imprimir si aplica y se informa.', 'conditional', 'Formato CFE F.6–F.9'), roles: ['reference.reason', 'reference.date', 'reference.amount', 'reference.currency'] },
    branch('Documento sin codificación: revisar descripción e identificación inequívoca.', 'pending', 'Formato CFE F')
  ];
  if (row.cases) row.cases = row.cases.filter(item => !item.roles || item.roles.includes(row.role!));
}

/** Select a normative cell without treating conditional as required or missing data as a failure. */
export function obligationForContext(row: FiscalObligation, context: ValidationContext): Obligation {
  const cfe = context.facts.isCfe, type = context.facts.cfeType;
  if (cfe.state === 'known' && !cfe.value) return 'not-applicable';
  if (!supportsFiscalBrowserRules(context) || type.state !== 'known') return 'pending';
  return row.byType[type.value as SupportedCfeType] ?? 'pending';
}

export const FISCAL_REFERENCE_POLICY = {
  requiredForTypes: notes, otherCases: 'Condicionados por operación; no asumir referencia opcional por no ser nota.',
  collectionCompleteness: 'Una lista ausente es desconocida; una lista vacía conocida no prueba omisión impresa.'
} as const;
