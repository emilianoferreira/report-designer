# A5 — persistencia de moldes y comprobantes en MySQL

Fecha: 2026-11-08. Rama: codex/mysql-migration. Base A4: 2408da8.
Main permanece en 0c9e5d64cfe298fa6bd92ec31328a9d20d82a009.

## Alcance implementado

Adaptadores MySQL de las interfaces existentes ITemplateQueries,
ITemplateCommands e IInvoiceQueries, sin nuevos endpoints. CRUD de moldes,
duplicación, guardado del diseño y eliminación usan transacciones InnoDB y
parámetros SQL. La lectura de comprobantes usa el constructor .NET de A2 y una
vista consistente (RepeatableRead) de cabecera, líneas e impuestos. No se agregó
CRUD de comprobantes: el contrato existente sólo ofrece consulta y datos para
renderizar. PostgreSQL conserva su endpoint y función originales, y sigue siendo
el motor predeterminado. NestJS permanece disponible.

Archivos de producto: Infrastructure/Templates/MySqlTemplate{Queries,Commands},
Invoices/MySqlInvoice{Queries,DataSource}, Persistence/MySqlReportDesignerDbContext,
StoredJson y MySqlHealthCheck; DependencyInjection; InvoiceDataBuilder; Program.cs;
csproj y lockfiles de los consumidores. El único cambio compartido del constructor
es aceptar zona horaria opcional; sin ella conserva el comportamiento PostgreSQL.
El middleware temporal A4 que devolvía 503 para negocio se retira en MySQL.

Oracle EF 10.0.12 y EF Core/Relational 10.0.12 quedan fijados; MySql.Data 26.10.0
permanece. Los lockfiles incluyen el probe A2 y la herramienta administrativa.
No hay actualización de Angular ni refactorización del renderer.

## Contratos y concurrencia

- If-Match: lectura y comparación de revisión bajo bloqueo de fila, antes de
  escribir/borrar. Dos réplicas con la misma revisión producen un ganador y 409;
  si otro cliente ya eliminó la fila, 404. La versión del body no reemplaza If-Match.
- Legacy sin If-Match: escrituras serializadas, sin detección de intención obsoleta.
  Se conservan las reglas históricas de version del body (null/0, valor explícito)
  y el no-op que cancela el incremento. No se promete monotonicidad ante una
  versión arbitraria suministrada por un cliente legacy.
- Tenant, viewer, CSRF y sesiones conservan los controles existentes. Una referencia
  based_on debe pertenecer a la empresa. La FK impide borrar un molde referenciado.
  Se conservan errores 400/403/404/409 y el 500 genérico histórico cuando corresponde.
- Se conservan null/ausente, tags, UUID, relaciones, revisiones, importes y fechas.
  Números JSON mantienen valor exacto aunque cambie su notación (decimal/exponente)
  y no se promete orden textual de claves. No se introducen ordinales ni reglas
  nuevas para empates de líneas o impuestos, cuyo orden SQL no estaba definido.

## JSON y fechas

Se utiliza LONGTEXT con validación/canonicalización .NET, claves duplicadas con
último valor ganador y precisión numérica sin double. El script explícito
002-json-precision.sql retira sólo los CHECK JSON_VALID de template_json y
companies.parametros: la prueba A3 ya demostró que rechazan 1e400, admitido por
PostgreSQL. NOT NULL, FK y validación de tags permanecen. Esto desplaza la garantía
de JSON válido hacia los escritores autorizados: futuras importaciones y SQL
administrativo deben validar antes de escribir. No ejecutar DDL al iniciar la API.

MySQL almacena DATETIME(6) UTC. InvoiceData:TimeZone es obligatorio en modo MySQL
y debe igualar SHOW TimeZone de la conexión PostgreSQL original; el ensayo usa
America/Montevideo. Los resúmenes siguen expresándose en UTC y el JSON de comprobante
conserva su offset. No se infiere zona horaria a partir de la máquina.

## Fallos detectados y corregidos

