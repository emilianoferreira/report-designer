import { CFE_TYPES, FiscalProfile } from '../../../core/models/fiscal.model';
import { InvoiceData } from '../../../core/models/template.model';
import { SAMPLE_INVOICE_DATA, SAMPLE_INVOICE_MULTILINE } from './sample-invoice';

/** Explicit fictitious test case. Never supplements a real invoice. */
export function sampleFiscalInvoice(profile: FiscalProfile | undefined, multiline: boolean): InvoiceData {
  const base = multiline ? SAMPLE_INVOICE_MULTILINE : SAMPLE_INVOICE_DATA;
  const kind = CFE_TYPES.find(type => type.value === profile?.cfeType) ?? CFE_TYPES[3];
  const finalConsumer = kind.value < 110;
  const number = base.invoice['Numero'];
  const total = (base.Total ?? 0).toFixed(2);
  const hash = 'A'.repeat(64);
  const issuerRut = base.company['RUT'];
  const signatureDate = '2026-02-25';
  const qrPayload = 'https://www.efactura.dgi.gub.uy/consultaQR/cfe?' +
    [issuerRut.replace(/\D/g, ''), kind.value, number.Serie, number.Numero, total, '25/02/2026', hash].join(',');
  return {
    ...base, isCFE: true, isConsumoFinal: finalConsumer,
    CFE: { ...base.CFE, TipoComprobanteFiscal: { Nombre: kind.label }, CodSeguridad: hash.slice(0, 6) },
    fiscal: {
      schemaVersion: '1.0', isCfe: true, cfeType: kind.value, finalConsumer,
      issuerRegime: profile?.issuerRegime ?? 'general',
      operationType: profile?.operationType ?? 'goods',
      signatureDate, signatureHash: hash, qrPayload, totalAmount: total, totalPayable: total,
      series: number.Serie, number: String(number.Numero), hasWithholdingsOrPerceptions: false,
      ownCollection: false, thirdPartyCollection: false,
      references: kind.value % 10 === 1 ? [] : [{ cfeType: finalConsumer ? 101 : 111, series: 'A', number: '15', reason: 'Ajuste de ejemplo' }]
    }
  };
}
