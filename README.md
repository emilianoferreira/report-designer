# Report Designer

Diseñador visual de plantillas de impresion para el ERP Zureo. Permite crear, editar y previsualizar moldes de facturas, tickets, remitos y otros comprobantes fiscales con datos reales.

> **¿Buscas un archivo especifico?** Ver [ARCHITECTURE.md](./ARCHITECTURE.md) — mapa de navegacion con tabla feature → archivo y recetas de "¿como edito X?".

## Arquitectura

Pruebas de referencia para la migración del backend: [Etapa 0 — contratos, fixtures y PostgreSQL aislado](e2e/stage0/README.md). Ejecutar `npm run test:migration`.

Backend predeterminado ASP.NET Core, con opción de volver a NestJS: [Migración y cambio de backend — etapas 1 a 6](backend-dotnet/README.md). Verificar ambos perfiles con `npm run test:cutover`.

Producción preparada, aún sin desplegar: [Etapa 6 — imágenes, Compose, PostgreSQL externo y retorno](deployment/README.md). Validación local de artefactos: `npm run test:production` (requiere Nginx local).

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Angular 18)                    │
│                        http://localhost:4200                    │
│  ┌──────────┐  ┌──────────────┐  ┌───────────┐  ┌───────────┐   │
│  │ Template │  │   Design     │  │Properties │  │  Preview  │   │
│  │   List   │→ │   Canvas     │  │  Panel    │  │  (HTML)   │   │
│  └──────────┘  │(eventos nat.)│  └───────────┘  └───────────┘   │
│                └──────────────┘                                 │
│  Services: TemplateState | Selection | HtmlRenderer | Storage   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ /api/* (proxy)
┌──────────────────────▼──────────────────────────────────────────┐
│                    Backend (ASP.NET Core 10)                    │
│                    http://127.0.0.1:5080                        │
│  Templates (CRUD) | Invoices (consultas)                        │
│  Retorno opcional: NestJS 10 en http://127.0.0.1:3000            │
└──────────────────────┬──────────────────────────────────────────┘
                       │ EF Core / Npgsql
┌──────────────────────▼──────────────────────────────────────────┐
│                    PostgreSQL 16                                │
│                    bd_dis_reportes                              │
│  Funcion: build_invoice_data() → JSON para renderizado          │
└─────────────────────────────────────────────────────────────────┘
```

**Stack:** Angular 18 + ASP.NET Core 10 + EF Core/Npgsql + PostgreSQL 16. NestJS 10 y TypeORM se conservan para volver al backend anterior.

El frontend puede funcionar sin backend (usa localStorage como fallback).

---

## Requisitos previos

| Herramienta   | Version minima | Verificar con         |
|---------------|----------------|-----------------------|
| Node.js       | 22.x           | `node -v`             |
| npm           | 9.x            | `npm -v`              |
| .NET SDK      | 10.0           | `dotnet --info`       |
| PostgreSQL    | 14+            | `psql --version`      |

PostgreSQL debe estar corriendo y accesible en `localhost:5432`.

---

## Instalacion

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd zureo-report-designer
```

### 2. Instalar dependencias

```bash
# Frontend
npm install

# Backend NestJS y herramientas de pruebas aisladas
cd server && npm install && cd ..

# Backend ASP.NET Core
dotnet restore backend-dotnet/ReportDesigner.slnx --locked-mode
```

### 3. Configurar la base de datos

#### 3.1 Crear la base de datos

```bash
createdb bd_dis_reportes
```

#### 3.2 Configurar variables de entorno

Copiar el archivo de ejemplo y ajustar los valores:

```bash
cp server/.env.example server/.env
```

`server/.env` configura NestJS. Editarlo con tus credenciales:

```env
# ─── Database ───
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=tu_usuario_postgres
DB_PASSWORD=tu_password
DB_NAME=bd_dis_reportes

# ─── Server ───
PORT=3000
```

ASP.NET Core usa `ConnectionStrings__Postgres` o user-secrets, según la [guía del backend](backend-dotnet/README.md). Configurarlo con la **misma base** que NestJS para poder alternar sin trasladar datos. El servidor .NET no lee `server/.env` ni crea el esquema automáticamente.

#### 3.3 Cargar schema y datos de prueba

```bash
npm run db:reset
```

Esto ejecuta en orden:
1. `database/001-schema.sql` — Crea todas las tablas (companies, invoices, articles, etc.)
2. `database/002-seed.sql` — Inserta datos de prueba (2 empresas, 5 facturas, 13 articulos)
3. `database/003-view-invoice-data.sql` — Crea la funcion `build_invoice_data()` para transformar datos relacionales a JSON

---

## Ejecucion

### Modo desarrollo con ASP.NET Core (predeterminado)

Abrir **dos terminales**:

```powershell
# Terminal 1 — API ASP.NET Core (puerto 5080)
$env:ConnectionStrings__Postgres = 'Host=127.0.0.1;Port=5432;Database=bd_dis_reportes;Username=tu_usuario;Password=tu_password'
# Si el SDK solo está en la instalación local usada en la migración:
# $env:DOTNET_HOST_PATH = "$PWD/tmp/dotnet-sdk/dotnet.exe"
npm run server

# Terminal 2 — Frontend Angular (puerto 4200)
npm start
```

Abrir en el navegador: **http://localhost:4200/templates**

`npm run start:dotnet` selecciona explícitamente el mismo destino. Para volver a NestJS, detener Angular y arrancar estos comandos en dos terminales:

```sh
# Terminal 1 — API NestJS (puerto 3000, usa server/.env)
npm run server:nestjs

# Terminal 2 — Angular con el perfil anterior
npm run start:nestjs
```

Para regresar a .NET, detener Angular y ejecutar `npm start` con la API .NET en marcha. Reiniciar Angular después de cambiar el perfil o sus variables. `ASPNETCORE_API_URL` y `NESTJS_API_URL` permiten cambiar el destino de cada proxy; sus valores predeterminados son `http://127.0.0.1:5080` y `http://127.0.0.1:3000`. La selección es explícita: un error de .NET no reenvía automáticamente escrituras a NestJS. El fallback existente a localStorage sigue siendo independiente de esta selección.

El frontend compilado conserva URLs relativas `/api`. Los perfiles de Angular configuran solo `ng serve`. El [paquete de producción](deployment/README.md) sirve los bundles con Nginx y permite cambiar API_UPSTREAM entre api-dotnet:8080 y api-nestjs:3000 sin recompilar Angular. Mantiene PostgreSQL externo y secretos de runtime. Aún no se ha desplegado ni modificado un servidor externo.

### Modo sin backend (solo frontend)

```bash
npm start
```

El frontend detecta automaticamente si el API esta disponible. Si no lo esta, usa localStorage para persistir los moldes.

---

## Estructura del proyecto

```
zureo-report-designer/
├── src/                          # Frontend Angular
│   └── app/
│       ├── core/
│       │   ├── models/
│       │   │   └── template.model.ts    # Interfaces del schema completo
│       │   └── services/
│       │       └── api.service.ts       # Cliente HTTP centralizado
│       └── features/
│           └── template-designer/
│               ├── components/          # 8 componentes UI
│               │   ├── template-list/   # Lista de moldes
│               │   ├── designer-page/   # Pagina principal del editor
│               │   ├── design-canvas/   # Superficie de disenio (A4/ticket)
│               │   ├── element-renderer/# Renderizado de cada elemento
│               │   ├── toolbox/         # Paleta de herramientas
│               │   ├── properties-panel/# Panel de propiedades
│               │   ├── preview/         # Vista previa HTML
│               │   └── mold-form/       # Formulario crear/editar molde
│               ├── services/
│               │   ├── template-state.service.ts   # Estado central (BehaviorSubject)
│               │   ├── selection.service.ts         # Multi-seleccion
│               │   ├── html-renderer.service.ts     # Template → HTML/CSS
│               │   └── template-storage.service.ts  # API + localStorage fallback
│               ├── utils/
│               │   ├── coordinate-utils.ts          # mm ↔ px (1mm = 3.78px @96dpi)
│               │   ├── element-factory.ts           # Factory de elementos
│               │   └── expression-evaluator.ts      # Evaluador de expresiones
│               └── data/
│                   ├── default-template.ts           # Template inicial A4
│                   └── sample-invoice.ts             # Datos mock para preview
├── backend-dotnet/               # Backend ASP.NET Core predeterminado
├── scripts/start-dotnet.mjs      # Arranque .NET con SDK en PATH o DOTNET_HOST_PATH
├── server/                       # Backend NestJS opcional para retorno
│   ├── src/
│   │   ├── entities/             # 11 entidades TypeORM
│   │   ├── modules/
│   │   │   ├── templates/        # CRUD moldes (/api/templates)
│   │   │   └── invoices/         # Datos facturas (/api/invoices)
│   │   ├── app.module.ts         # Modulo raiz
│   │   └── main.ts               # Bootstrap NestJS
│   ├── test/                     # Tests E2E backend
│   ├── .env.example              # Variables de entorno (ejemplo)
│   └── package.json
├── database/                     # SQL schema, seed y funciones
│   ├── 001-schema.sql
│   ├── 002-seed.sql
│   └── 003-view-invoice-data.sql
├── e2e/                          # Tests E2E Playwright
│   ├── playwright.config.ts
│   └── tests/
├── proxy.conf.cjs                # /api → ASP.NET Core (5080)
├── proxy.nestjs.conf.cjs         # /api → NestJS (3000), perfil nestjs
└── package.json
```

---

## API Endpoints

### Templates (`/api/templates`)

| Metodo | Ruta                           | Descripcion                    |
|--------|--------------------------------|--------------------------------|
| GET    | `/api/templates?companyId=...` | Listar moldes de una empresa   |
| GET    | `/api/templates/:id`           | Obtener un molde               |
| POST   | `/api/templates`               | Crear molde                    |
| PUT    | `/api/templates/:id`           | Actualizar metadata            |
| PUT    | `/api/templates/:id/design`    | Guardar disenio (template_json)|
| POST   | `/api/templates/:id/duplicate` | Duplicar molde                 |
| DELETE | `/api/templates/:id`           | Eliminar molde                 |

### Invoices (`/api/invoices`)

| Metodo | Ruta                           | Descripcion                    |
|--------|--------------------------------|--------------------------------|
| GET    | `/api/invoices?companyId=...`  | Listar facturas (resumen)      |
| GET    | `/api/invoices/:id/data`       | Datos completos para renderizar|

---

## Tests

```bash
# Frontend — unit tests (Karma + Jasmine, 350 tests)
npm test

# Backend — E2E tests (Jest + Supertest, 18 tests)
npm run test:backend

# Browser — E2E tests (Playwright)
# Requiere que ambos servidores esten corriendo
npm run test:e2e
```

---

## Datos de prueba

El seed carga las siguientes entidades de ejemplo:

| Entidad        | Cantidad | Detalles                                                     |
|----------------|----------|--------------------------------------------------------------|
| Empresas       | 2        | Soluciones Tech S.A., Distribuidora del Este S.R.L.          |
| Sucursales     | 3        | Casa Central + Sucursal Pocitos (Tech), Casa Central (Dist.) |
| Contactos      | 6        | Clientes de ambas empresas                                   |
| Monedas        | 3        | UYU, USD, EUR                                                |
| Tipos factura  | 5        | Venta contado, credito, e-Factura, e-Ticket                  |
| Articulos      | 13       | Notebooks, monitores, agua, etc.                             |
| Facturas       | 5        | Contado, credito, dto global, USD, distribuidora             |

ID de empresa por defecto: `c1000000-0000-0000-0000-000000000001`

---

## Revision de seguridad

### Estado actual y riesgos conocidos

> Este proyecto esta en fase MVP de desarrollo. Los siguientes puntos estan identificados y pendientes de implementacion antes de pasar a produccion.

#### Critico

| Riesgo | Descripcion | Mitigacion propuesta |
|--------|-------------|----------------------|
| Sin autenticacion | No hay JWT, guards ni middleware de auth en ningun endpoint | Implementar `@nestjs/passport` con JWT + guards por ruta |
| Sin validacion de inputs | Los controllers aceptan `Partial<Entity>` sin DTOs ni validacion | Crear DTOs con `class-validator` y `ValidationPipe` global |
| Mass assignment | `Object.assign(entity, data)` permite modificar campos protegidos (company_id, estado) | Usar DTOs explicitos que solo expongan campos editables |

#### Alto

| Riesgo | Descripcion | Mitigacion propuesta |
|--------|-------------|----------------------|
| Evaluador de expresiones | `new Function()` en `expression-evaluator.ts` es un vector de inyeccion de codigo | Reemplazar con `mathjs` o `expr-eval` (parser seguro) |
| template_json sin validar | Se acepta cualquier JSON sin validacion de schema | Validar estructura con JSON Schema o Zod antes de persistir |
| Sin rate limiting | Endpoints sin proteccion contra abuso | Agregar `@nestjs/throttler` |

#### Medio

| Riesgo | Descripcion | Mitigacion propuesta |
|--------|-------------|----------------------|
| CORS hardcodeado | `origin: 'http://localhost:4200'` no es configurable | Mover a variable de entorno `CORS_ORIGIN` |
| Sin headers de seguridad | No hay helmet.js (X-Frame-Options, CSP, HSTS) | Agregar `app.use(helmet())` en main.ts |
| Sin HTTPS | Todo el trafico es HTTP plano | Configurar TLS en produccion (reverse proxy o cert directo) |
| Sin audit logging | Solo se loguean errores de DB, no acciones de usuario | Agregar interceptor de auditoria con timestamp y usuario |
| Sin limite de tamanio de request | template_json puede ser arbitrariamente grande | Configurar `bodyParser.json({ limit: '1mb' })` |

#### Bajo

| Riesgo | Descripcion | Mitigacion propuesta |
|--------|-------------|----------------------|
| Company ID hardcodeado | Default `c1000000-...` en controllers y frontend | Derivar del token JWT del usuario autenticado |
| logo_url sin validar | Podria apuntar a dominios maliciosos | Validar formato URL y dominios permitidos |

### Buenas practicas ya implementadas

- HTML escaping correcto en `HtmlRendererService.escapeHtml()`
- Queries parametrizadas via TypeORM (proteccion contra SQL injection)
- La funcion `build_invoice_data()` usa tipo UUID de PostgreSQL (validacion a nivel de BD)
- Preview en iframe (sandboxing del contenido renderizado)
- Archivo `.env` excluido del repositorio via `.gitignore`

---

## Scripts disponibles

| Script                | Descripcion                                      |
|-----------------------|--------------------------------------------------|
| `npm start`           | Angular (4200), API ASP.NET Core por defecto    |
| `npm run start:dotnet` | Angular con selección explícita de .NET        |
| `npm run start:nestjs` | Angular con proxy hacia NestJS para retorno    |
| `npm run build`       | Build de produccion del frontend                 |
| `npm test`            | Tests unitarios frontend (Karma + Jasmine)       |
| `npm run server`      | Inicia ASP.NET Core (5080); alias server:dotnet  |
| `npm run server:nestjs` | Inicia NestJS API en modo watch (3000)       |
| `npm run server:install` | Instala dependencias del backend              |
| `npm run db:reset`    | Recrea la BD con schema + seed + funciones       |
| `npm run test:backend`| Tests E2E del backend (Jest + Supertest)         |
| `npm run test:e2e`    | Suite histórica Playwright con perfil NestJS    |
| `npm run test:e2e:headed` | Tests E2E con navegador visible              |
| `npm run test:cutover` | Contratos/editor, perfiles reales y retorno sobre PostgreSQL aislado |
| `npm run test:production` | Artefactos Production con Nginx y base aislada, sin despliegue |

---

## Tecnologias principales

**Frontend:** Angular 18, RxJS, jsbarcode, qrcode
**Backend:** ASP.NET Core 10, EF Core/Npgsql, PostgreSQL 16; NestJS 10/TypeORM como opción de retorno
**Testing:** Karma/Jasmine (unit), Jest/Supertest (backend E2E), Playwright (browser E2E)
**Unidad de medida:** Todas las coordenadas en milimetros (1mm = 3.7795px @ 96 DPI)