El caso adicional con cae_fecha_vto no nulo descubrió InvalidCastException:
Oracle entrega DATE como DateTime, mientras el modelo usa DateOnly. Se resolvió
con una proyección keyless y conversor explícito en el contexto MySQL; no se cambió
el DTO ni se omitió la prueba. Se conservó el ensayo fallido en test-results.
Un error tardío del proxy al cerrar intentaba escribir headers dos veces; se
protege headersSent y se guardan logs antes de limpiar recursos. No se actualizaron
snapshots. También se comprobó el rechazo de NUL en creación y actualización.

## Validación y evidencia

Ver evidence/report.json para comprobaciones A5, mysql-auth-schema.json para
esquema/autenticación/backup, postgres-security.json para regresiones compartidas
y a2-regression.json para el constructor PostgreSQL. Los JSON de comprobantes,
HTML, PNG y PDF sintéticos permiten revisar el resultado. La auditoría NuGet
incluye dependencias transitivas. Las pruebas de etiquetas y fiscal se registran
en regression-summary.txt, indicando su frontera HTTP simulada.

Aceptación: CRUD y concurrencia sobre dos APIs MySQL; equivalencia de listados y
InvoiceData contra PostgreSQL; A4/ticket generados desde endpoints autenticados;
regresiones previas sin actualizar snapshots; backup básico restaurado en base
aislada; limpieza de recursos propios. El detalle final de resultados se agrega
al cerrar el ensayo, no se considera terminada sólo por compilar.

## Riesgos y límites pendientes

La aprobación legal para distribuir Oracle en instalaciones propietarias de
clientes sigue pendiente según A3; no se resolvió mediante cambios de código.
La prueba transfiere fixtures, no datos del usuario, y no constituye migrador ni
plan de corte/rollback de escrituras productivas. Volver a PostgreSQL sirve para
este ensayo aislado, no sincroniza datos nuevos de MySQL automáticamente.

Faltan los trabajos propios de A6 y la preparación operacional posterior:
validación ampliada sobre volúmenes reales, operación productiva y retiro de
infraestructura antigua. La ausencia de orden SQL en empates no garantiza el
mismo orden accidental para cualquier plan de ejecución. No se certifica paridad
textual de serializaciones históricas arbitrarias fuera de los casos cubiertos.
Health/ready comprueba acceso a tablas, no certifica aplicación del script 002.

No se inició A6, no se modificó main y no se hizo push. Los trece artefactos del
ensayo interrumpido se verificaron por SHA-256 y permanecen intactos.

## Resultado final

A5 aceptada para su alcance de desarrollo: runner final con salida 0 y passed=true,
33 comprobaciones de persistencia y 2 pares de render (A4/ticket), 45 comprobaciones
MySQL de esquema/autenticación/backup y 345 solicitudes de seguridad/concurrencia
PostgreSQL/NestJS/.NET. A2 pasó 17 casos y 6 renders con las dependencias actualizadas.
Regresiones de etiquetas y fiscal: salida 0. Auditoría NuGet: sin vulnerabilidades
reportadas. Los HTML y PNG coinciden entre motores; ambos PDFs tienen una página,
sin exigir identidad binaria. Backup sintético restaurado; contenedor propio retirado.

Ejecución final: mysql-a5-54564a80-8dfe-4c3e-8c8c-a5c986d9f451.
Evidencia revisable: [resultados](../e2e/mysql-a5/evidence/report.json),
[seguridad](../e2e/mysql-a5/evidence/postgres-security.json),
[MySQL](../e2e/mysql-a5/evidence/mysql-auth-schema.json),
[A4](../e2e/mysql-a5/evidence/report-a4-mysql.pdf),
[ticket](../e2e/mysql-a5/evidence/report-ticket-80-mysql.pdf).

La compilación API terminó correctamente; tuvo un reintento MSB3026 porque la
corrida anterior todavía liberaba una DLL. El build administrativo terminó sin
advertencias. No quedan fallos abiertos de las pruebas ejecutadas. Los límites
y riesgos de la sección anterior permanecen y no se consideran resueltos por A5.
