# Backend ASP.NET Core — etapas 1 a 3

Base de la migración progresiva. El host ASP.NET Core arranca junto a NestJS y utiliza PostgreSQL mediante EF Core/Npgsql. Implementa las dos consultas y las cinco escrituras de Templates en paralelo. Angular mantiene su proxy actual hacia NestJS; los contratos y snapshots originales se conservan.

## Estructura y límites

```text
ReportDesigner.Api ────────────> Infrastructure ─────> Application ─────> Domain
  Host HTTP y composición        EF Core/Npgsql       Casos de uso       Modelo de dominio
```

| Proyecto | Responsabilidad en esta etapa |
|---|---|
| `src/ReportDesigner.Api` | Host, controlador y DTO de Templates, compatibilidad de errores, salud y referencia del contrato |
| `src/ReportDesigner.Infrastructure` | Mapeo de report_templates, consultas sin tracking, comandos SQL parametrizados y salud PostgreSQL |
| `src/ReportDesigner.Application` | Puertos ITemplateQueries/ITemplateCommands, comandos y resultados independientes de HTTP/EF Core |
| `src/ReportDesigner.Domain` | Límite reservado para entidades/reglas; todavía sin modelo duplicado del servidor NestJS |

Las futuras funcionalidades se agruparán por Templates e Invoices dentro de estas capas. API traduce HTTP/DTO; Application coordina casos de uso; Infrastructure implementa persistencia; Domain no depende de frameworks. No se agregan repositorios genéricos, mediadores ni abstracciones sin uso en esta etapa.

