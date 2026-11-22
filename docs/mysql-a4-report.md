# A4 — Esquema, conexión y autenticación MySQL

Fecha: 2026-11-07. Rama: `codex/mysql-migration`, sobre `1f43e97` (A2).
Main permanece en `0c9e5d64cfe298fa6bd92ec31328a9d20d82a009`.

**A4 completada para el alcance de desarrollo: esquema, conexión y autenticación.
La aplicación completa NO está migrada. No se inició A5 ni se hizo push.**

## Resultado

MySQL 8.4.13 tiene un esquema explícito reproducible desde cero y la API .NET 10
puede autenticar usuarios, recuperar sesiones, cambiar de empresa y cerrar sesión
utilizándolo. La selección es opt-in mediante `Database:Provider=MySql` y
`ConnectionStrings:MySql`. Sin esa selección, PostgreSQL sigue siendo el motor.
No se cambiaron appsettings, scripts de arranque ni Docker predeterminados.

La lógica PBKDF2, comparación constante, tokens opacos, CSRF, roles y controladores
se reutiliza. `SessionDatabase` concentra conexión, parámetros y variantes SQL;
`SessionStore` sirve a ambos motores. El contador de intentos hace upsert y lectura
en una transacción ReadCommitted para mantener la exclusión por fila y el límite
exacto entre réplicas. Se cierran las conexiones antes del hash costoso y de las
consultas siguientes para no retener recursos innecesarios.

MySQL usa Oracle `MySql.Data` 26.10.0 fijado, validado en A3. La autenticación actual
ya utiliza SQL directo: no se agrega EF para reescribirla. El proveedor EF Oracle
se integrará con repositorios de negocio cuando corresponda; no se adelantó A5.
Npgsql y las versiones EF actuales del producto permanecen sin cambios. Los
lockfiles incluyen la nueva dependencia y sus transitivas; el harness A2 conserva
sus versiones previas, verificadas con restore locked forzado.

## Archivos afectados

| Archivo/componente | Cambio |
|---|---|
| `database/mysql/001-schema.sql` | 14 tablas InnoDB, 18 FK explícitas, índices y checks |
| `database/mysql/README.md` | Configuración opt-in, representaciones, privilegios y provisión |
| `Infrastructure/Authentication/SessionDatabase.cs` | Adaptación de conexión/SQL por motor |
| `Infrastructure/Authentication/SessionStore.cs` | Reutiliza la política existente con comandos parametrizados comunes |
| `Infrastructure/DependencyInjection.cs` | Selección explícita; validación de conexión y TLS |
| `Infrastructure/Persistence/MySqlHealthCheck.cs` | Readiness sin revelar detalles internos |
| `Api/Program.cs` | Barrera temporal de rutas de negocio sólo en modo MySQL A4 |
| `Infrastructure.csproj` y lockfiles API/Infrastructure/probe A2 | Dependencia Oracle y resolución reproducible |
| `backend-dotnet/tools/ProvisionMySqlUser` | Provisión administrativa transaccional por stdin, separada de la API |
| `e2e/mysql-a4` | Ensayo aislado, navegador real, evidencia y reproducción |

Las rutas de templates/invoices en MySQL devuelven 503 **después** de la protección
de autenticación/autorización. Anónimos siguen recibiendo 401 y un viewer intentando
escribir templates recibe 403. No se registran repositorios PostgreSQL en ese modo:
no hay fallback silencioso a otra base. Los contratos y servicios del modo PostgreSQL
permanecen funcionales. Angular muestra el error esperado al intentar cargar moldes;
la captura de prueba no pretende mostrar una aplicación MySQL completa.

## Esquema y representaciones

Se conservan relaciones, nullabilidad, precisiones NUMERIC, versiones y columnas.
UUID es varchar(36) ASCII binario con validación de PK; las FK se validan mediante
constraints reales. Los IDs se proporcionan explícitamente como UUID canónicos,
con `Guid.NewGuid()` para nuevas entidades. Se evitó usar UUID() de MySQL como
default porque generaría v1. No se alteran IDs existentes ni se importa información
del usuario. La herramienta administrativa conserva el ID al reprovisionar por email.

Fechas DATETIME(6) y servidor de prueba UTC; vencimiento de sesión con
UTC_TIMESTAMP(6). JSON LONGTEXT + CHECK sigue la evidencia de precisión de A3.
Tags tiene representación array JSON. Antes de habilitar negocio deben resolverse
normalización de claves duplicadas, dominio numérico extremo y semántica completa
de tags. No se atribuye equivalencia universal con JSONB/TEXT[] al mero DDL.
No se tradujeron GIN ni build_invoice_data; los endpoints todavía no necesitan sus
equivalentes MySQL. El constructor A2 no fue sustituido ni conectado aquí.

