# A3 — Ensayo aislado de MySQL y del proveedor

Herramientas exclusivas de pruebas; no forman parte de la solución ni del backend publicado.
Requiere la rama `codex/mysql-migration`, SDK .NET 10, Node, dependencias existentes de
`server` (embedded-postgres), Docker y acceso a NuGet para restaurar/auditar.
En Windows utiliza Docker dentro de WSL mediante `wsl -u root --exec docker`.

Desde la raíz:

```powershell
dotnet restore backend-dotnet/probes/MySqlStage3/MySqlStage3.csproj --locked-mode
dotnet build backend-dotnet/probes/MySqlStage3/MySqlStage3.csproj --no-restore -m:1
node e2e/mysql-a3/run.mjs
dotnet list backend-dotnet/probes/MySqlStage3/MySqlStage3.csproj package --vulnerable --include-transitive --format json
```

El runner crea un cluster PostgreSQL 16 temporal y un contenedor MySQL 8.4.13 fijado
por digest, con credenciales aleatorias, puerto local dinámico y TLS obligatorio.
No lee conexiones del producto. La base y el contenedor tienen un identificador
único; el programa rechaza bases sin ese identificador y servidores no locales.
Finalmente detiene PostgreSQL y conserva su directorio, y elimina exclusivamente
el contenedor y sus volúmenes anónimos tras verificar su etiqueta de propiedad.
No limpia cachés ni recursos ajenos. Una interrupción forzada puede requerir revisar
el contenedor identificado en el log antes de retirarlo; no usar limpieza global.

Los resultados crudos quedan en `e2e/test-results/a3-<id>`: entradas, salida JSONB
de PostgreSQL, lecturas de MySQL, comparación, comprobaciones y resumen. Son datos
sintéticos/fixtures, no datos del usuario. Los resúmenes revisados están en `evidence`.

`passed` significa que el proveedor supera las comprobaciones y al menos una
alternativa supera los 11 casos requeridos. **No significa que ambos almacenamientos
sean equivalentes a JSONB para cualquier entrada ni que la aplicación esté migrada.**
El caso exploratorio `1e400` es explícitamente no requerido para este ensayo: supera
el rango de Number del frontend, pero PostgreSQL lo acepta. Su diferencia debe
resolverse o descartarse con evidencia de datos antes de migrar la persistencia.

El comparador usa coeficiente entero y exponente decimal, sin pasar por `double`:
compara números por valor, objetos ignorando orden y tomando la última clave repetida,
y arrays conservando orden y duplicados. Registra además igualdad textual con la
entrada. La equivalencia de claves duplicadas es semántica; no prueba igualdad del
JSON HTTP crudo. No se generan ni actualizan snapshots.

La tabla de ensayo se crea mediante DDL explícito. Se prueba EF para inserción,
consulta, conversiones y rollback, y SQL parametrizado para bloqueo/revisión.
No se prueban migraciones EF generadas, el esquema completo, autenticación ni HTTP
de MySQL. Esos trabajos pertenecen a etapas posteriores.

Ver [informe y decisión condicionada](../../docs/mysql-a3-report.md).
