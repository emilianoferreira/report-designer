# A2 — Constructor InvoiceData en .NET

Fecha: 2026-11-07. Rama: `codex/mysql-migration`, sobre `4561a5d` (A3).
Main permanece en `0c9e5d64cfe298fa6bd92ec31328a9d20d82a009`.

**A2 completada para el corpus verificado. El constructor existe y fue comparado
contra PostgreSQL real; el endpoint no fue sustituido. No se inició A4.**

## Implementación y archivos

| Archivo | Responsabilidad |
|---|---|
| `backend-dotnet/src/ReportDesigner.Application/Invoices/InvoiceDataBuilder.cs` | Construcción del contrato JSON desde datos tipados, sin SQL ni dependencia del motor |
| `backend-dotnet/src/ReportDesigner.Application/Invoices/InvoiceDataHeader.cs` | Encabezado relacional, tipos decimales/fechas y nullabilidad explícita |
| `backend-dotnet/src/ReportDesigner.Infrastructure/Invoices/PostgresInvoiceDataSource.cs` | Lectura candidata parametrizada y con contexto de empresa; no usa la función SQL |
| `backend-dotnet/probes/InvoiceDataStage2` | Comparador .NET exacto, ejecutable exclusivo de pruebas y lockfile |
| `e2e/mysql-a2/run.mjs` | Cluster aislado, casos, API autenticada y renderer real |
| `e2e/mysql-a2/postgres-reference.sql` | Copia íntegra y recuperable de la función PostgreSQL original |
| `e2e/mysql-a2/evidence` | Comparaciones, seguridad, JSON y documentos de muestra |

Se reutilizan Application, Infrastructure, `ReportDesignerDbContext`,
`ICompanyContext`, `InvoiceNotFoundException`, las herramientas de A1 y el renderer
actual. No se añadieron dependencias externas nuevas. No se registró el lector
candidato en DI: `IInvoiceQueries` continúa resolviendo `PostgresInvoiceQueries`.
Los controladores, SQL principal, frontend y configuración permanecen intactos.

## Contratos conservados

- Mismas claves, casing y estructura: invoice, invoiceLines, Articulos, Impuestos,
  company, Moneda, Contacto, CFE, totales, flags y campos vacíos.
- `Numero.Numero` sigue siendo string; importes y cantidades siguen siendo números,
  con decimal exacto. No se recalculan importes a partir de las líneas.
- Los nulls SQL no se convierten indiscriminadamente a cero/false. En particular,
  `hasDtoGlobal` y `hasRedondeo` permanecen null si sus operandos son null.
- Los COALESCE de comentarios, CAE, logo, direcciones y CFE reproducen la función.
  Una dirección vacía no dispara el fallback de una dirección null.
- Parametros conserva JSON abierto, claves desconocidas, arrays, valores null y
  números de alta precisión. No se utiliza double para ensamblarlo ni compararlo.
- Fecha conserva microsegundos y offset de la sesión PostgreSQL, incluido `+00:00`.
  El lector obtiene instante UTC y offset; el constructor produce el formato JSON.
  CAEFechaVto mantiene fecha ISO o string vacío.
- Acceso por otra empresa y relaciones de otra empresa se rechazan antes de
  construir datos. La función SQL por sí sola no autoriza: estas comprobaciones
  reproducen la protección del endpoint, no el comportamiento inseguro de invocarla
  directamente sobre cualquier ID.

El lector toma tres consultas en RepeatableRead para evitar mezclar versiones de
encabezado, líneas e impuestos. No se incorpora ese lector al tráfico actual ni se
modifican escrituras, If-Match, sesiones o contratos HTTP.

## Orden y comportamientos históricos

Sólo se conserva `ORDER BY linea_nro` en líneas. No se agregó ID como desempate,
un ordinal persistente ni orden por nombre de impuesto. PostgreSQL no garantiza
el orden de impuestos ni de líneas con igual número: la comparación registra la
igualdad observada incluso con empates y duplicados, pero no la eleva a garantía
de orden estable entre motores/planes. Cambiar esa regla requiere una decisión
funcional separada. El orden de propiedades y los escapes Unicode del JSON no son
parte del contrato público; se comparan sus valores, tipos y estructura.

## Ejecuciones y resultados

