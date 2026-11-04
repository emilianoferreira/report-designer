# Mapa de Arquitectura — Zureo Report Designer

> **Proposito:** Indice de navegacion para encontrar y editar rapidamente cualquier funcionalidad o modulo del proyecto. Para cada feature hay una ruta de archivo exacta.
>
> Si buscas *como levantar el proyecto*, abrir [README.md](./README.md). Este documento es solo un mapa.

---

## 1. Vision general

La [etapa 10](deployment/PRODUCTION.md) prepara un overlay de release por imágenes revisadas y herramientas de backup/restore explícitas en `deployment/operations/`. El [ensayo](e2e/stage10/README.md) verifica recuperación cifrada, contenido/esquema y editor/retorno sobre una copia descartable; no modifica endpoints ni despliega producción.

La [etapa 9](e2e/stage9/README.md) añade un [perfil de preproducción HTTPS](deployment/PREPRODUCTION.md): gateway privado, certificados montados, web sin puerto público y cookies Secure en ambas APIs. Las suites HTTP/HTTPS comparten `e2e/support/run-isolated.mjs`; no cambian los contratos de la aplicación.

La [etapa 8](e2e/stage8/README.md) agrega sesiones compartidas en PostgreSQL y autorización por empresa en ambas APIs. Angular incorpora login, selector de empresa y CSRF; no usa fallback local. [Contrato actual](contracts/openapi.auth.json), [migración aditiva](database/004-auth.sql), [aprovisionamiento administrativo](scripts/provision-user.mjs). Los runners previos remiten a la aceptación autenticada de etapa 8.

Desde etapa 5, Angular usa ASP.NET Core por defecto. `npm run start:nestjs` selecciona el backend anterior. Configuración y retorno: [guía de migración](backend-dotnet/README.md).

Etapa 6 prepara el [paquete de producción](deployment/README.md): tres imágenes, Compose y PostgreSQL externo. Todavía no se ha desplegado.

