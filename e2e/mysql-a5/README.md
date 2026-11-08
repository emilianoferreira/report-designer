# A5 — persistencia MySQL y comparación con PostgreSQL

Ejecutar desde la raíz, en `codex/mysql-migration`. Requiere los prerrequisitos
A4 (Docker por WSL, Chrome, .NET 10 y dependencias Node) y PostgreSQL embebido
utilizado por el harness de concurrencia existente.

```powershell
dotnet restore backend-dotnet/src/ReportDesigner.Api --locked-mode
dotnet build backend-dotnet/src/ReportDesigner.Api --no-restore
dotnet restore backend-dotnet/tools/ProvisionMySqlUser --locked-mode
dotnet build backend-dotnet/tools/ProvisionMySqlUser --no-restore
npm run build
node e2e/mysql-a5/run.mjs
node e2e/mysql-a2/run.mjs
node e2e/price-labels/regression.cjs
node e2e/fiscal-profile/regression.cjs
```

No compilar mientras el runner usa las DLL. El runner crea PostgreSQL y MySQL
independientes de las bases del usuario. Reutiliza las regresiones PostgreSQL,
el runner A4, autenticación real y dos réplicas MySQL. Transfiere exclusivamente
fixtures sintéticos de diez tablas, exportando números como texto y fechas UTC
con seis decimales. No es una herramienta de migración productiva.

Comprueba CRUD, If-Match, clientes legacy, eliminación protegida, aislamiento,
JSON exacto (incluido 1e400), nulos, metadatos y contratos de error. Compara cinco
comprobantes y un caso con offset, microsegundos y vencimiento bisiesto contra
build_invoice_data(). Renderiza A4/ticket con datos de ambos endpoints reales:
compara HTML, capturas y cantidad de páginas; no exige PDFs binariamente iguales.

La regresión de etiquetas y fiscal usa el build Angular con HTTP simulado; no se
presenta como sustituto del recorrido API real anterior. No cambia snapshots.

Resultados completos en `e2e/test-results/mysql-a5-*` y el directorio MySQL que
indica su report.json. Los backups y logs completos quedan locales; no publicar
credenciales, cookies, dumps ni certificados. `evidence/` conserva sólo resultados
sanitizados y documentos sintéticos. Limpieza limitada a los procesos y contenedor
propios, con comprobación de etiqueta. No ejecutar prune.

Ver [informe A5](../../docs/mysql-a5-report.md) y
[configuración y permisos](../../database/mysql/README.md).
