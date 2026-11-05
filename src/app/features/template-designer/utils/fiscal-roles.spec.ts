import { createElement } from './element-factory';
import { suggestFiscalRoles } from './fiscal-roles';

describe('Fiscal role suggestions', () => {
  it('suggests an exact binding without editing the element', () => {
    const element = { ...createElement('dataField'), type: 'dataField' as const,
      binding: { source: 'invoice.Empresa.Parametros.EFA_Emisor_RUT' } };
    const before = JSON.stringify(element);
    expect(suggestFiscalRoles(element)).toEqual(['issuer.rut']);
    expect(JSON.stringify(element)).toBe(before);
    expect(suggestFiscalRoles({ ...element, fiscalRoles: ['issuer.rut'] })).toEqual([]);
  });
  it('does not infer roles from arbitrary text, element names, formulas or a generic QR', () => {
    expect(suggestFiscalRoles({ ...createElement('text'), name: 'RUT del emisor' })).toEqual([]);
    expect(suggestFiscalRoles(createElement('formula'))).toEqual([]);
    expect(suggestFiscalRoles(createElement('qrCode'))).toEqual([]);
  });
  it('only suggests the DGI QR for an explicit fiscal payload binding on a QR element', () => {
    expect(suggestFiscalRoles({ ...createElement('qrCode'), type: 'qrCode', dataBinding: 'fiscal.qrPayload', errorCorrection: 'M' })).toEqual(['security.qr']);
    expect(suggestFiscalRoles({ ...createElement('dataField'), type: 'dataField', binding: { source: 'fiscal.qrPayload' } })).toEqual([]);
  });
  it('does not treat inherited object properties as recognized bindings', () => {
    for (const source of ['constructor', 'fiscal.__proto__']) {
      expect(suggestFiscalRoles({ ...createElement('dataField'), type: 'dataField', binding: { source } })).toEqual([]);
    }
  });
});