La [etapa 7](e2e/stage7/README.md) construye y ejecuta esas imágenes con Docker local y PostgreSQL TLS descartable, incluyendo el editor y retorno al recrear el mismo proxy.

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend — Angular 18 (standalone + OnPush)                  │
│  http://localhost:4200                                         │
│                                                                │
│  /templates ──▶ TemplateList ──▶ /designer/:id ──▶ Designer    │
│                                        │                       │
│            ┌───────────────────────────┼───────────────┐       │
│            ▼                           ▼               ▼       │
│        Toolbox              DesignCanvas         Properties    │
│                                   │                            │
│                                   ▼                            │
│                          ElementRenderer (por tipo)            │
│                                                                │
│  Services: TemplateState (BehaviorSubject) | Selection         │
│            TemplateStorage | HtmlRenderer | Api                │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP /api/*  (proxy.conf.cjs)
┌───────────────────────────▼──────────────────────────────────┐
│  Backend — ASP.NET Core 10 + EF Core/Npgsql                    │
│  http://127.0.0.1:5080; NestJS opcional en 3000                 │
│                                                                 │
│    Templates (CRUD moldes)                                     │
│    Invoices (consultas y datos de factura)                      │
└───────────────────────────┬──────────────────────────────────┘
                            │ SQL
┌───────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 16 — bd_dis_reportes                               │
│  10 tablas + funcion build_invoice_data(invoice_id) → JSONB    │
└────────────────────────────────────────────────────────────────┘
```

**Flujo de render del preview:**
1. Usuario abre preview en el editor.
2. El preview actual usa datos de muestra del frontend. La API ofrece `GET /api/invoices/:id/data` mediante `build_invoice_data()`, pero ese endpoint se verifica por separado y todavía no alimenta el preview.
3. `HtmlRendererService` combina `ReportTemplate` + `InvoiceData` → HTML + CSS.
4. `PreviewComponent` inyecta el HTML en un iframe sandbox.

---

## 2. Tabla maestra: feature → archivo

**Frontend**

| Feature | Archivo | Que hace |
|---|---|---|
| Rutas Angular | [`src/app/app.routes.ts`](./src/app/app.routes.ts) | `/templates`, `/designer/:id` |
| Listar moldes | [`src/app/features/template-designer/components/template-list/template-list.component.ts`](./src/app/features/template-designer/components/template-list/template-list.component.ts) | Grid + acciones (abrir, duplicar, eliminar) |
| Crear/editar molde (form) | [`src/app/features/template-designer/components/mold-form/mold-form.component.ts`](./src/app/features/template-designer/components/mold-form/mold-form.component.ts) | Dialogo para metadatos del molde |
| Pagina del editor | [`src/app/features/template-designer/components/designer-page/designer-page.component.ts`](./src/app/features/template-designer/components/designer-page/designer-page.component.ts) | Layout: toolbox + canvas + properties |
| Canvas A4 | [`src/app/features/template-designer/components/design-canvas/design-canvas.component.ts`](./src/app/features/template-designer/components/design-canvas/design-canvas.component.ts) | Superficie de diseno con secciones header/detail/footer |
| Render de elemento | [`src/app/features/template-designer/components/element-renderer/element-renderer.component.ts`](./src/app/features/template-designer/components/element-renderer/element-renderer.component.ts) | Vista en canvas para cada tipo (text, image, line, rect, etc.) |
| Template HTML del renderer | [`src/app/features/template-designer/components/element-renderer/element-renderer.component.html`](./src/app/features/template-designer/components/element-renderer/element-renderer.component.html) | Markup por tipo de elemento |
| Toolbox | [`src/app/features/template-designer/components/toolbox/toolbox.component.ts`](./src/app/features/template-designer/components/toolbox/toolbox.component.ts) | Paleta de herramientas (botones por tipo) |
| Properties panel | [`src/app/features/template-designer/components/properties-panel/properties-panel.component.ts`](./src/app/features/template-designer/components/properties-panel/properties-panel.component.ts) | Editor de propiedades del elemento seleccionado |
| Vista previa | [`src/app/features/template-designer/components/preview/preview.component.ts`](./src/app/features/template-designer/components/preview/preview.component.ts) | Iframe con HTML final (datos reales o sample) |
| Estado global | [`src/app/features/template-designer/services/template-state.service.ts`](./src/app/features/template-designer/services/template-state.service.ts) | `BehaviorSubject<ReportTemplate>` + addElement/update/remove/duplicate/reorder |
| Seleccion multi | [`src/app/features/template-designer/services/selection.service.ts`](./src/app/features/template-designer/services/selection.service.ts) | `selectedElements$`, toggle, shift, active section |
| Persistencia | [`src/app/features/template-designer/services/template-storage.service.ts`](./src/app/features/template-designer/services/template-storage.service.ts) | API + fallback localStorage |
| Template → HTML | [`src/app/features/template-designer/services/html-renderer.service.ts`](./src/app/features/template-designer/services/html-renderer.service.ts) | Genera HTML/CSS para preview y export |
| Cliente HTTP | [`src/app/core/services/api.service.ts`](./src/app/core/services/api.service.ts) | Wrapper de `HttpClient` |
| Modelo de datos | [`src/app/core/models/template.model.ts`](./src/app/core/models/template.model.ts) | Todas las interfaces (ReportTemplate, TemplateElement, DataSourceConfig, …) |
| Sample data del preview | [`src/app/features/template-designer/data/sample-invoice.ts`](./src/app/features/template-designer/data/sample-invoice.ts) | Factura mock para cuando no hay backend |
| Template por defecto | [`src/app/features/template-designer/data/default-template.ts`](./src/app/features/template-designer/data/default-template.ts) | Layout A4 inicial |
| Conversion mm/px | [`src/app/features/template-designer/utils/coordinate-utils.ts`](./src/app/features/template-designer/utils/coordinate-utils.ts) | `mmToPx`, `pxToMm`, snap, constrain |
| Factory de elementos | [`src/app/features/template-designer/utils/element-factory.ts`](./src/app/features/template-designer/utils/element-factory.ts) | `createElement`, `cloneElement`, defaults |
| Evaluador de expresiones | [`src/app/features/template-designer/utils/expression-evaluator.ts`](./src/app/features/template-designer/utils/expression-evaluator.ts) | Evaluacion segura para formulas |
| Guard unsaved | [`src/app/features/template-designer/guards/unsaved-changes.guard.ts`](./src/app/features/template-designer/guards/unsaved-changes.guard.ts) | Confirmacion al salir con cambios |
| Proxy dev → API .NET | [`proxy.conf.cjs`](./proxy.conf.cjs) | `/api` → `127.0.0.1:5080` o ASPNETCORE_API_URL |
| Proxy de retorno NestJS | [`proxy.nestjs.conf.cjs`](./proxy.nestjs.conf.cjs) | Perfil nestjs → `127.0.0.1:3000` o NESTJS_API_URL |
| API ASP.NET Core | [`backend-dotnet/README.md`](./backend-dotnet/README.md) | Mapa de capas, controladores, persistencia y pruebas de paridad |
| Producción | [`deployment/compose.yaml`](./deployment/compose.yaml) | Angular/Nginx, .NET, NestJS y secretos; base externa |
| Proxy de producción | [`deployment/nginx/default.conf.template`](./deployment/nginx/default.conf.template) | /api, SPA, caché, readiness y retorno por API_UPSTREAM |

**Backend NestJS conservado para retorno**

| Feature | Archivo | Que hace |
|---|---|---|
| Bootstrap | [`server/src/main.ts`](./server/src/main.ts) | Arranca NestJS |
| Modulo raiz | [`server/src/app.module.ts`](./server/src/app.module.ts) | Importa modulos, config TypeORM |
| Controller templates | [`server/src/modules/templates/templates.controller.ts`](./server/src/modules/templates/templates.controller.ts) | GET/POST/PUT/DELETE + `/design` + `/duplicate` |
| Service templates | [`server/src/modules/templates/templates.service.ts`](./server/src/modules/templates/templates.service.ts) | Logica CRUD sobre `ReportTemplate` |
| Modulo templates | [`server/src/modules/templates/templates.module.ts`](./server/src/modules/templates/templates.module.ts) | Provider + repository |
| Controller invoices | [`server/src/modules/invoices/invoices.controller.ts`](./server/src/modules/invoices/invoices.controller.ts) | `GET /api/invoices`, `GET /api/invoices/:id/data` |
| Service invoices | [`server/src/modules/invoices/invoices.service.ts`](./server/src/modules/invoices/invoices.service.ts) | Llama a `build_invoice_data()` en PostgreSQL |
| Modulo invoices | [`server/src/modules/invoices/invoices.module.ts`](./server/src/modules/invoices/invoices.module.ts) | Provider |
| Entidades TypeORM | [`server/src/entities/`](./server/src/entities/) | 11 archivos `*.entity.ts` |
| Env sample | [`server/.env.example`](./server/.env.example) | Plantilla de variables de entorno |

**Base de datos**

| Archivo | Que hace |
|---|---|
| [`database/001-schema.sql`](./database/001-schema.sql) | DDL: tablas, indices, FKs |
| [`database/002-seed.sql`](./database/002-seed.sql) | Datos de prueba (2 empresas, facturas, articulos) |
| [`database/003-view-invoice-data.sql`](./database/003-view-invoice-data.sql) | Funcion `build_invoice_data(invoice_id)` → JSONB |

**Tests**

| Suite | Archivo | Comando |
|---|---|---|
| Unit frontend (Karma) | `src/**/*.spec.ts` (~10 archivos) | `npm test` |
| E2E backend (Jest + Supertest) | [`server/test/templates.e2e-spec.ts`](./server/test/templates.e2e-spec.ts), [`server/test/invoices.e2e-spec.ts`](./server/test/invoices.e2e-spec.ts) | `cd server && npm run test:e2e` |
| E2E navegador (Playwright) | [`e2e/tests/full-flow.spec.ts`](./e2e/tests/full-flow.spec.ts) | `npx playwright test` |
| Config Playwright | [`e2e/playwright.config.ts`](./e2e/playwright.config.ts) | — |

---

## 3. Mapa del frontend (`src/app/`)

```
src/app/
├── app.routes.ts            # Rutas: /templates, /designer/:id
├── app.config.ts            # Providers (HttpClient, router, animations)
├── app.component.ts         # Shell
│
├── core/
│   ├── models/
│   │   └── template.model.ts    # ReportTemplate, TemplateElement (union 8 tipos),
│   │                            # TemplateSections, DataSourceConfig, etc.
│   └── services/
│       └── api.service.ts       # Wrapper HttpClient (get/post/put/delete)
│
└── features/template-designer/
    ├── components/
    │   ├── template-list/       # Grid de moldes con acciones
    │   ├── mold-form/           # Crear/editar metadatos
    │   ├── designer-page/       # Layout del editor (toolbox + canvas + props)
    │   ├── design-canvas/       # Superficie A4 con secciones
    │   ├── element-renderer/    # Visual de cada TemplateElement en el canvas
    │   ├── toolbox/             # Paleta de herramientas
    │   ├── properties-panel/    # Editor de propiedades del seleccionado
    │   └── preview/             # Iframe con HTML final
    │
    ├── services/
    │   ├── template-state.service.ts    # BehaviorSubject<ReportTemplate>
    │   │                                # addElement, updateElement, removeElement,
    │   │                                # duplicateElement, reorderElement, undo/redo
    │   ├── selection.service.ts          # selectedElements$, toggle, shift, section
    │   ├── template-storage.service.ts   # load/save con API + fallback localStorage
    │   └── html-renderer.service.ts      # renderTemplate(template, data) → string HTML
    │
    ├── utils/
    │   ├── coordinate-utils.ts           # mmToPx, pxToMm, snapToGrid, constrainToPage
    │   ├── element-factory.ts            # createElement, cloneElement, defaults
    │   └── expression-evaluator.ts       # Evaluacion segura de formulas
    │
    ├── data/
    │   ├── default-template.ts           # Template A4 inicial
    │   └── sample-invoice.ts             # InvoiceData mock para preview
    │
    └── guards/
        └── unsaved-changes.guard.ts      # Confirmacion al salir con cambios
