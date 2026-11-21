import { FiscalFact, FiscalField, ValidationContext } from '../../../core/models/fiscal.model';
import { supportsFiscalBrowserRules } from './fiscal-context';

export const RECEIVER_SOURCE = 'https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012';
const receiverFields = [
  ['recipient.name', 'receiverName'], ['recipient.document', 'receiverDocumentNumber'],
  ['recipient.address', 'receiverAddress'], ['recipient.country', 'receiverCountry'],
  ['recipient.document-type', 'receiverDocumentType'], ['recipient.label', undefined],
  ['recipient.boundary', undefined]
] as const;

type ReceiverRole = typeof receiverFields[number][0];
const ticketTypes = [101, 102, 103];
const invoiceTypes = [111, 112, 113];
const thresholdStart = '2012-05-08'; // Formato CFE 25.2, tabla E.
const thresholdReduction = '2022-11-01'; // Resolución 531/022, numeral 1.
const receiverAmendmentPublished = '2014-08-23'; // Resolución 2886/014, numerales 1, 2, 4 y 5.
const multipageAmendmentPublished = '2012-11-21'; // Resolución 2719/012, numeral 6.
const secrecyAmendmentPublished = '2019-03-20'; // Resolución 780/019.
export const adendaAmendmentPublished = '2023-07-06'; // Resolución 1264/023.
type ReceiverBranch = 'ruc-buyer' | 'final-consumer' | 'export' | 'withholding' | 'nonresident' | 'unresolved';
export interface ReceiverRequirement {
  role: ReceiverRole;
  field?: FiscalField;
  expected?: string;
  applicability: 'required' | 'optional' | 'pending' | 'not-applicable';
  reason: string;
  basis: { source: string; reference: string; version: '25.2'; effectiveFrom?: string };
  facts: Partial<Record<FiscalField, FiscalFact<unknown>>>;
  locations: readonly ('receiver-zone' | 'adenda')[];
  locationReference?: string;
  locationBasis?: ReceiverRequirement['basis'];
  repetition: 'document' | 'each-cfe-page' | 'pending' | 'not-applicable';
  repetitionReference?: string;
}
export interface ReceiverRequirements {
  fields: ReceiverRequirement[];
  threshold: { status: 'pass' | 'pending' | 'not-applicable'; exceeded?: boolean; limit?: 5000 | 10000; reason: string };
  secrecy: boolean | undefined;
  branch: ReceiverBranch;
  /** Any one group satisfies the alternative. All roles in the chosen group are needed. */
  alternative?: { anyOf: readonly (readonly ReceiverRole[])[]; basis: ReceiverRequirement['basis'] };
}
const value = <T>(fact: FiscalFact<T> | undefined): T | undefined => fact?.state === 'known' ? fact.value : undefined;
const basis = (reference: string, effectiveFrom?: string): ReceiverRequirement['basis'] =>
  ({ source: RECEIVER_SOURCE, reference, version: '25.2', ...(effectiveFrom ? { effectiveFrom } : {}) });

export function hasUnidentifiedTicketDocument(context: ValidationContext): boolean {
  const { receiverDocumentType, receiverDocumentNumber } = context.facts;
  return receiverDocumentType.state !== 'known' &&
    (receiverDocumentNumber.state !== 'unknown' || context.diagnostics.some(d => d.kind === 'invalid-data' &&
      (d.field === 'receiverDocumentType' || d.field === 'receiverDocumentNumber')));
}

/** Compare an already supplied net amount with a legal threshold. No tax/base calculation,
 * exchange conversion, system-date lookup, absolute-value guess or floating-point arithmetic. */
