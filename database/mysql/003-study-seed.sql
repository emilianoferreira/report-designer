-- Study-only subset of database/002-seed.sql, with explicit MySQL UUIDs and UTC.
-- Apply once to the NEW, EMPTY study schema, after 001 and 002. No real data.
START TRANSACTION;
INSERT INTO companies(id,nombre,nombre_comercial,rut,direccion,ciudad,email,parametros) VALUES
('c1000000-0000-0000-0000-000000000001','Laboratorio A (sintético)','Laboratorio A','DEMO-A','Dirección de ejemplo','Montevideo','a@example.test','{"entorno":"estudio"}'),
('c1000000-0000-0000-0000-000000000002','Laboratorio B (sintético)','Laboratorio B','DEMO-B','Dirección de ejemplo','Montevideo','b@example.test','{}');
INSERT INTO currencies(id,iso4217,simbolo,nombre) VALUES
('a1000000-0000-0000-0000-000000000001','UYU','$','Peso Uruguayo');
INSERT INTO branches(id,company_id,nombre,direccion) VALUES
('b1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Sucursal de estudio','Dirección sintética');
INSERT INTO contacts(id,company_id,guardar_como,rut) VALUES
('d1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Cliente de prueba','DEMO-CLIENTE');
INSERT INTO invoice_types(id,company_id,nombre,codigo,opera_contado,es_cfe) VALUES
('e1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Venta Contado','VC',TRUE,FALSE);
INSERT INTO articles(id,company_id,codigo,nombre,precio,precio_neto,iva_tasa) VALUES
('aa000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','DEMO-01','Artículo sintético',122.00,100.00,22.00);
INSERT INTO invoices(id,company_id,branch_id,type_id,contact_id,currency_id,serie,numero,fecha,subtotal,total,is_imp_incluidos,is_consumo_final,comentario) VALUES
('f1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','A',1,'2026-03-15 13:30:00.000000',100.00,122.00,TRUE,FALSE,'Comprobante sintético para debugging. Sin validez fiscal.');
INSERT INTO invoice_lines(id,invoice_id,article_id,linea_nro,articulo_codigo,articulo_nombre,cantidad,precio_unitario,precio_unitario_neto,descuento,subtotal) VALUES
('f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001',1,'DEMO-01','Artículo sintético',1,122.00,100.00,0,122.00);
INSERT INTO invoice_taxes(id,invoice_id,nombre,tasa,valor) VALUES
('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','IVA Tasa Básica',22.00,22.00);
COMMIT;
