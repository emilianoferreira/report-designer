# A3 — Viabilidad de MySQL, proveedor y almacenamiento JSON

Fecha: 2026-11-07. Rama: `codex/mysql-migration`, sobre `c9cc53c` (A1).
Main se conserva en `0c9e5d64cfe298fa6bd92ec31328a9d20d82a009`.

**Evaluación A3 completada: viable técnicamente para continuar el desarrollo interno,
con diferencias de JSON y condiciones de distribución documentadas. No se inició A2.
No se adoptó el proveedor ni un tipo JSON en la persistencia del producto.**

## Resultado y recomendación

Se ejecutó MySQL Community 8.4.13 con .NET 10, Oracle MySql.EntityFrameworkCore
10.0.12, MySql.Data 26.10.0 y EF Core/Relational 10.0.12. Todos son paquetes estables
con versiones exactas y lockfile. SDK utilizado: 10.0.403; runtime: 10.0.14.
Imagen: `mysql:8.4.13@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902`.

Oracle es el candidato probado para mantener EF Core 10. El paquete realmente
restaurado declara `net10.0` y las dependencias indicadas; el inventario guarda sus
hashes. Pomelo estable 9.0.0 depende de EF Core 9: compatibilidad con el runtime
.NET 10 no equivale a compatibilidad con EF Core 10. No se propone forzarlo ni usar
previews. Fuentes: [Oracle NuGet](https://www.nuget.org/packages/MySql.EntityFrameworkCore/10.0.12)
y [Pomelo NuGet](https://www.nuget.org/packages/Pomelo.EntityFrameworkCore.MySql/9.0.0).

La prueba inicial falló al mapear Guid convertido a string a `char(36)` con este
proveedor. `varchar(36)` ASCII binario con conversión explícita funciona: inserción,
lectura y filtro por Guid. Esto preserva los IDs y constituye una alternativa
comprobada; no se generaliza el fallo a todas las configuraciones de CHAR.

## Evidencia ejecutada

| Comprobación | Resultado observable |
|---|---|
| Restore con `--locked-mode` | Exit 0; sin supresión de auditoría NuGet |
| Build del proyecto aislado | Exit 0; 0 warnings, 0 errores |
| Auditoría de directas y transitivas | Sin vulnerabilidades reportadas por NuGet en esta fecha |
| MySQL real y TLS | Versión 8.4.13; cifrado con CA verificada; CA ajena rechazada |
| EF: UUID, decimales y fechas | IDs idénticos, DECIMAL(15,2)/(15,4) exactos, UTC con microsegundos |
| Arrays | Orden, duplicados, Unicode y null conservados; SQL NULL distinto de [] |
| Rollback | Revisión original visible después de revertir |
| Bloqueo | Segunda conexión recibe timeout 1205 mientras otra mantiene FOR UPDATE |
| Dos escritores con revisión esperada | Exactamente un éxito y un conflicto; revisión final 2 |
| Escritores legacy sin revisión | Ambos aceptados; revisión avanza; no detectan intención obsoleta |
| Comparación JSON | 12 entradas por 2 opciones; resultado detallado debajo |
| Artefactos del ensayo anterior | 13 hashes de A1 sin cambios |

Ejecución final del programa: 17 comprobaciones aprobadas y 24 comparaciones.
La prueba de revisión reproduce la primitiva de concurrencia, no responde HTTP:
la conservación de If-Match, ETag y códigos HTTP deberá comprobarse al integrar el
repositorio real. Los clientes sin If-Match no obtienen detección de edición obsoleta;
no se introduce esa garantía durante la migración. El caso legacy es secuencial,
no una prueba de carga ni una carrera de actualización de documentos.

Se utiliza `VerifyCA`; no se declara probada la validación de hostname/SAN de una
instalación productiva. Fechas: el ensayo fija UTC en servidor y en el convertidor
de lectura, con precisión de seis decimales. No autoriza guardar DateTime locales
sin normalizar ni prueba todos los cambios de zona/DST del producto.

## Comparación JSON contra PostgreSQL 16.15 real

El oráculo es `SELECT $1::jsonb::text` en un cluster nuevo. No se simula JSONB con
JSON.parse. Las lecturas de MySQL pasan por EF; los números del comparador usan
BigInteger y exponente, evitando esconder redondeos de double/JavaScript.

| Casos | JSON nativo | LONGTEXT + CHECK(JSON_VALID) |
|---|---|---|
| Moldes A4, ticket 80 y etiqueta | Equivalentes | Equivalentes |
| Unicode, propiedades desconocidas, objetos/arrays/null | Equivalentes | Equivalentes |
| Número de alta precisión | Pierde precisión | Conserva el valor exacto |
| Claves repetidas | Normaliza, última gana | Conserva texto; última gana sólo en comparación semántica |
| Notación decimal/exponencial y -0 | Equivalentes por valor | Equivalentes por valor |
| JSON null | Conservado | Conservado |
| Documentos de 1 MiB y 31 MiB | Conservados | Conservados |
| JSON inválido | Rechazado, error 3140 | Rechazado, CHECK 3819 |
| Exploratorio: 1e400 | Rechazado | Rechazado por JSON_VALID |

PostgreSQL acepta `1e400`; **ninguna opción es sustituto universal de JSONB**.
Este caso se declaró exploratorio antes de ejecutar; no se retiró un caso fallido
para lograr un resultado positivo. Hay 11 casos requeridos: JSON nativo falla uno,
LONGTEXT no falla ninguno. Los rechazos esperados cuentan como resultados correctos.

Ejemplo detectado: `12345678901234567890.123456789` se lee como
`1.2345678901234567e19` con JSON nativo; LONGTEXT y PostgreSQL conservan el valor.
La fracción `0.12345678901234567890123456789` también se redondea en JSON nativo.

Recomendación provisional para los moldes: preferir LONGTEXT con CHECK por la
preservación numérica observada. Antes de decidir el esquema en A4/A5, definir cómo
mantener la normalización de claves repetidas de JSONB sin convertir números a
double, y examinar el dominio de valores extremos de datos existentes. No se
incorpora ahora un normalizador ni una nueva regla de validación del producto.
El ensayo de 31 MiB prueba almacenamiento, no el límite HTTP: usa
`max_allowed_packet=128 MiB`, que deberá configurarse conscientemente en la futura base.
No se realizó benchmark ni se concluye superioridad de rendimiento o índices.

## Evaluación de licencia

Los dos paquetes Oracle descargados declaran
`GPL-2.0-only WITH Universal-FOSS-exception-1.0`. Se inspeccionaron sus nuspec y
LICENSE de Connector/NET 26.10.0 Community; hashes en `package-licenses.json`.
La excepción aplica a software FOSS que cumpla sus condiciones, no habilita en
general distribuir software propietario. [Texto oficial de la excepción](https://oss.oracle.com/licenses/universal-foss-exception/).

| Modalidad de la aplicación web | Evaluación y condición |
|---|---|
| Uso interno de Zureo | Viable para este desarrollo sin distribución externa. Inferencia basada en GPLv2, sección 0, incluida en el paquete: ejecutar el programa no está restringido. |
| SaaS alojado por Zureo | Candidato viable si se presta acceso web sin entregar backend/conector a terceros. GPLv2 no agrega la obligación por acceso remoto de AGPL. Revisar entidades operadoras, terceros y artefactos realmente entregados antes de comercializar. |
| Instalación en clientes, aun siendo web | Se entregan backend, DLL o contenedor: hay distribución. No declarar autorizado un producto propietario sólo por la excepción FOSS. Resolver licencia comercial o cumplimiento GPL antes de esa entrega. |

Oracle ofrece licencia dual para software combinado/distribuido y contempla
acuerdos comerciales para distribuidores propietarios. No se compró ni se aceptó
un contrato comercial; la evaluación no sustituye la aprobación legal del modelo
de distribución. [Política oficial OEM/ISV](https://www.mysql.com/about/legal/licensing/oem/).
Instalar MySQL por separado no elimina automáticamente las obligaciones de la DLL
Oracle que acompaña al backend. La distribución del servidor también se debe evaluar.

El inventario abarca 26 paquetes. Los restantes metadatos declaran principalmente
MIT y Google.Protobuf BSD-3-Clause. Tres paquetes K4os sólo incluyen licenseUrl:
se preserva ese dato en vez de inventar una expresión SPDX. Sus repositorios muestran
MIT ([LZ4](https://github.com/MiloszKrajewski/K4os.Compression.LZ4/blob/master/LICENSE),
[xxHash](https://github.com/MiloszKrajewski/K4os.Hash.xxHash/blob/master/LICENSE)); antes
de redistribuir corresponde fijar sus avisos a las versiones exactas y preparar
los avisos de terceros. La auditoría de vulnerabilidades no es una auditoría legal.

Alternativas si no se acepta Oracle para distribución: esperar/probar un Pomelo
estable compatible con EF Core 10, o evaluar MySqlConnector con SQL explícito en
los repositorios afectados. La segunda exige más trabajo y no fue implementada ni
validada aquí. No se propone bajar EF Core ni cambiar la arquitectura para salvar
una decisión de licencia todavía pendiente.

## Archivos, reproducción y límites del cierre

- `backend-dotnet/probes/MySqlStage3`: proyecto, programa y lockfile nuevos, separados del ensayo interrumpido.
- `e2e/mysql-a3/run.mjs`: orquestación, corpus, aislamiento y limpieza acotada.
- `e2e/mysql-a3/README.md`: comandos y significado de las aserciones.
- `e2e/mysql-a3/evidence`: resumen final, comparación, corpus con hashes, inventario de licencias, auditoría y registro del fallo inicial.
- Este informe. Sin cambios en código/configuración de producto, SQL principal, NestJS ni snapshots.

Los JSON grandes y salidas completas se conservan localmente bajo
`e2e/test-results/a3-c3a5d36e652647b2ad067f22eaefbcf6`.
El primer fallo está en `e2e/test-results/a3-062577630d674068b9b8a7beab864b89`.
La ejecución intermedia satisfactoria está en `e2e/test-results/a3-dfd0ee968b6d4c14aa38a4ac53ca9edf`.
Los contenedores propios fueron retirados y los clusters PostgreSQL temporales
detenidos. No se tocó PostgreSQL del usuario ni se limpiaron recursos ajenos.

No se repitió la suite completa de A1 porque sólo se agregó un ensayo independiente;
sus resultados quedan referenciados en `mysql-a1-report.md`, sin presentarlos como
ejecuciones nuevas. A3 no certifica autenticación, aislamiento empresarial ni recorrido
HTTP/renderer sobre MySQL: eso requiere las integraciones de A4/A5 y regresiones de A6.

Aceptación observable de A3: restauración reproducible, operaciones reales de EF y
SQL, TLS positivo/negativo, comparación contra PostgreSQL con diferencias visibles,
licencias evaluadas por modalidad y herramientas aisladas reproducibles. Cumplido
para la evaluación de viabilidad; quedan condicionadas la equivalencia completa de
persistencia y la distribución propietaria en clientes. El siguiente trabajo del
plan es A2, pero no se inicia sin una nueva instrucción. No hubo push.
