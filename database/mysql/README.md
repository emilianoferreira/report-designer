# MySQL — alcance A5

Esquema, autenticación y persistencia de negocio experimental de la rama `codex/mysql-migration`.
La aplicación predeterminada continúa usando PostgreSQL. No ejecutar estos scripts
sobre una base del usuario para probar la migración: usar el harness aislado.

`001-schema.sql` crea 14 tablas InnoDB en una base **vacía** seleccionada previamente,
con 18 claves foráneas explícitas, índices, restricciones y columnas del esquema
actual. Se ejecuta como propietario de esquema, nunca al arrancar la API. El DDL
MySQL no es transaccional: una creación fallida se inspecciona antes de retirar
exclusivamente el recurso de prueba propio. No es una migración de datos existentes.

Decisiones de representación:

- UUID: `varchar(36)` ASCII binario. Exportar UUID existentes en su forma canónica
  minúscula. Los nuevos IDs se suministran explícitamente con `Guid.NewGuid()`;
  no se usa `UUID()` de MySQL para sustituir la generación v4 existente.
- Importes/cantidades: mismas precisiones `NUMERIC`; fechas: `DATETIME(6)` en UTC.
  La instancia de desarrollo debe usar UTC. Las sesiones usan `UTC_TIMESTAMP(6)`
  expresamente y conservan su vencimiento de ocho horas.
- JSON: LONGTEXT validado y normalizado por .NET. Aplicar explícitamente
  `002-json-precision.sql` después de 001: elimina sólo los dos CHECK(JSON_VALID)
  de template_json y parametros, porque MySQL rechaza números como 1e400 que
  PostgreSQL admite. Se mantienen NOT NULL, FK y checks de tags. Las escrituras
  directas y futuras importaciones deben validar JSON antes de persistirlo.
  Tags usa array JSON (NULL y [] distintos). No usar JSON nativo para moldes.
- `utf8mb4_0900_bin` evita comparar emails ignorando mayúsculas/acentos o espacios
  finales; los checks conservan email normalizado y roles editor/viewer.
- No se traduce el índice GIN ni la función PL/pgSQL. El constructor .NET de A2
  alimenta el endpoint MySQL; PostgreSQL conserva build_invoice_data().

## Conexión opt-in

Sólo para una instancia separada de desarrollo:

```powershell
$env:Database__Provider = 'MySql'
$env:InvoiceData__TimeZone = 'America/Montevideo' # debe coincidir con SHOW TimeZone en PostgreSQL
$env:ConnectionStrings__MySql = 'Server=127.0.0.1;Port=PUERTO_AISLADO;Database=BASE_AISLADA;User ID=rd_auth;Password=SECRETO;SslMode=VerifyCA;SslCa=RUTA_CA'
dotnet run --project backend-dotnet/src/ReportDesigner.Api
```

No se modifica appsettings ni Docker predeterminados. Ausencia de `Database:Provider`
equivale a `Postgres`; un valor desconocido falla al iniciar. MySQL requiere
`VerifyCA` o `VerifyFull`. VerifyCA prueba confianza en CA, no hostname/SAN; para una
instalación real corresponde un certificado válido para el nombre y VerifyFull.
Las cookies conservan la política existente: Secure por defecto fuera de Development.

Permisos del usuario de aplicación A5, sobre **su propia base**:

| Tablas | Permisos |
|---|---|
| companies, auth_users, auth_memberships, invoices, invoice_types, invoice_lines, invoice_taxes, contacts, branches, currencies | SELECT |
| auth_sessions | SELECT, INSERT, DELETE |
| auth_login_limits | SELECT, INSERT, UPDATE |
| report_templates | SELECT, INSERT, UPDATE, DELETE |

No necesita CREATE, ALTER, DROP ni GRANT. `/health/ready` verifica conexión y
acceso a tablas de autenticación y negocio; no sustituye la suite de aceptación
ni certifica por sí solo que se aplicó 002. Las rutas de negocio están habilitadas
sólo en esta configuración opt-in. El harness utiliza SELECT sobre su base aislada
completa; para instalaciones limitarlo a las tablas listadas.

## Provisión administrativa explícita

`backend-dotnet/tools/ProvisionMySqlUser` replica el flujo administrativo existente
para MySQL. No se ejecuta desde la API ni crea empresas. Lee `AUTH_MYSQL_CONNECTION`
con TLS verificado y un JSON de hasta 64 Ki caracteres por stdin:

```json
{"email":"operador@example.test","password":"CONTRASEÑA_PRIVADA","companies":[{"id":"UUID_EMPRESA_EXISTENTE","role":"editor"}]}
```

Ejecutar la DLL compilada pasando ese JSON por stdin, sin contraseña como argumento.
El operador debe disponer de SELECT en companies y SELECT/INSERT/UPDATE/DELETE en
auth_users, auth_memberships y auth_sessions. Se conserva el ID al reprovisionar por
email; se reemplazan membresías y contraseña y se revocan sesiones dentro de una
transacción. Empresa inexistente/inactiva o entrada inválida revierten la operación.
Sólo se imprime el ID o un error genérico, nunca el secreto ni la conexión.

El script PostgreSQL `scripts/provision-user.mjs` permanece intacto. Elegir el
administrador correspondiente al motor: no existe escritura dual ni sincronización.

Reproducción automática y pruebas: [harness A5](../../e2e/mysql-a5/README.md).
