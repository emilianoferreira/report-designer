import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('InvoicesController (e2e)', () => {
  let app: INestApplication;
  const COMPANY_1 = 'c1000000-0000-0000-0000-000000000001'; // Soluciones Tech
  const COMPANY_2 = 'c1000000-0000-0000-0000-000000000002'; // Distribuidora del Este

  // Known invoice IDs from seed
  const INV_SIMPLE       = 'f1000000-0000-0000-0000-000000000001'; // Venta contado simple
  const INV_CREDITO      = 'f1000000-0000-0000-0000-000000000002'; // Con cliente y varias lineas
  const INV_DTO_GLOBAL   = 'f1000000-0000-0000-0000-000000000003'; // Con dto global 5%
  const INV_DISTRIBUIDORA = 'f1000000-0000-0000-0000-000000000004'; // Empresa 2
  const INV_USD          = 'f1000000-0000-0000-0000-000000000005'; // En USD con redondeo

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── GET /api/invoices ───

  it('GET /api/invoices → lists invoices for company 1', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/invoices')
      .query({ companyId: COMPANY_1 })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3); // at least 3 invoices for company 1

    const inv = res.body[0];
    expect(inv).toHaveProperty('id');
    expect(inv).toHaveProperty('serie');
    expect(inv).toHaveProperty('numero');
    expect(inv).toHaveProperty('fecha');
    expect(inv).toHaveProperty('total');
  });

  it('GET /api/invoices → lists invoices for company 2', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/invoices')
      .query({ companyId: COMPANY_2 })
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  // ─── GET /api/invoices/:id/data ─── InvoiceData structure tests ───

  it('GET /api/invoices/:id/data → returns InvoiceData for simple invoice (consumidor final)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/invoices/${INV_SIMPLE}/data`)
      .expect(200);

    const data = res.body;

    // Top-level structure
    expect(data).toHaveProperty('invoice');
    expect(data).toHaveProperty('invoiceLines');
    expect(data).toHaveProperty('company');
    expect(data).toHaveProperty('Moneda');
    expect(data).toHaveProperty('Contacto');
    expect(data).toHaveProperty('Articulos');
    expect(data).toHaveProperty('Impuestos');
    expect(data).toHaveProperty('Subtotal');
    expect(data).toHaveProperty('Total');

    // Invoice sub-object
    expect(data.invoice).toHaveProperty('Tipo');
    expect(data.invoice).toHaveProperty('Numero');
    expect(data.invoice).toHaveProperty('Fecha');
    expect(data.invoice).toHaveProperty('Empresa');
    expect(data.invoice.Tipo).toHaveProperty('Nombre');
    expect(data.invoice.Numero).toHaveProperty('Serie');
    expect(data.invoice.Numero).toHaveProperty('Numero');

    // Company
    expect(data.company).toHaveProperty('Nombre');
    expect(data.company).toHaveProperty('RUT');
    expect(data.company.Nombre).toBe('Soluciones Tech S.A.');

    // Currency should be UYU
    expect(data.Moneda.ISO4217).toBe('UYU');
    expect(data.Moneda.Simbolo).toBe('$');

    // Consumidor final → no contact
    expect(data.hasContacto).toBe(false);
    expect(data.Contacto.GuardarComo).toBe('');

    // Should have invoice lines
    expect(Array.isArray(data.invoiceLines)).toBe(true);
    expect(data.invoiceLines.length).toBeGreaterThan(0);

    // Each line should have the expected structure
    const line = data.invoiceLines[0];
    expect(line).toHaveProperty('Articulo');
    expect(line.Articulo).toHaveProperty('Codigo');
    expect(line.Articulo).toHaveProperty('Nombre');
    expect(line).toHaveProperty('Cantidad');
    expect(line).toHaveProperty('PrecioUnitario');
    expect(line).toHaveProperty('SubTotal');

    // Taxes
    expect(Array.isArray(data.Impuestos)).toBe(true);
    expect(data.Impuestos.length).toBeGreaterThan(0);
    expect(data.Impuestos[0]).toHaveProperty('Nombre');
    expect(data.Impuestos[0]).toHaveProperty('Valor');

    // Numeric totals should be numbers
    expect(typeof data.Subtotal).toBe('number');
    expect(typeof data.Total).toBe('number');
    expect(data.Total).toBeGreaterThan(0);

    // Flags
    expect(typeof data.isCFE).toBe('boolean');
    expect(typeof data.isConsumoFinal).toBe('boolean');
    expect(typeof data.isImpIncluidos).toBe('boolean');
    expect(typeof data.hasDtoGlobal).toBe('boolean');
    expect(typeof data.hasRedondeo).toBe('boolean');
  });

  it('GET /api/invoices/:id/data → invoice with contact (crédito)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/invoices/${INV_CREDITO}/data`)
      .expect(200);

    const data = res.body;

    // Should have contact
    expect(data.hasContacto).toBe(true);
    expect(data.Contacto.GuardarComo).toBeTruthy();

    // Should have multiple lines
    expect(data.invoiceLines.length).toBeGreaterThanOrEqual(4);

    // Invoice type should be crédito
    expect(data.invoice.Tipo.Clasificacion.OperaContado).toBe(false);
  });

  it('GET /api/invoices/:id/data → invoice with global discount', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/invoices/${INV_DTO_GLOBAL}/data`)
      .expect(200);

    const data = res.body;

    expect(data.hasDtoGlobal).toBe(true);
    expect(data.invoice.PorcentajeDescGlobal).toBeGreaterThan(0);
    expect(data.MontoDtoGlobal).toBeGreaterThan(0);

    // Discount amount should reduce the total compared to full price
    expect(data.MontoDtoGlobal).toBeGreaterThan(0);
  });

  it('GET /api/invoices/:id/data → invoice in USD with rounding', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/invoices/${INV_USD}/data`)
      .expect(200);

    const data = res.body;

    // Currency should be USD
    expect(data.Moneda.ISO4217).toBe('USD');
    expect(data.Moneda.Simbolo).toBe('US$');

    // Should have exchange rate > 1
    expect(data.invoice.TipoCambio).toBeGreaterThan(1);

    // Should have rounding
    expect(data.hasRedondeo).toBe(true);
    expect(data.Redondeo).not.toBe(0);
  });

  it('GET /api/invoices/:id/data → invoice from second company', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/invoices/${INV_DISTRIBUIDORA}/data`)
      .expect(200);

    const data = res.body;

    // Different company
    expect(data.company.Nombre).toBe('Distribuidora del Este S.R.L.');
    expect(data.company.RUT).toBeTruthy();
  });

  // ─── Error cases ───

  it('GET /api/invoices/:id/data → 404 for non-existent invoice', async () => {
    await request(app.getHttpServer())
      .get('/api/invoices/00000000-0000-0000-0000-000000000000/data')
      .expect(404);
  });

  // ─── InvoiceData ↔ Frontend interface consistency ───

  it('InvoiceData contains all fields expected by HtmlRendererService', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/invoices/${INV_CREDITO}/data`)
      .expect(200);

    const data = res.body;

    // These are the exact keys the HtmlRendererService reads from InvoiceData
    const requiredTopLevelKeys = [
      'invoice',
      'invoiceLines',
      'company',
      'Moneda',
      'Contacto',
      'CFE',
      'Articulos',
      'Impuestos',
      'SubtotalesDesglosados',
      'Subtotal',
      'Total',
      'Redondeo',
      'MontoDtoGlobal',
      'isCFE',
      'isConsumoFinal',
      'isImpIncluidos',
      'hasContacto',
      'hasDtoGlobal',
      'hasRedondeo',
      'logoBase64',
      'QRBase64',
    ];

    for (const key of requiredTopLevelKeys) {
      expect(data).toHaveProperty(key);
    }

    // Invoice sub-fields
    const invoiceKeys = [
      'Tipo', 'Numero', 'Fecha', 'Comentario', 'TipoCambio',
      'PorcentajeDescGlobal', 'DireccionFactura', 'Empresa', 'Sucursal',
    ];
    for (const key of invoiceKeys) {
      expect(data.invoice).toHaveProperty(key);
    }

    // Numero sub-fields
    const numeroKeys = ['Serie', 'Numero', 'CAEIdentificador', 'CAEDesde', 'CAEHasta', 'CAEFechaVto'];
    for (const key of numeroKeys) {
      expect(data.invoice.Numero).toHaveProperty(key);
    }
  });
});
