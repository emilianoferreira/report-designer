-- A4: explicit creation in an EMPTY MySQL 8.4 database; never run by API startup.
-- DDL is not transactional. Inspect failed creation before removing only owned test resources.
-- LONGTEXT follows A3 precision evidence; business persistence is deferred to A5.
-- ============================================================================
-- Report Designer - Database Schema
-- Target database is selected explicitly by the operator.
-- ============================================================================

-- IDs must be supplied explicitly as canonical UUIDs (Guid.NewGuid in .NET); no UUID v1 default.

-- ============================================================================
-- EMPRESAS (multi-tenant)
-- ============================================================================
CREATE TABLE companies (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  nombre        VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200),
  rut           VARCHAR(30) NOT NULL,
  direccion     VARCHAR(300),
  ciudad        VARCHAR(100),
  telefono      VARCHAR(50),
  email         VARCHAR(200),
  logo_url      TEXT,
  parametros LONGTEXT DEFAULT ('{}') CHECK(JSON_VALID(parametros)),
  activo        BOOLEAN DEFAULT TRUE,
  created_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    CHECK (activo IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- SUCURSALES
-- ============================================================================
CREATE TABLE branches (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  company_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre        VARCHAR(200) NOT NULL,
  direccion     VARCHAR(300),
  telefono      VARCHAR(50),
  es_principal  BOOLEAN DEFAULT FALSE,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    CHECK (es_principal IN (0,1)),
    CHECK (activo IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- CONTACTOS (clientes/proveedores)
-- ============================================================================
CREATE TABLE contacts (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  company_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  guardar_como  VARCHAR(200) NOT NULL,
  rut           VARCHAR(30),
  direccion     VARCHAR(300),
  ciudad        VARCHAR(100),
  telefono      VARCHAR(50),
  email         VARCHAR(200),
  tipo          VARCHAR(20) DEFAULT 'cliente',  -- cliente, proveedor, ambos
  activo        BOOLEAN DEFAULT TRUE,
  created_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    CHECK (activo IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- MONEDAS
-- ============================================================================
CREATE TABLE currencies (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  iso4217       VARCHAR(3) NOT NULL UNIQUE,
  simbolo       VARCHAR(5) NOT NULL,
  nombre        VARCHAR(50) NOT NULL,
  decimales     INT DEFAULT 2,
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- TIPOS DE COMPROBANTE
-- ============================================================================
CREATE TABLE invoice_types (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  company_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre        VARCHAR(100) NOT NULL,
  codigo        VARCHAR(10),
  opera_contado BOOLEAN DEFAULT TRUE,
  es_cfe        BOOLEAN DEFAULT FALSE,
  activo        BOOLEAN DEFAULT TRUE,
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    CHECK (opera_contado IN (0,1)),
    CHECK (es_cfe IN (0,1)),
    CHECK (activo IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- ARTICULOS
-- ============================================================================
CREATE TABLE articles (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  company_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  codigo        VARCHAR(50) NOT NULL,
  nombre        VARCHAR(200) NOT NULL,
  precio        NUMERIC(15,2) DEFAULT 0,
  precio_neto   NUMERIC(15,2) DEFAULT 0,
  iva_tasa      NUMERIC(5,2) DEFAULT 22.00,
  activo        BOOLEAN DEFAULT TRUE,
  created_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    CHECK (activo IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- COMPROBANTES (facturas, tickets, etc.)
-- ============================================================================
CREATE TABLE invoices (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  company_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  branch_id     VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  type_id       VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  contact_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  currency_id   VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  -- Numeracion
  serie         VARCHAR(5) DEFAULT 'A',
  numero        INT NOT NULL,

  -- Fechas
  fecha         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

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
  comentario    TEXT DEFAULT (''),
  direccion_factura VARCHAR(300),

  -- CFE (factura electronica)
  cae_identificador VARCHAR(50),
  cae_desde     VARCHAR(20),
  cae_hasta     VARCHAR(20),
  cae_fecha_vto DATE,
  cfe_cod_seguridad VARCHAR(20),
  cfe_adenda    TEXT,

  estado        VARCHAR(20) DEFAULT 'emitido',  -- emitido, anulado
  created_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (type_id) REFERENCES invoice_types(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (currency_id) REFERENCES currencies(id),
    CHECK (is_imp_incluidos IN (0,1)),
    CHECK (is_consumo_final IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- LINEAS DE COMPROBANTE
-- ============================================================================
CREATE TABLE invoice_lines (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  invoice_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  article_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
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

  created_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES articles(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- IMPUESTOS DEL COMPROBANTE
-- ============================================================================
CREATE TABLE invoice_taxes (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  invoice_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre        VARCHAR(100) NOT NULL,
  tasa          NUMERIC(5,2) DEFAULT 0,
  valor         NUMERIC(15,2) DEFAULT 0,
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

-- ============================================================================
-- PLANTILLAS DE REPORTE (el JSON del diseñador)
-- ============================================================================
CREATE TABLE report_templates (
  id            VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  company_id    VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre        VARCHAR(200) NOT NULL,
  descripcion   TEXT,
  version       INT DEFAULT 1,
  autor         VARCHAR(100),
  tags          LONGTEXT DEFAULT ('[]') CHECK(tags IS NULL OR (JSON_VALID(tags) AND JSON_TYPE(tags)='ARRAY')),
  estado        VARCHAR(20) DEFAULT 'draft',  -- draft, published, archived
  template_json LONGTEXT NOT NULL CHECK(JSON_VALID(template_json)),               -- el ReportTemplate completo
  based_on      VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  created_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (based_on) REFERENCES report_templates(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

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
-- JSON indexing deferred until A5 query requirements.

-- Explicit, additive migration. Apply once as schema owner; never at API startup.

CREATE TABLE auth_users (
    id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    email varchar(254) NOT NULL UNIQUE CHECK (email = lower(trim(email))),
    password_salt text NOT NULL,
    password_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    CHECK (id REGEXP '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'),
    CHECK (active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
CREATE TABLE auth_memberships (
    user_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    role varchar(16) NOT NULL CHECK (role IN ('editor', 'viewer')),
    PRIMARY KEY (user_id, company_id),
    FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
CREATE TABLE auth_sessions (
    token_hash char(64) PRIMARY KEY,
    user_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    csrf_token char(64) NOT NULL,
    expires_at DATETIME(6) NOT NULL DEFAULT (UTC_TIMESTAMP(6) + INTERVAL 8 HOUR),
    FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);
CREATE TABLE auth_login_limits (
    key_hash char(64) PRIMARY KEY,
    attempts integer NOT NULL,
    window_start DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;