export function receiverThreshold(context: ValidationContext): ReceiverRequirements['threshold'] {
  const f = context.facts, date = value(f.issueDate)?.slice(0, 10);
  const net = value(f.netAmount), ui = value(f.uiValue);
  const pending = (reason: string): ReceiverRequirements['threshold'] => ({ status: 'pending', reason });
  const type = value(f.cfeType);
  if (type === undefined) return pending('Falta determinar el tipo de CFE.');
  if (!ticketTypes.includes(type)) return { status: 'not-applicable', reason: 'El comparador cubre e-Tickets y sus notas.' };
  if (!date || date < thresholdStart) return pending('Fecha desconocida o período histórico fuera de la versión de umbrales cubierta.');
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
  const limit = date >= thresholdReduction ? 5000n : 10000n;
  const exceeded = scaled(net) > scaled(ui) * limit;
  return { status: 'pass', exceeded, limit: Number(limit) as 5000 | 10000, reason: `Comparación estricta con ${limit} UI del cierre anterior: ${exceeded ? 'supera' : 'no supera'} el umbral. No verifica el cálculo del neto ni la autenticidad de la cotización.` };
}

/** Resolve fiscal applicability without inspecting roles, bindings or rendered content. */
export function receiverRequirements(context: ValidationContext): ReceiverRequirements {
  const f = context.facts;
  const dependencies: FiscalField[] = ['isCfe', 'cfeType', 'issueDate', 'finalConsumer', 'exportOperation',
    'receiverNonResidentWithoutRut', 'receiverIsIndividual', 'receiverDocumentType', 'receiverSectorException',
    'professionalSecrecy', 'hasWithholdingsOrPerceptions'];
  if (value(f.cfeType) === 182) dependencies.push('fiscalCreditAmount');
  const facts = (keys: FiscalField[]) => Object.fromEntries(keys.map(key => [key, f[key]]));
  const fields: ReceiverRequirement[] = receiverFields.map(([role, field]) => ({
    role, field, expected: field ? value(f[field]) : undefined,
    applicability: 'pending', reason: 'Falta contexto inequívoco del receptor.',
    basis: basis('14º.8–12, identificación del receptor'), locations: [], repetition: 'pending',
    facts: facts(field ? [...dependencies, field] : dependencies)
  }));
  const secrecy = value(f.professionalSecrecy);
  const result: ReceiverRequirements = { fields, secrecy, branch: 'unresolved',
    threshold: { status: 'pending', reason: 'Falta resolver la operación.' } };
  const defer = (reason: string) => {
    for (const row of fields) row.reason = reason;
    return result;
  };
  if (value(f.isCfe) === false) {
    for (const row of fields) Object.assign(row, { applicability: 'not-applicable', repetition: 'not-applicable',
      reason: 'El origen identifica un documento no fiscal.' });
    return result;
  }
  if (!supportsFiscalBrowserRules(context)) return result;
  if (value(f.receiverSectorException) !== false) return defer('Excepción sectorial aplicable o desconocida: falta identificar su fundamento.');
  const type = value(f.cfeType)!;
  const ticket = ticketTypes.includes(type), invoice = invoiceTypes.includes(type);
  const buyerType = invoice || type === 181 || type === 182;
  const date = value(f.issueDate)?.slice(0, 10);
  const consumer = value(f.finalConsumer), exporting = value(f.exportOperation), foreign = value(f.receiverNonResidentWithoutRut);
  const individual = value(f.receiverIsIndividual), withholding = value(f.hasWithholdingsOrPerceptions);
  const documentType = value(f.receiverDocumentType)?.trim().toUpperCase();
  const rut = /^(RUC|RUT|2)$/.test(documentType ?? ''); // Formato CFE 25.2, A-C60.
  if ((consumer === false && foreign === true) || (foreign === true && rut) ||
      (invoice && consumer === true))
    return defer('Tipo de CFE y condiciones del receptor contradictorios; revisar el origen.');
  if (f.receiverDocumentType.state === 'conflict' || f.finalConsumer.state === 'conflict' ||
      f.receiverNonResidentWithoutRut.state === 'conflict' || f.exportOperation.state === 'conflict' ||
      f.issueDate.state === 'conflict' || (date && date < thresholdStart))
    return defer('Hay hechos contradictorios que podrían cambiar la modalidad del receptor.');
  if (ticket && rut) return defer('Identificación con RUC en e-Ticket: falta resolver la obligación de representación impresa de la operación particular.');
  if (type === 182 && (f.fiscalCreditAmount.state === 'conflict' ||
      (value(f.fiscalCreditAmount) !== undefined && value(f.fiscalCreditAmount) !== '0')))
    return defer('El e-Resguardo tiene evidencia de crédito fiscal o importes de crédito contradictorios. Falta resolver el régimen de identificación aplicable.');

  const set = (roles: ReceiverRole[], applicability: ReceiverRequirement['applicability'], reference: string,
    reason: string, expected?: string) => {
    for (const row of fields.filter(field => roles.includes(field.role))) {
      row.applicability = applicability;
      row.reason = reason;
      row.basis = basis(reference);
      if (expected !== undefined) row.expected = expected;
    }
  };
  const setLabel = (expected: string, reference: string) => {
    set(['recipient.label'], 'required', reference, 'Rótulo del receptor según la operación.', expected);
    set(['recipient.boundary'], 'required', reference, 'Recuadro de identificación según la operación.');
  };
  const noThreshold = (reason: string) => { result.threshold = { status: 'not-applicable', reason }; };

  if (buyerType && consumer === false && rut && foreign === false) {
    result.branch = 'ruc-buyer';
    set(['recipient.document'], 'required', '14º.8', 'RUC del comprador.');
    set(['recipient.name'], 'required', '14º.9', 'Nombre o denominación del comprador.');
    set(['recipient.address'], 'required', '14º.10', 'Domicilio fiscal del comprador.');
    setLabel('RUC COMPRADOR', '14º.8');
    set(['recipient.country', 'recipient.document-type'], 'optional', '14º.8–10', 'Sin exigencia universal adicional en esta rama.');
    noThreshold('La identificación por RUC no depende del umbral.');
  } else if (type === 182 && (individual === true || foreign === true) && withholding === true && exporting === false) {
    if (!date || date < receiverAmendmentPublished) return defer('Fecha fuera del período cubierto para la excepción del retenido.');
    result.branch = 'withholding';
    set(['recipient.name', 'recipient.document'], 'required', '14º, excepción b)', 'Identificación del retenido.');
    set(['recipient.address', 'recipient.label', 'recipient.boundary', 'recipient.country', 'recipient.document-type'],
      'not-applicable', '14º, excepción b)', 'Rige la identificación específica del retenido.');
    noThreshold('La identificación del retenido no depende del importe.');
  } else if (ticket && consumer === true && exporting === true && value(f.operationType) === 'services') {
    if (!date || date < receiverAmendmentPublished) return defer('Fecha fuera del período cubierto para la excepción de exportación de servicios.');
    result.branch = 'export';
    set(['recipient.name', 'recipient.address'], 'required', '14º, excepción a)', 'Exportación de servicios documentada mediante e-Ticket.');
    set(['recipient.label', 'recipient.boundary', 'recipient.document', 'recipient.country', 'recipient.document-type'],
      'not-applicable', '14º, excepción a)', 'La excepción sustituye las exigencias de los ordinales 11 y 12.');
    noThreshold('Rige la identificación específica de exportación.');
  } else if (ticket && consumer === true && exporting === false && foreign !== undefined) {
    if (foreign && individual !== false) return defer('Falta confirmar que el receptor sea una entidad no residente sin RUT.');
    if (foreign && (!date || date < receiverAmendmentPublished)) return defer('Fecha fuera del período cubierto para la excepción de no residentes.');
    result.branch = foreign ? 'nonresident' : 'final-consumer';
    if (foreign) {
      result.alternative = { anyOf: [['recipient.label', 'recipient.boundary'], ['recipient.name', 'recipient.address']],
        basis: basis('14º, excepción para entidades no residentes sin RUT (2886/014, numeral 5)', receiverAmendmentPublished) };
      set(['recipient.name', 'recipient.address', 'recipient.label', 'recipient.boundary'], 'pending',
        result.alternative.basis.reference, 'Alternativa normativa: rótulo y recuadro, o nombre y domicilio.');
      for (const row of fields.filter(field => result.alternative!.anyOf.some(group => group.includes(field.role)))) {
        row.basis = result.alternative.basis;
        if (row.role === 'recipient.label') row.expected = 'CONSUMO FINAL';
      }
    } else {
      setLabel('CONSUMO FINAL', '14º.11');
      set(['recipient.name', 'recipient.address'], 'optional', '14º.11–12', 'Nombre y domicilio no son universales en consumo final.');
    }
    result.threshold = receiverThreshold(context);
    const thresholdFields: ReceiverRole[] = ['recipient.document', 'recipient.country'];
    const reference = '14º.12; tabla E del Formato CFE 25.2';
    const withholdingRuleInPeriod = !!date && date >= receiverAmendmentPublished;
    if ((withholdingRuleInPeriod && withholding === true) || result.threshold.exceeded === true)
      set(thresholdFields, 'required', reference, 'Documento y país por retenciones, percepciones o umbral superado.');
    else if (result.threshold.exceeded === false && withholding === false)
      set(thresholdFields, 'optional', reference, 'Sin retenciones ni percepciones y con umbral no superado.');
    else set(thresholdFields, 'pending', reference, withholding === true && !withholdingRuleInPeriod
      ? 'Falta una fecha dentro del período cubierto para la condición de retenciones o percepciones.'
      : result.threshold.status === 'pending' ? result.threshold.reason : 'Falta resolver retenciones o percepciones.');
    for (const row of fields.filter(field => thresholdFields.includes(field.role))) {
      Object.assign(row.facts, facts(['currency', 'netAmount', 'uiValue', 'uiValueDate', 'uiValueSource']));
      if (withholdingRuleInPeriod && withholding === true) {
        row.basis = basis('14º.12, retenciones o percepciones (2886/014, numeral 4)', receiverAmendmentPublished);
      } else if (result.threshold.limit) {
        row.basis = basis(reference, result.threshold.limit === 5000 ? thresholdReduction : thresholdStart);
      }
    }
    set(['recipient.document-type'], 'optional', '14º.12', 'El ordinal 12 exige número y país cuando corresponda.');
  }
  if (exporting === true) for (const row of fields) row.facts.operationType = f.operationType;
  if (result.branch === 'unresolved') return defer('Falta resolver la modalidad de la operación para este tipo de CFE.');

  for (const row of fields) {
    if (result.branch === 'export' || result.branch === 'withholding')
      row.basis = basis(row.basis.reference + ' (2886/014, numeral 5)', receiverAmendmentPublished);
    if (row.applicability === 'not-applicable' || row.applicability === 'optional') {
      row.repetition = 'not-applicable';
      continue;
    }
    const alternative = result.alternative?.anyOf.some(group => group.includes(row.role));
    if (row.applicability !== 'required' && !alternative) continue;
    if (secrecy === undefined || (secrecy && (!date || date < secrecyAmendmentPublished))) {
      row.reason += ' Falta resolver si la identificación puede trasladarse a adenda en la fecha del CFE.';
      continue;
    }
    const ticketIdentity = ticket && ['recipient.document', 'recipient.country'].includes(row.role);
    if (ticketIdentity && date && date < receiverAmendmentPublished) {
      row.reason += ' Ubicación histórica del ordinal 12 pendiente de revisión.';
      continue;
    }
    row.locations = secrecy ? ['receiver-zone', 'adenda'] : ['receiver-zone'];
    row.locationBasis = secrecy ? date! >= adendaAmendmentPublished
      ? basis('13º.J y 14º, secreto profesional y adenda (1264/023)', adendaAmendmentPublished)
      : basis('13º.J y 14º, secreto profesional (780/019, numerales 1 y 2)', secrecyAmendmentPublished) : row.basis;
    row.locationReference = row.locationBasis.reference;
    const repeat = (result.branch === 'ruc-buyer' && ['recipient.name', 'recipient.document'].includes(row.role)) ||
      ticketIdentity;
    const unidentifiedTicketDocument = ticketIdentity && hasUnidentifiedTicketDocument(context);
    row.repetition = secrecy || alternative || unidentifiedTicketDocument || (repeat && (!date || date < multipageAmendmentPublished))
      ? 'pending' : repeat ? 'each-cfe-page' : 'document';
    if (secrecy || repeat) {
      row.repetitionReference = '14º, representación en varias hojas';
    }
  }
  return result;
}
