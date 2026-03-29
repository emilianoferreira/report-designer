-- ============================================================================
-- Zureo Report Designer - Datos de Prueba
-- ============================================================================

-- ─── MONEDAS ───
INSERT INTO currencies (id, iso4217, simbolo, nombre, decimales) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'UYU', '$',   'Peso Uruguayo', 2),
  ('a1000000-0000-0000-0000-000000000002', 'USD', 'US$', 'Dólar Americano', 2),
  ('a1000000-0000-0000-0000-000000000003', 'EUR', '€',   'Euro', 2);

-- ─── EMPRESA DEMO ───
INSERT INTO companies (id, nombre, nombre_comercial, rut, direccion, ciudad, telefono, email, parametros) VALUES
  ('c1000000-0000-0000-0000-000000000001',
   'Soluciones Tech S.A.',
   'SolTech',
   '21-654321-0001',
   'Bulevar Artigas 1250',
   'Montevideo',
   '(02) 123-4567',
   'info@soltech.com.uy',
   '{
     "EFA_Emisor_Nombre": "Soluciones Tech S.A.",
     "EFA_Emisor_NComercial": "SolTech",
     "EFA_Emisor_RUT": "21-654321-0001",
     "EFA_Emisor_Direccion": "Bulevar Artigas 1250",
     "EFA_Emisor_Ciudad": "Montevideo",
     "EFA_Resolucion": "Res. DGI 1234/2025"
   }');

-- Segunda empresa
INSERT INTO companies (id, nombre, nombre_comercial, rut, direccion, ciudad, telefono, email, parametros) VALUES
  ('c1000000-0000-0000-0000-000000000002',
   'Distribuidora del Este S.R.L.',
   'DistEste',
   '21-987654-0002',
   'Av. Italia 3456',
   'Maldonado',
   '(042) 22-3344',
   'ventas@disteste.com.uy',
   '{
     "EFA_Emisor_Nombre": "Distribuidora del Este S.R.L.",
     "EFA_Emisor_NComercial": "DistEste",
     "EFA_Emisor_RUT": "21-987654-0002",
     "EFA_Emisor_Direccion": "Av. Italia 3456",
     "EFA_Emisor_Ciudad": "Maldonado",
     "EFA_Resolucion": ""
   }');

-- ─── SUCURSALES ───
INSERT INTO branches (id, company_id, nombre, direccion, es_principal) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Casa Central',  'Bulevar Artigas 1250', TRUE),
  ('b1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Sucursal Pocitos', 'Av. Brasil 2890', FALSE),
  ('b1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000002', 'Casa Central',  'Av. Italia 3456', TRUE);