MySQL no hace rollback de DDL. Se crea en base vacía y no se ejecuta migración
automática al arrancar. El ensayo comprueba tablas y FK en information_schema y
provoca violaciones reales de FK, roles, email normalizado, booleanos y JSON.

## Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| Build API .NET y herramienta administrativa | Exit 0, sin warnings/errores |
| Restore locked API, herramienta y probe A2 | Exit 0; A2 también con `--force` |
| Auditoría NuGet API, directas/transitivas | Sin vulnerabilidades reportadas en esta fecha |
| MySQL aislado final | 45 comprobaciones registradas, aprobado |
| Creación desde cero | 14 tablas y 18 FK activas |
| Restricciones y permisos | Rechazos efectivos; usuario de aplicación sin CREATE ni acceso de negocio |
| Sesiones | Login, normalización, hash persistido, expiración UTC de 8 h, revocación y logout |
| Seguridad | CSRF, aislamiento de lista de empresas, viewer, usuarios/empresas inactivos, membresías revocadas |
| Réplicas | Sesión compartida, rotación de compañía/CSRF/rol y límite concurrente de 10 aceptados + 10 bloqueados |
| Rate limit | Ventana vencida se reinicia; límite por IP independiente del email |
| TLS | CA válida conecta; modo sin verificación falla al iniciar; CA ausente produce readiness 503 y error HTTP saneado |
| Producción | Cookie Secure; OpenAPI de desarrollo no publicado |
| Provisión | Alta, rollback con empresa inexistente, reprovisión con revocación de sesiones |
| Aplicación web real | Angular → API → MySQL: login, cambio de empresa/rol, rotación CSRF y logout aprobados |
| Respaldo básico | Dump local y restauración en otra base aislada; cantidades iguales en seis tablas |
| Regresión PostgreSQL | 345 solicitudes aprobadas en .NET y NestJS: seguridad, aislamiento y concurrencia actuales |
| Angular build | Exit 0; warnings CommonJS existentes de jsbarcode/qrcode |

La prueba web usa el build real, un proxy local y respuestas reales de la API,
sin mocks de autenticación. La captura `evidence/authenticated-company.png` muestra
Empresa B y Solo lectura, junto al error de carga de moldes esperado en A4.
Se inspeccionó visualmente. No se actualizaron snapshots.

No se repitieron las 389 pruebas Angular ni toda la orquestación Docker de A1:
no hay cambios de frontend o despliegue. La regresión PostgreSQL de autenticación
se ejecutó nuevamente tras el último cambio del código compartido. El ensayo MySQL
valida servidor Linux en contenedor y API .NET sobre Windows; despliegue Linux de
la API y preparación operacional completa siguen fuera de A4.

## Evidencia, fallos y recuperación

Ejecución final: `e2e/test-results/a4-b9fc3f1147f14e18a7b2fba47b482712`.
Reportes versionados en `e2e/mysql-a4/evidence`; hash de esquema y del dump en el
reporte. El dump contiene material de autenticación sintético y se conserva sólo
localmente, excluido de Git. La comprobación de restauración es básica, no un ensayo
de recuperación operacional ni de igualdad de todo el contenido.

La primera creación falló por un separador incorrecto entre checks al preparar el
DDL. Se corrigió el archivo y se repitió la creación en un contenedor nuevo;
no se omitieron restricciones para pasar. `initial-failure.json` conserva el resultado.
Las ejecuciones intermedias y final retiraron sólo sus propios contenedores/volúmenes
tras verificar la etiqueta de propiedad. Los procesos API y proxy propios se
detuvieron; PostgreSQL temporal se detuvo y se conserva. No se tocó la base del
usuario ni se hizo limpieza global. Los 13 artefactos del ensayo interrumpido siguen
con sus hashes originales.

Volver al modo predeterminado sólo requiere retirar el override de proveedor y usar
la conexión PostgreSQL existente. Eso no sincroniza escrituras ni convierte datos:
no se afirma un rollback entre bases divergentes. En esta etapa las escrituras
MySQL fueron exclusivamente de pruebas aisladas.

## Criterios de cierre y pendientes

Cumplidos: esquema ejecutable con relaciones verificadas, conexión TLS opt-in,
autenticación real en API y navegador, controles de empresa/roles/CSRF, sesiones y
rate limit compartidos entre réplicas, provisión transaccional, respaldo básico,
regresión PostgreSQL y evidencia reproducible. Main permanece intacta.

Pendientes de A5: CRUD de moldes, If-Match/eliminación protegida sobre MySQL,
lectura de comprobantes e integración del constructor .NET, y equivalencia funcional
de renderizado sobre datos MySQL. No fueron implementados aquí. La migración de
datos existentes y la recuperación productiva requieren sus propias validaciones.
Sigue vigente la evaluación de licencia de A3 para distribución en clientes; ahora
el artefacto API de esta rama incluye MySql.Data aunque se seleccione PostgreSQL.
No se publicó ni desplegó ese artefacto. A4 termina aquí, antes de A5.