Se usa .NET 10 y Npgsql EF Core 10.0.3. `global.json` admite SDK estables de la familia 10.0 y `packages.lock.json` registra las versiones transitivas. Validado con SDK 10.0.403. Referencias oficiales: [SDK .NET 10](https://dotnet.microsoft.com/en-us/download/dotnet/10.0), [Npgsql 10](https://www.npgsql.org/doc/release-notes/10.0.html).

## Configurar y arrancar

Requiere SDK .NET 10 y PostgreSQL accesible. La instalación local del SDK realizada para verificar esta etapa quedó en `tmp/dotnet-sdk`, ignorada por Git; no forma parte del producto. Con un SDK instalado en PATH, desde `backend-dotnet`:

```powershell
dotnet restore ReportDesigner.slnx --locked-mode
dotnet build ReportDesigner.slnx -c Release --no-restore
$env:ConnectionStrings__Postgres = 'Host=127.0.0.1;Port=5432;Database=bd_dis_reportes;Username=usuario;Password=clave;Timeout=5;Command Timeout=5'
dotnet run --project src/ReportDesigner.Api --launch-profile http
```

El perfil HTTP usa `http://127.0.0.1:5080`, distinto de NestJS. Para un entorno real, configurar `ASPNETCORE_URLS` y `ASPNETCORE_ENVIRONMENT` según el despliegue, sin usar el perfil de desarrollo. `AllowedHosts` admite loopback por defecto; configurar los hosts del despliegue al publicarlo.

También puede usarse `dotnet user-secrets set 'ConnectionStrings:Postgres' '<cadena>' --project src/ReportDesigner.Api` en desarrollo. El archivo versionado contiene una cadena vacía. La API falla al arrancar si falta la cadena o no especifica host/base/usuario; no utiliza una base implícita ni lee `server/.env`. No guardar credenciales en archivos versionados ni usar cuentas administradoras para la aplicación.

## Persistencia y contratos

`ReportDesignerDbContext` se registra con vida scoped y proveedor PostgreSQL. El esquema sigue siendo responsabilidad de `database/001-schema.sql`, `002-seed.sql` y `003-view-invoice-data.sql`. El arranque no ejecuta `EnsureCreated`, `Migrate`, seeds ni ningún DDL. El contexto mapea explícitamente las doce columnas existentes de `report_templates`, incluidos uuid, JSONB, text[] y timestamps con zona horaria; los campos que admiten NULL conservan esa posibilidad.

| Ruta del host .NET | Resultado |
|---|---|
| `GET /health/live` | 200 `Healthy` si el proceso atiende HTTP, sin consultar la base |
| `GET /health/ready` | 200 `Healthy` cuando `SELECT 1` funciona mediante EF Core; 503 `Unhealthy` si la conexión falla |
| `GET /reference/openapi.json` | Solo Development: copia exacta del contrato NestJS de etapa 0 |
| `GET /api/templates?companyId=...` | Array completo de filas de la empresa; empresa por defecto solo cuando se omite el parámetro; updated_at DESC |
| `GET /api/templates/{id}` | Fila completa por identidad; 404 con el mensaje original de NestJS si falta |
| `POST /api/templates` | 201 con fila creada; defaults de empresa/descripción y defaults SQL existentes |
| `PUT /api/templates/{id}` | 200 con actualización parcial y cálculo de versión compatible |
| `PUT /api/templates/{id}/design` | 200; reemplaza JSON completo y actualiza versión |
| `POST /api/templates/{id}/duplicate` | 201; nueva identidad, sufijo ` (copia)`, versión 1 y mismo JSON interno |
| `DELETE /api/templates/{id}` | 200 con cuerpo vacío; 404 si falta y 500 ante referencias que impiden borrar |

Readiness comprueba conectividad, no existencia ni compatibilidad del esquema. Los cuerpos de salud no exponen errores SQL ni credenciales. La API puede arrancar con una base inaccesible y seguir viva; readiness indica que aún no está lista.

El contrato compartido se copia desde `contracts/openapi.json` al compilar/publicar. La ruta `reference` sirve una referencia de migración, no un documento generado de operaciones ya disponibles en ASP.NET Core. Las operaciones de Invoices siguen pendientes en .NET (404/405); no existe redirección ni cambio del proxy Angular.

Las consultas usan DTO con nombres explícitos, conservan nulls y mantienen `template_json` como `JsonElement` abierto, incluyendo extensiones del editor. Las fechas se emiten en UTC con exactamente tres decimales, como `Date.toJSON` de NestJS: se truncan los microsegundos sin redondear. El listado no filtra reportes/etiquetas ni agrega paginación. Se conserva el orden PostgreSQL DESC (incluyendo NULL primero); el orden entre timestamps iguales no está definido por el contrato.

Los valores de id/empresa se envían como parámetros SQL y PostgreSQL los convierte a uuid. Esto conserva su sintaxis aceptada, incluidos UUID compactos y en mayúsculas, y evita introducir respuestas 400 automáticas. Un valor inválido o un error de conexión devuelve el mismo 500 genérico JSON de NestJS. Un id válido ausente devuelve 404 con el texto de id recibido. El filtro de errores se limita al controlador de consultas Templates; el cliente no recibe errores SQL ni ProblemDetails.

La consulta individual conserva la búsqueda por id sin validar pertenencia a la empresa. Esta es la deuda de autorización ya documentada en etapa 0; antes de exponer el nuevo host debe resolverse mediante una decisión explícita de autenticación/autorización. Las consultas son `AsNoTracking`. El host con escrituras necesita SELECT/INSERT/UPDATE/DELETE sobre report_templates y acceso a los defaults existentes; el proceso de aplicación no necesita permisos para modificar el esquema.

## Escrituras y compatibilidad de etapa 3

`ITemplateCommands` expone crear, actualizar, guardar diseño, duplicar y borrar. La implementación usa SQL parametrizado a través del DbContext existente y una transacción por comando, sin registrar entidades para actualización completa. `jsonb_populate_record` aplica el patch sobre la fila existente: un campo omitido se conserva, un `null` explícito conserva la semántica SQL, y las columnas JSONB siguen abiertas. Los nombres de columnas de las escrituras están fijados en código; los valores del cliente nunca se concatenan al SQL. No se agregan dependencias, migraciones ni cambios al esquema.

Crear admite los campos del contrato y conserva el fallback de JavaScript para empresa/descripción. La identidad nueva es UUID v4 y PostgreSQL genera los defaults y timestamps de creación. Actualizar acepta los campos de metadatos/diseño existentes, incluidos company_id, autor, tags y based_on que actualmente permite NestJS; esto conserva la deuda de asignación y autorización caracterizada, sin introducir un modelo de permisos nuevo.

La versión se calcula como `(version || 1) + 1` para valores enteros: versión omitida parte de la fila, y null/0 pasan a 2. Un PUT vacío incrementa la versión. Si un override de versión deja todos los valores efectivos iguales, no se toca updated_at, igual que TypeORM. La ausencia de template_json en `/design` conserva el documento persistido, incrementa versión y omite ese campo de la respuesta de escritura; un GET posterior entrega el documento completo. Ese comportamiento atípico se caracteriza por separado del esquema de respuesta normal de etapa 0. Un template_json explícitamente null falla con 500 por la restricción SQL y revierte la operación.

Duplicar conserva metadatos y JSON interno, reinicia versión y genera identidad/fechas nuevas. El límite de nombre también se aplica al sufijo: si supera 200 caracteres, falla sin insertar una copia. Borrar conserva las restricciones de referencias based_on. Todos los errores de operación mantienen el envelope JSON del servidor anterior; DELETE exitoso no cambia a 204. No se añade control optimista de concurrencia ni ETags; la paridad comprobada corresponde a operaciones secuenciales, sin prometer resolución de escrituras concurrentes.

Referencias de implementación: [SQL parametrizado en EF Core](https://learn.microsoft.com/en-us/ef/core/querying/sql-queries) y [JSON DOM en Npgsql](https://www.npgsql.org/efcore/mapping/json.html).

## Verificación aislada

Desde la raíz del repositorio, con dependencias npm y Chromium instalados según `e2e/stage0/README.md`:

```powershell
# Solo si el SDK no está en PATH:
$env:DOTNET_HOST_PATH = "$PWD/tmp/dotnet-sdk/dotnet.exe"
npm run test:dotnet
```

Reutiliza el runner de etapa 0: crea PostgreSQL descartable, carga los SQL y verifica su marcador antes de iniciar las comprobaciones .NET. Restaura paquetes con lock, compila y comprueba salud, conexión real, fallo con credenciales incorrectas, rechazo de configuración ausente, identidad del contrato y ausencia de operaciones pendientes. Ejecuta la paridad de consultas con una conexión .NET de solo lectura, reinicia el host con permisos de escritura y compara comandos. Después ejecuta los 25 casos de etapa 0 y los 18 existentes de NestJS contra esa misma base aislada. La configuración del entorno de desarrollo y los datos existentes no se usan.

Finalmente ejecuta los 15 casos de Templates/editor de etapa 0 contra .NET, incluidos guardar, recargar en navegador nuevo, renderizar y exportar reportes A4, ticket y etiquetas. Solo para esa ejecución inicia otra instancia Angular con un proxy creado dentro del directorio descartable. No modifica el proxy del repositorio ni la configuración de Angular. Invoices no se dirige a .NET: sus nueve casos y el caso mixto de errores de empresa siguen comprobándose en NestJS. Los errores de creación y empresa de Templates también se cubren directamente en las comparaciones de etapas 2 y 3. Esta ejecución .NET prohíbe actualizar snapshots incluso si se solicita modo record.

La paridad de `e2e/stage2/check-template-queries.mjs` compara estados y cuerpos JSON completos de NestJS y .NET, sin normalizar ids, timestamps, documentos ni orden de arrays. También valida respuestas contra el esquema de etapa 0. Incluye lista vacía, dos empresas, tres formatos de fixture, valores nulos, precisión temporal, based_on, Unicode, tags y extensiones JSON; errores de UUID y entradas que parecen SQL; cambios/guardados/borrados desde NestJS visibles inmediatamente en .NET. Compara las filas SQL antes/después de lecturas y conecta .NET con `default_transaction_read_only=on`. Los fixtures se eliminan al terminar para no afectar las demás pruebas. La comparación es de JSON y estados, no de bytes, orden de claves, headers de infraestructura ni formato textual de escape Unicode.

La paridad de escrituras (`e2e/stage3/check-template-commands.mjs`) aplica cada operación a filas equivalentes en ambos backends y compara respuestas completas, filas SQL y lecturas posteriores. Solo normaliza identidades/fechas generadas y la referencia based_on entre contrapartes; no normaliza documentos, metadatos ni versiones. Verifica rollback y ausencia de cambios en errores, defaults, nulos, campos omitidos, límites de nombre, restricciones de borrado y la omisión de diseño indicada arriba.

Los logs .NET, `stage1.json`, `stage2.json` y `stage3.json` quedan junto a los resultados de etapa 0 en `e2e/test-results/stage0-<uuid>`. La regresión con .NET conserva su propio `dotnet-regression/results.json` y trazas de fallos, sin sobrescribir el resultado NestJS. El SDK debe estar instalado o indicado por `DOTNET_HOST_PATH`; el runner no lo descarga. La caché de NuGet y el directorio CLI quedan bajo `tmp`.

Validación del 3 de noviembre de 2026 en Windows x64: build Release sin errores ni advertencias, siete comprobaciones de la base .NET aprobadas y regresión completa de 25 casos de etapa 0 más 18 casos preexistentes del backend aprobada. Se conserva la referencia original; no se regeneran snapshots para esta etapa.

Etapa 2 verificada en el mismo entorno: 24 comparaciones directas NestJS/.NET aprobadas, incluidas entradas vacías y compuestas solo por espacios; build Release sin advertencias y regresión completa de 43 pruebas aprobada. Las comprobaciones de conexión fallida confirman además el 500 genérico en ambos endpoints .NET. El clúster descartable se elimina al finalizar.

Etapa 3 verificada en el mismo entorno: 81 comparaciones de escrituras y las 24 comparaciones de consultas aprobadas; las 43 pruebas NestJS y los 15 casos de Templates/editor contra .NET aprobados, usando los snapshots originales. Build Release sin errores ni advertencias. Se verificó también que una actualización sin cambios efectivos mantiene updated_at y que los fallos por restricciones no alteran filas. El clúster descartable se eliminó al finalizar.

La siguiente etapa puede migrar las consultas de Invoices. El cambio de tráfico requiere una decisión posterior y la paridad correspondiente; no forma parte de esta entrega.