-- ─── CONTACTOS (Empresa 1) ───
INSERT INTO contacts (id, company_id, guardar_como, rut, direccion, ciudad, tipo) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Juan Pérez',       '1.234.567-8', 'Colonia 1234 Apto 5', 'Montevideo', 'cliente'),
  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'María García S.A.', '21-111222-0005', 'Rambla Wilson 800', 'Montevideo', 'cliente'),
  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'Importadora Norte', '21-333444-0008', 'Ruta 5 km 510',   'Rivera',      'cliente'),
  ('d1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'Consumidor Final',  '',               '',                 '',            'cliente');

-- ─── CONTACTOS (Empresa 2) ───
INSERT INTO contacts (id, company_id, guardar_como, rut, direccion, ciudad, tipo) VALUES
  ('d1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002', 'Hotel Playa Brava',  '21-555666-0010', 'Parada 10 Playa Brava', 'Punta del Este', 'cliente'),
  ('d1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000002', 'Restaurante El Mar', '21-777888-0011', 'Puerto de Punta del Este', 'Maldonado', 'cliente');

-- ─── TIPOS DE COMPROBANTE ───
INSERT INTO invoice_types (id, company_id, nombre, codigo, opera_contado, es_cfe) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Venta Contado',  'VC',  TRUE,  FALSE),
  ('e1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Venta Crédito',  'VCR', FALSE, FALSE),
  ('e1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'e-Factura',      'EF',  TRUE,  TRUE),
  ('e1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'Venta Contado',  'VC',  TRUE,  FALSE),
  ('e1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002', 'e-Ticket',       'ET',  TRUE,  TRUE);

-- ─── ARTICULOS (Empresa 1: tech) ───
INSERT INTO articles (id, company_id, codigo, nombre, precio, precio_neto, iva_tasa) VALUES
  ('aa000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'NB-001', 'Notebook Lenovo ThinkPad',  45000.00, 36885.25, 22.00),
  ('aa000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'MO-001', 'Monitor 27" Samsung 4K',     18500.00, 15163.93, 22.00),
  ('aa000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'TE-001', 'Teclado mecánico Logitech',   4200.00,  3442.62, 22.00),
  ('aa000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'MU-001', 'Mouse inalámbrico',           1800.00,  1475.41, 22.00),
  ('aa000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'SV-001', 'Servicio Consultoría (hora)',  3500.00,  2868.85, 22.00),
  ('aa000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000001', 'LI-001', 'Licencia Software Anual',      9600.00,  7868.85, 22.00),
  ('aa000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000001', 'CA-001', 'Cable HDMI 2m',                 350.00,   286.89, 22.00),
  ('aa000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000001', 'WC-001', 'Webcam HD 1080p',              2800.00,  2295.08, 22.00);

-- ─── ARTICULOS (Empresa 2: distribuidora) ───
INSERT INTO articles (id, company_id, codigo, nombre, precio, precio_neto, iva_tasa) VALUES
  ('aa000000-0000-0000-0000-000000000010', 'c1000000-0000-0000-0000-000000000002', 'BEB-001', 'Agua mineral 1.5L',        65.00,  53.28, 22.00),
  ('aa000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000002', 'BEB-002', 'Refresco Cola 2L',         120.00,  98.36, 22.00),
  ('aa000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000002', 'ALI-001', 'Aceite de Oliva 500ml',    380.00, 311.48, 22.00),
  ('aa000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000002', 'ALI-002', 'Arroz 1kg',                 85.00,  69.67, 22.00),
  ('aa000000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000002', 'LIM-001', 'Detergente líquido 1L',    220.00, 180.33, 22.00);

-- ============================================================================
-- COMPROBANTES DE PRUEBA
-- ============================================================================

-- ─── Factura 1: Venta contado simple, consumidor final ───
INSERT INTO invoices (id, company_id, branch_id, type_id, currency_id, serie, numero, fecha,
  subtotal, total, is_imp_incluidos, is_consumo_final, comentario)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'A', 1,
  '2026-03-15 10:30:00-03',
  3688.52, 4500.00, TRUE, TRUE,
  ''
);

INSERT INTO invoice_lines (invoice_id, article_id, linea_nro, articulo_codigo, articulo_nombre, cantidad, precio_unitario, precio_unitario_neto, descuento, subtotal) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000003', 1, 'TE-001', 'Teclado mecánico Logitech', 1, 4200.00, 3442.62, 0, 4200.00),
  ('f1000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000007', 2, 'CA-001', 'Cable HDMI 2m', 1, 350.00, 286.89, 50.00, 300.00);

INSERT INTO invoice_taxes (invoice_id, nombre, tasa, valor) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'IVA Tasa Básica', 22.00, 811.48);

-- ─── Factura 2: Venta crédito con cliente, varios artículos ───
INSERT INTO invoices (id, company_id, branch_id, type_id, contact_id, currency_id, serie, numero, fecha,
  subtotal, total, is_imp_incluidos, is_consumo_final, comentario)
VALUES (
  'f1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  'A', 2,
  '2026-03-18 14:15:00-03',
  56557.38, 68999.00, TRUE, FALSE,
  'Entrega en oficina central, horario de 9 a 17hs.'
);

INSERT INTO invoice_lines (invoice_id, article_id, linea_nro, articulo_codigo, articulo_nombre, cantidad, precio_unitario, precio_unitario_neto, descuento, subtotal) VALUES
  ('f1000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', 1, 'NB-001', 'Notebook Lenovo ThinkPad', 1, 45000.00, 36885.25, 0, 45000.00),
  ('f1000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', 2, 'MO-001', 'Monitor 27" Samsung 4K', 1, 18500.00, 15163.93, 0, 18500.00),
  ('f1000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000004', 3, 'MU-001', 'Mouse inalámbrico', 2, 1800.00, 1475.41, 0, 3600.00),
  ('f1000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000008', 4, 'WC-001', 'Webcam HD 1080p', 1, 2800.00, 2295.08, 901.00, 1899.00);

INSERT INTO invoice_taxes (invoice_id, nombre, tasa, valor) VALUES
  ('f1000000-0000-0000-0000-000000000002', 'IVA Tasa Básica', 22.00, 12441.62);

-- ─── Factura 3: Servicios con descuento global ───
INSERT INTO invoices (id, company_id, branch_id, type_id, contact_id, currency_id, serie, numero, fecha,
  subtotal, total, porcentaje_desc_global, monto_dto_global, is_imp_incluidos, is_consumo_final, comentario)
VALUES (
  'f1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000002',
  'e1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000001',
  'A', 3,
  '2026-03-20 09:00:00-03',
  19836.07, 22900.00, 5, 1205.26, TRUE, FALSE,
  'Consultoría Q1 2026 - Proyecto migración cloud'
);

INSERT INTO invoice_lines (invoice_id, article_id, linea_nro, articulo_codigo, articulo_nombre, cantidad, precio_unitario, precio_unitario_neto, descuento, subtotal) VALUES
  ('f1000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000005', 1, 'SV-001', 'Servicio Consultoría (hora)', 4, 3500.00, 2868.85, 0, 14000.00),
  ('f1000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000006', 2, 'LI-001', 'Licencia Software Anual', 1, 9600.00, 7868.85, 0, 9600.00),
  ('f1000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000007', 3, 'CA-001', 'Cable HDMI 2m', 2, 350.00, 286.89, 0, 700.00);

INSERT INTO invoice_taxes (invoice_id, nombre, tasa, valor) VALUES
  ('f1000000-0000-0000-0000-000000000003', 'IVA Tasa Básica', 22.00, 4363.93);

-- ─── Factura 4: Empresa 2, distribuidora ───
INSERT INTO invoices (id, company_id, branch_id, type_id, contact_id, currency_id, serie, numero, fecha,
  subtotal, total, is_imp_incluidos, is_consumo_final, comentario)
VALUES (
  'f1000000-0000-0000-0000-000000000004',
  'c1000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000003',
  'e1000000-0000-0000-0000-000000000004',
  'd1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000001',
  'A', 1,
  '2026-03-22 16:45:00-03',
  7672.13, 9360.00, TRUE, FALSE,
  'Pedido semanal - Entrega en recepción'
);

INSERT INTO invoice_lines (invoice_id, article_id, linea_nro, articulo_codigo, articulo_nombre, cantidad, precio_unitario, precio_unitario_neto, descuento, subtotal) VALUES
  ('f1000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000010', 1, 'BEB-001', 'Agua mineral 1.5L',    48, 65.00,  53.28, 0, 3120.00),
  ('f1000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000011', 2, 'BEB-002', 'Refresco Cola 2L',      24, 120.00, 98.36, 0, 2880.00),
  ('f1000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000012', 3, 'ALI-001', 'Aceite de Oliva 500ml', 6,  380.00, 311.48, 0, 2280.00),
  ('f1000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000013', 4, 'ALI-002', 'Arroz 1kg',             12, 85.00,  69.67, 0, 1020.00),
  ('f1000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000014', 5, 'LIM-001', 'Detergente líquido 1L', 3,  220.00, 180.33, 60.00, 600.00);

INSERT INTO invoice_taxes (invoice_id, nombre, tasa, valor) VALUES
  ('f1000000-0000-0000-0000-000000000004', 'IVA Tasa Básica', 22.00, 1687.87);

-- ─── Factura 5: USD, con redondeo ───
INSERT INTO invoices (id, company_id, branch_id, type_id, contact_id, currency_id, serie, numero, fecha,
  subtotal, total, tipo_cambio, redondeo, is_imp_incluidos, is_consumo_final, comentario)
VALUES (
  'f1000000-0000-0000-0000-000000000005',
  'c1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'B', 1,
  '2026-03-25 11:20:00-03',
  1065.57, 1299.99, 42.50, -0.01, TRUE, FALSE,
  ''
);

INSERT INTO invoice_lines (invoice_id, article_id, linea_nro, articulo_codigo, articulo_nombre, cantidad, precio_unitario, precio_unitario_neto, descuento, subtotal) VALUES
  ('f1000000-0000-0000-0000-000000000005', 'aa000000-0000-0000-0000-000000000001', 1, 'NB-001', 'Notebook Lenovo ThinkPad', 1, 1299.99, 1065.57, 0, 1299.99);

INSERT INTO invoice_taxes (invoice_id, nombre, tasa, valor) VALUES
  ('f1000000-0000-0000-0000-000000000005', 'IVA Tasa Básica', 22.00, 234.43);