| Verificación | Resultado |
|---|---|
| Build API .NET | Exit 0, sin warnings ni errores |
| Restore locked del probe y build | Exit 0, sin cambios de versiones del producto |
| Comparaciones contra `build_invoice_data()` | 12/12; sin diferencias de valores, tipos, claves ni arrays |
| Acceso/inexistencia en candidato | 5/5: otra empresa, ID inexistente y contacto/sucursal/tipo ajenos |
| Regresión compartida de seguridad/concurrencia | 345 solicitudes verificadas, ambas APIs; `security.json` aprobado |
| API real frente al candidato en renderer | 6/6 pares: tres comprobantes por A4/ticket |
| HTML/preview/texto/captura | Iguales por par; ningún error de navegador |
| PDF | 12 PDFs generados; página presente y misma cantidad por par; sin igualdad binaria |
| Regresión de etiquetas | Exit 0: validación, representación, conflictos, eliminación y recuperación |
| Regresión fiscal | Exit 0: roundtrip, bloqueo de impresión, PDF multipágina, remito y resguardo |
| Angular/Karma con Chrome instalado | 389/389 aprobadas |
| Referencias y artefactos anteriores | Función original, endpoint, DI y 13 hashes del ensayo interrumpido sin cambios |

El corpus incluye cinco comprobantes semilla, vacío, importes/flags/línea/impuesto
nulos, campos opcionales de empresa y parámetros nulos, Unicode, negativos, ceros,
decimales grandes, extensiones JSON de precisión superior a decimal/double, fecha
CAE de año bisiesto, microsegundos, UTC, Montevideo y Kathmandu, empates de línea e
impuestos duplicados. Las comprobaciones denegadas también se contrastan con HTTP
404 del endpoint autenticado (los accesos de otra empresa están además cubiertos
por la regresión compartida).

No se reejecutó la orquestación Docker completa de A1 ni su rollback entre hosts;
no hubo cambios de despliegue ni sustitución de proveedor. Las regresiones indicadas
arriba sí se ejecutaron nuevamente para A2. Los ensayos browser existentes utilizan
el build Angular local, cuyas fuentes de producto no cambiaron.

## Fallo detectado y corrección

La primera ejecución pasó 16 comparaciones SQL pero falló al comparar con la API:
el harness había seleccionado UTC para el candidato y la API usaba
`America/Montevideo`. El mismo instante aparecía con `+00:00` frente a `-03:00`.
Se corrigió el harness para consultar `SHOW TimeZone` y compartir la zona por
defecto; se conservaron pruebas explícitas en tres zonas. No se tocaron datos de
producción, el endpoint, snapshots ni el comparador para ignorar offsets.

La restauración inicial en sandbox no pudo acceder a NuGet; la restauración con
acceso de red y la verificación locked posterior pasaron. No se deshabilitó la
auditoría de paquetes ni se cambió la configuración de seguridad del producto.

## Evidencia y referencia recuperable

Ejecución aprobada: `e2e/test-results/mysql-a2-df2d4abf-6110-4d99-85c3-8041b7d2f84a`.
Primera ejecución fallida: `e2e/test-results/mysql-a2-189a2633-542d-4343-8a94-652545ba5f1b`.
PostgreSQL temporal conservado y detenido: directorio indicado en
`e2e/mysql-a2/evidence/report.json` bajo `securityEvidence`.

Los JSON candidato/oráculo se versionan en `evidence/data`. Una muestra completa
de ambas entradas para A4/ticket está en `evidence/documents`, con HTML, PNG y PDF;
el reporte registra hashes de las seis comparaciones de render. Se inspeccionaron
visualmente las capturas candidatas A4 y ticket semilla.

La función original permanece en `database/003-view-invoice-data.sql`, en main y
en la copia de referencia del harness. El reporte registra SHA-256. El ensayo
comprueba la referencia antes de instalar scripts sólo en su nuevo cluster: no
necesita restaurar ni modificar PostgreSQL del usuario.

## Límites y riesgos pendientes

No se certifica equivalencia para todo el dominio PostgreSQL: fechas infinitas,
BC o fuera del rango de DateTime/DateOnly y configuraciones DateStyle no ISO quedan
fuera del corpus y deben inventariarse antes de migrar datos existentes. No se
agregaron reglas de rechazo a la API. Tampoco se hizo benchmark ni prueba de carga
de las tres consultas; el candidato requiere evaluación de planes en la integración.

Los órdenes históricamente indefinidos y la conservación de zona de sesión deben
seguir explícitos al desarrollar el futuro adaptador MySQL. La prueba de JSON en
.NET es exacta; la comparación de render utiliza las conversiones normales del
frontend JavaScript, sin confundirlas con preservación numérica en almacenamiento.

La habilitación del constructor en el endpoint y su lector MySQL quedan pendientes
de la etapa correspondiente. No se creó esquema MySQL, no se tocó autenticación ni
se eliminó NestJS. A2 termina aquí; A4 no fue iniciada. No hubo push.
