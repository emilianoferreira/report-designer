# A2 — Constructor .NET comparado contra PostgreSQL

Este harness usa el aislamiento y las regresiones de seguridad de A1. No crea un
endpoint alternativo ni reemplaza `IInvoiceQueries` en el host.

Desde la raíz, en `codex/mysql-migration`, con dependencias existentes instaladas:

```powershell
dotnet restore backend-dotnet/probes/InvoiceDataStage2/InvoiceDataStage2.csproj --locked-mode
dotnet build backend-dotnet/src/ReportDesigner.Api/ReportDesigner.Api.csproj --no-restore -m:1
dotnet build backend-dotnet/probes/InvoiceDataStage2/InvoiceDataStage2.csproj --no-restore -m:1
npm --prefix server run build
node e2e/mysql-a2/run.mjs
```

Requiere SDK .NET 10, Node, embedded-postgres de `server` y Chrome instalado
(`CHROME_BIN` opcional). No requiere MySQL ni Docker. El runner compartido crea un
cluster PostgreSQL temporal con credenciales aleatorias y puertos locales libres,
carga esquema/semillas y arranca las APIs .NET y NestJS. Al finalizar detiene sus
servicios y conserva el cluster. No lee ni modifica la base del usuario.

El probe recibe la conexión sólo por entorno, comprueba host/puerto y una marca de
propiedad aleatoria del ensayo. La compañía del probe es un contexto de pruebas;
en el producto, `ICompanyContext` sigue proviniendo de la sesión autenticada.

La referencia `postgres-reference.sql` es una copia recuperable de la función
original. Antes de ejecutar se comprueba que siga siendo igual al script vigente
(normalizando únicamente finales de línea). No se modifica ni reinstala esta
función en bases existentes. Para reproducir la referencia se utiliza exclusivamente
el cluster temporal del harness, que instala el script original.

El constructor recibe un modelo relacional tipado. El lector candidato conserva
los filtros de empresa/contacto/sucursal/tipo y usa una transacción RepeatableRead
para leer encabezado, líneas e impuestos desde una misma vista. Sólo el probe lo
invoca: el endpoint continúa llamando a `build_invoice_data()`.

Resultados crudos: `e2e/test-results/mysql-a2-<uuid>`. `comparison.json` contiene
12 comparaciones exactas de estructura/valores y 5 rechazos de acceso o inexistencia.
El comparador de .NET no convierte números a double: usa coeficiente entero y
exponente; ignora orden de propiedades, pero **no** ordena arrays ni elimina nulls.
Los JSON candidato/oráculo se guardan antes de pasar datos al navegador, donde
aplican las conversiones habituales de JavaScript.

Para tres comprobantes (normal, nulos, precisión/Unicode) se obtienen datos del
endpoint .NET autenticado real y se comparan con el candidato. Cada uno se renderiza
en A4 y ticket con `HtmlRendererService` de producto: se verifican HTML, preview,
texto, PNG, ausencia de errores de navegador y páginas PDF. No se compara el PDF
binariamente ni se agregan funcionalidades a la vista previa de Angular.

`evidence` conserva los JSON, resúmenes y una muestra A4/ticket de HTML, PNG y PDF
de ambas entradas. Los demás documentos quedan en el directorio crudo. No son
snapshots actualizables: cada ejecución compara candidato y oráculo vivos.

Los HTML se conservan literalmente, incluidos los espacios de una línea vacía
emitida por el renderer. `git diff --check` señala esos cuatro artefactos; no se
reescriben para maquillar el resultado. El chequeo de fuentes y documentación sí
debe pasar sin advertencias de whitespace.

Ver [informe, límites y resultados](../../docs/mysql-a2-report.md).