```

### Tipos de elemento soportados
Definidos en `template.model.ts` como union `TemplateElement`:
`text`, `dataField`, `formula`, `image`, `line`, `rectangle`, `qrCode`, `barcode` (mas shapes: ellipse, triangle, diamond).

---

## 4. Mapa del backend (`server/src/`)

```
server/src/
├── main.ts                  # Bootstrap (puerto 3000, CORS)
├── app.module.ts            # Root module — TypeOrmModule.forRoot + imports
│
├── entities/                # 11 entidades TypeORM
│   ├── company.entity.ts
│   ├── branch.entity.ts
│   ├── contact.entity.ts
│   ├── currency.entity.ts
│   ├── invoice-type.entity.ts
│   ├── article.entity.ts
│   ├── invoice.entity.ts
│   ├── invoice-line.entity.ts
│   ├── invoice-tax.entity.ts
│   ├── report-template.entity.ts
│   └── index.ts
│
└── modules/
    ├── templates/
    │   ├── templates.controller.ts
    │   ├── templates.service.ts
    │   └── templates.module.ts
    └── invoices/
        ├── invoices.controller.ts
        ├── invoices.service.ts
        └── invoices.module.ts
```

### Endpoints HTTP

**Templates** (`server/src/modules/templates/templates.controller.ts`)

| Metodo | Ruta | Handler |
|---|---|---|
| GET | `/api/templates?companyId=...` | `findAll` |
| GET | `/api/templates/:id` | `findOne` |
| POST | `/api/templates` | `create` |
| PUT | `/api/templates/:id` | `update` (metadatos) |
| PUT | `/api/templates/:id/design` | `saveDesign` (solo `template_json`) |
| POST | `/api/templates/:id/duplicate` | `duplicate` |
| DELETE | `/api/templates/:id` | `remove` |

**Invoices** (`server/src/modules/invoices/invoices.controller.ts`)

| Metodo | Ruta | Handler |
|---|---|---|
| GET | `/api/invoices?companyId=...` | `findAll` |
| GET | `/api/invoices/:id/data` | `getInvoiceData` (JSON desde `build_invoice_data`) |

---

## 5. Mapa de la base de datos

10 tablas principales (ver [`database/001-schema.sql`](./database/001-schema.sql)):

| Tabla | Proposito | FKs clave |
|---|---|---|
| `company` | Empresa (multi-tenant) | — |
| `branch` | Sucursales | `company_id` |
| `contact` | Clientes/proveedores | `company_id` |
| `currency` | Monedas | — |
| `invoice_type` | Tipo de comprobante | — |
| `article` | Articulos/productos | `company_id` |
| `invoice` | Cabecera de factura | `company_id`, `contact_id`, `currency_id`, `invoice_type_id`, `branch_id` |
| `invoice_line` | Renglones | `invoice_id`, `article_id` |
| `invoice_tax` | Impuestos por linea | `invoice_line_id` |
| `report_template` | Moldes de impresion | `company_id` |

**Funcion clave**: `build_invoice_data(p_invoice_id uuid) → JSONB`
Esta en [`database/003-view-invoice-data.sql`](./database/003-view-invoice-data.sql) y devuelve el JSON completo (empresa + cliente + cabecera + lineas + impuestos + totales) que consume `HtmlRendererService` para renderizar el preview. **Si cambia la forma del JSON, hay que actualizar esta funcion y los tipos en `template.model.ts`.**

---

## 6. Mapa de tests

| Suite | Ubicacion | Ejecutar con |
|---|---|---|
| Frontend unit (Karma + Jasmine) | `src/**/*.spec.ts` | `npm test` |
| Backend E2E (Jest + Supertest) | `server/test/*.e2e-spec.ts` | `cd server && npm run test:e2e` |
| Browser E2E (Playwright) | `e2e/tests/*.spec.ts` | `npx playwright test` |

Cobertura actual:
- **Frontend**: ~350 tests (services, componentes, utils)
- **Backend**: 18 tests (8 templates + 10 invoices)
- **Playwright**: flujo completo (listar → crear → editar → guardar → preview)

---

## 7. Recetario — "¿Como edito X?"

### Agregar un nuevo tipo de elemento
1. [`src/app/core/models/template.model.ts`](./src/app/core/models/template.model.ts) — agregar interface + extender union `TemplateElement`.
2. [`src/app/features/template-designer/utils/element-factory.ts`](./src/app/features/template-designer/utils/element-factory.ts) — agregar caso en `createElement` con defaults.
3. [`src/app/features/template-designer/components/element-renderer/element-renderer.component.html`](./src/app/features/template-designer/components/element-renderer/element-renderer.component.html) — agregar bloque `@switch/@case` para el render visual.
4. [`src/app/features/template-designer/services/html-renderer.service.ts`](./src/app/features/template-designer/services/html-renderer.service.ts) — agregar salida HTML para el tipo.
5. [`src/app/features/template-designer/components/properties-panel/properties-panel.component.ts`](./src/app/features/template-designer/components/properties-panel/properties-panel.component.ts) — editor de propiedades.
6. [`src/app/features/template-designer/components/toolbox/toolbox.component.ts`](./src/app/features/template-designer/components/toolbox/toolbox.component.ts) — boton en la paleta.

### Agregar un endpoint al backend
1. `server/src/modules/<modulo>/<modulo>.controller.ts` — nuevo handler con decorador HTTP.
2. `server/src/modules/<modulo>/<modulo>.service.ts` — logica.
3. `server/test/<modulo>.e2e-spec.ts` — test E2E.
4. [`src/app/core/services/api.service.ts`](./src/app/core/services/api.service.ts) — metodo cliente.

### Agregar una entidad/tabla
1. Crear `server/src/entities/<nombre>.entity.ts` y exportar en `entities/index.ts`.
2. Agregar DDL en [`database/001-schema.sql`](./database/001-schema.sql) (o migracion nueva).
3. Registrar en el `TypeOrmModule.forFeature([...])` del modulo que la use.
4. Si es accesible multi-tenant, incluir `company_id` y filtrar en el service.

### Cambiar el JSON que consume el preview
- Editar [`database/003-view-invoice-data.sql`](./database/003-view-invoice-data.sql).
- Ajustar los tipos correspondientes en [`src/app/core/models/template.model.ts`](./src/app/core/models/template.model.ts) (seccion `InvoiceData`).
- Actualizar [`src/app/features/template-designer/data/sample-invoice.ts`](./src/app/features/template-designer/data/sample-invoice.ts) para que coincida.

### Cambiar el template por defecto
- [`src/app/features/template-designer/data/default-template.ts`](./src/app/features/template-designer/data/default-template.ts).

### Cambiar el sample data del preview (cuando no hay backend)
- [`src/app/features/template-designer/data/sample-invoice.ts`](./src/app/features/template-designer/data/sample-invoice.ts).

### Cambiar las rutas del frontend
- [`src/app/app.routes.ts`](./src/app/app.routes.ts).

### Cambiar el proxy de desarrollo (redireccion a backend)
- [`angular.json`](./angular.json) selecciona dotnet por defecto; `npm run start:nestjs` usa el perfil de retorno.
- [`proxy.conf.cjs`](./proxy.conf.cjs) y [`proxy.nestjs.conf.cjs`](./proxy.nestjs.conf.cjs) admiten ASPNETCORE_API_URL/NESTJS_API_URL. Reiniciar Angular tras cambiar selección o entorno.

### Agregar una propiedad editable a un elemento existente
1. Extender la interface correspondiente en [`template.model.ts`](./src/app/core/models/template.model.ts).
2. Agregar el default en [`element-factory.ts`](./src/app/features/template-designer/utils/element-factory.ts).
3. Exponer el control en [`properties-panel.component.ts`](./src/app/features/template-designer/components/properties-panel/properties-panel.component.ts) (+ HTML).
4. Usar la propiedad en [`element-renderer.component.html`](./src/app/features/template-designer/components/element-renderer/element-renderer.component.html) y en [`html-renderer.service.ts`](./src/app/features/template-designer/services/html-renderer.service.ts).
