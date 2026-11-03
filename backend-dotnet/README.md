# Backend ASP.NET Core — etapas 1 y 2

Base de la migración progresiva. El host ASP.NET Core arranca junto a NestJS y consulta PostgreSQL mediante EF Core/Npgsql. La etapa 2 implementa las dos consultas de Templates en paralelo. Angular mantiene su proxy actual hacia NestJS; los contratos y snapshots originales se conservan.

## Estructura y límites

```text
ReportDesigner.Api ────────────> Infrastructure ─────> Application ─────> Domain
  Host HTTP y composición        EF Core/Npgsql       Casos de uso       Modelo de dominio
```

| Proyecto | Responsabilidad en esta etapa |
|---|---|
| `src/ReportDesigner.Api` | Host, controlador y DTO de consultas Templates, compatibilidad de errores, salud y referencia del contrato |
| `src/ReportDesigner.Infrastructure` | Registro de dependencias, mapeo de report_templates, consultas EF Core sin tracking y salud PostgreSQL |
| `src/ReportDesigner.Application` | Puerto ITemplateQueries y modelo de lectura independiente de HTTP/EF Core |
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

Readiness comprueba conectividad, no existencia ni compatibilidad del esquema. Los cuerpos de salud no exponen errores SQL ni credenciales. La API puede arrancar con una base inaccesible y seguir viva; readiness indica que aún no está lista.

El contrato compartido se copia desde `contracts/openapi.json` al compilar/publicar. La ruta `reference` sirve una referencia de migración, no un documento generado de operaciones ya disponibles en ASP.NET Core. Las escrituras de Templates y todas las operaciones de Invoices siguen pendientes en .NET (404/405); no existe redirección ni cambio del proxy Angular.

Las consultas usan DTO con nombres explícitos, conservan nulls y mantienen `template_json` como `JsonElement` abierto, incluyendo extensiones del editor. Las fechas se emiten en UTC con exactamente tres decimales, como `Date.toJSON` de NestJS: se truncan los microsegundos sin redondear. El listado no filtra reportes/etiquetas ni agrega paginación. Se conserva el orden PostgreSQL DESC (incluyendo NULL primero); el orden entre timestamps iguales no está definido por el contrato.

Los valores de id/empresa se envían como parámetros SQL y PostgreSQL los convierte a uuid. Esto conserva su sintaxis aceptada, incluidos UUID compactos y en mayúsculas, y evita introducir respuestas 400 automáticas. Un valor inválido o un error de conexión devuelve el mismo 500 genérico JSON de NestJS. Un id válido ausente devuelve 404 con el texto de id recibido. El filtro de errores se limita al controlador de consultas Templates; el cliente no recibe errores SQL ni ProblemDetails.

La consulta individual conserva la búsqueda por id sin validar pertenencia a la empresa. Esta es la deuda de autorización ya documentada en etapa 0; antes de exponer el nuevo host debe resolverse mediante una decisión explícita de autenticación/autorización. Las consultas son `AsNoTracking` y no llaman a `SaveChanges`. Para esta etapa se puede utilizar un usuario PostgreSQL con permisos de lectura únicamente.

Referencias de implementación: [SQL parametrizado en EF Core](https://learn.microsoft.com/en-us/ef/core/querying/sql-queries) y [JSON DOM en Npgsql](https://www.npgsql.org/efcore/mapping/json.html).

## Verificación aislada

Desde la raíz del repositorio, con dependencias npm y Chromium instalados según `e2e/stage0/README.md`:

```powershell
# Solo si el SDK no está en PATH:
$env:DOTNET_HOST_PATH = "$PWD/tmp/dotnet-sdk/dotnet.exe"
npm run test:dotnet
```

Reutiliza el runner de etapa 0: crea PostgreSQL descartable, carga los SQL y verifica su marcador antes de iniciar las comprobaciones .NET. Restaura paquetes con lock, compila y comprueba salud, conexión real, fallo con credenciales incorrectas, rechazo de configuración ausente, identidad del contrato y ausencia de operaciones pendientes. Después ejecuta la paridad de consultas y los 25 casos de etapa 0 más los 18 existentes de NestJS contra esa misma base aislada. La configuración del entorno de desarrollo y los datos existentes no se usan.

La paridad de `e2e/stage2/check-template-queries.mjs` compara estados y cuerpos JSON completos de NestJS y .NET, sin normalizar ids, timestamps, documentos ni orden de arrays. También valida respuestas contra el esquema de etapa 0. Incluye lista vacía, dos empresas, tres formatos de fixture, valores nulos, precisión temporal, based_on, Unicode, tags y extensiones JSON; errores de UUID y entradas que parecen SQL; cambios/guardados/borrados desde NestJS visibles inmediatamente en .NET. Compara las filas SQL antes/después de lecturas y conecta .NET con `default_transaction_read_only=on`. Los fixtures se eliminan al terminar para no afectar las demás pruebas. La comparación es de JSON y estados, no de bytes, orden de claves, headers de infraestructura ni formato textual de escape Unicode.

Los logs .NET, `stage1.json` y el detalle de comparaciones de `stage2.json` quedan junto a los resultados de etapa 0 en `e2e/test-results/stage0-<uuid>`. El SDK debe estar instalado o indicado por `DOTNET_HOST_PATH`; el runner no lo descarga. La caché de NuGet y el directorio CLI quedan bajo `tmp`.

Validación del 3 de noviembre de 2026 en Windows x64: build Release sin errores ni advertencias, siete comprobaciones de la base .NET aprobadas y regresión completa de 25 casos de etapa 0 más 18 casos preexistentes del backend aprobada. Se conserva la referencia original; no se regeneran snapshots para esta etapa.

Etapa 2 verificada en el mismo entorno: 24 comparaciones directas NestJS/.NET aprobadas, incluidas entradas vacías y compuestas solo por espacios; build Release sin advertencias y regresión completa de 43 pruebas aprobada. Las comprobaciones de conexión fallida confirman además el 500 genérico en ambos endpoints .NET. El clúster descartable se elimina al finalizar.

Las siguientes etapas pueden migrar las escrituras de Templates y las consultas de Invoices. El cambio de tráfico requiere una decisión posterior y la paridad correspondiente; no forma parte de esta entrega.
