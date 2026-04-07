-- ============================================================================
-- Zureo Report Designer - Database Schema
-- BD: bd_dis_reportes
-- ============================================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- EMPRESAS (multi-tenant)
-- ============================================================================
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre        VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200),
  rut           VARCHAR(30) NOT NULL,
  direccion     VARCHAR(300),
  ciudad        VARCHAR(100),
  telefono      VARCHAR(50),
  email         VARCHAR(200),
  logo_url      TEXT,
  parametros    JSONB DEFAULT '{}',
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SUCURSALES
-- ============================================================================
CREATE TABLE branches (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  nombre        VARCHAR(200) NOT NULL,
  direccion     VARCHAR(300),
  telefono      VARCHAR(50),
  es_principal  BOOLEAN DEFAULT FALSE,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CONTACTOS (clientes/proveedores)
-- ============================================================================
CREATE TABLE contacts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  guardar_como  VARCHAR(200) NOT NULL,
  rut           VARCHAR(30),
  direccion     VARCHAR(300),
  ciudad        VARCHAR(100),
  telefono      VARCHAR(50),
  email         VARCHAR(200),
  tipo          VARCHAR(20) DEFAULT 'cliente',  -- cliente, proveedor, ambos
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- MONEDAS
-- ============================================================================
CREATE TABLE currencies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  iso4217       VARCHAR(3) NOT NULL UNIQUE,
  simbolo       VARCHAR(5) NOT NULL,
  nombre        VARCHAR(50) NOT NULL,
  decimales     INT DEFAULT 2
);

-- ============================================================================
-- TIPOS DE COMPROBANTE
-- ============================================================================
CREATE TABLE invoice_types (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  nombre        VARCHAR(100) NOT NULL,
  codigo        VARCHAR(10),
  opera_contado BOOLEAN DEFAULT TRUE,
  es_cfe        BOOLEAN DEFAULT FALSE,
  activo        BOOLEAN DEFAULT TRUE
);

-- ============================================================================
-- ARTICULOS
-- ============================================================================
CREATE TABLE articles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  codigo        VARCHAR(50) NOT NULL,
  nombre        VARCHAR(200) NOT NULL,
  precio        NUMERIC(15,2) DEFAULT 0,
  precio_neto   NUMERIC(15,2) DEFAULT 0,
  iva_tasa      NUMERIC(5,2) DEFAULT 22.00,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- COMPROBANTES (facturas, tickets, etc.)
-- ============================================================================
CREATE TABLE invoices (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  branch_id     UUID REFERENCES branches(id),
  type_id       UUID NOT NULL REFERENCES invoice_types(id),
  contact_id    UUID REFERENCES contacts(id),
  currency_id   UUID NOT NULL REFERENCES currencies(id),

  -- Numeracion
  serie         VARCHAR(5) DEFAULT 'A',
  numero        INT NOT NULL,

  -- Fechas
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Montos
  subtotal      NUMERIC(15,2) DEFAULT 0,
  total         NUMERIC(15,2) DEFAULT 0,
  tipo_cambio   NUMERIC(10,4) DEFAULT 1,
  porcentaje_desc_global NUMERIC(5,2) DEFAULT 0,
  monto_dto_global NUMERIC(15,2) DEFAULT 0,
  redondeo      NUMERIC(15,2) DEFAULT 0,

  -- Flags
  is_imp_incluidos  BOOLEAN DEFAULT TRUE,
  is_consumo_final  BOOLEAN DEFAULT TRUE,

  -- Otros
  comentario    TEXT DEFAULT '',
  direccion_factura VARCHAR(300),

  -- CFE (factura electronica)
  cae_identificador VARCHAR(50),
  cae_desde     VARCHAR(20),
  cae_hasta     VARCHAR(20),
  cae_fecha_vto DATE,
  cfe_cod_seguridad VARCHAR(20),
  cfe_adenda    TEXT,

  estado        VARCHAR(20) DEFAULT 'emitido',  -- emitido, anulado
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- LINEAS DE COMPROBANTE
-- ============================================================================
CREATE TABLE invoice_lines (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  article_id    UUID REFERENCES articles(id),
  linea_nro     INT NOT NULL DEFAULT 1,

  -- Datos del articulo (snapshot al momento de facturar)
  articulo_codigo   VARCHAR(50),
  articulo_nombre   VARCHAR(200),

  cantidad      NUMERIC(15,4) DEFAULT 1,
  precio_unitario   NUMERIC(15,2) DEFAULT 0,
  precio_unitario_neto NUMERIC(15,2) DEFAULT 0,
  descuento     NUMERIC(15,2) DEFAULT 0,
  subtotal      NUMERIC(15,2) DEFAULT 0,
  iva_tasa      NUMERIC(5,2) DEFAULT 22.00,

  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- IMPUESTOS DEL COMPROBANTE
-- ============================================================================
CREATE TABLE invoice_taxes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  nombre        VARCHAR(100) NOT NULL,
  tasa          NUMERIC(5,2) DEFAULT 0,
  valor         NUMERIC(15,2) DEFAULT 0
);

-- ============================================================================
-- PLANTILLAS DE REPORTE (el JSON del diseñador)
-- ============================================================================
CREATE TABLE report_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  nombre        VARCHAR(200) NOT NULL,
  descripcion   TEXT,
  version       INT DEFAULT 1,
  autor         VARCHAR(100),
  tags          TEXT[] DEFAULT '{}',
  estado        VARCHAR(20) DEFAULT 'draft',  -- draft, published, archived
  template_json JSONB NOT NULL,               -- el ReportTemplate completo
  based_on      UUID REFERENCES report_templates(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDICES
-- ============================================================================
CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_fecha ON invoices(fecha);
CREATE INDEX idx_invoices_contact ON invoices(contact_id);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_articles_company ON articles(company_id);
CREATE INDEX idx_templates_company ON report_templates(company_id);
CREATE INDEX idx_templates_estado ON report_templates(estado);
CREATE INDEX idx_branches_company ON branches(company_id);

-- Indice GIN para busqueda en JSONB
CREATE INDEX idx_templates_json ON report_templates USING GIN (template_json);
