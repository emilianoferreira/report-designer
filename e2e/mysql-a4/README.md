# A4 — pruebas aisladas de esquema y autenticación

Requiere .NET 10, dependencias Node existentes,
Chrome y Docker (en Windows se utiliza Docker por WSL). Desde la raíz:

```powershell
dotnet restore backend-dotnet/src/ReportDesigner.Api/ReportDesigner.Api.csproj --locked-mode
dotnet build backend-dotnet/src/ReportDesigner.Api/ReportDesigner.Api.csproj --no-restore -m:1
dotnet restore backend-dotnet/tools/ProvisionMySqlUser/ProvisionMySqlUser.csproj --locked-mode
dotnet build backend-dotnet/tools/ProvisionMySqlUser/ProvisionMySqlUser.csproj --no-restore -m:1
npm run build
node e2e/mysql-a4/run.mjs
node e2e/price-labels/concurrency-api.mjs
```

El runner MySQL crea un contenedor con nombre/etiqueta únicos, imagen 8.4.13 fijada
por digest, puerto sólo local, credenciales aleatorias, UTC y transporte seguro
obligatorio. Instala el esquema, provisiona identidades sintéticas, limita permisos
del usuario de aplicación y arranca dos réplicas de API, además de instancias para
verificar producción y fallos TLS. No usa conexiones del usuario.

`browser.mjs` sirve el build Angular real en un origen local y reenvía `/api` hacia
la API real: prueba login, cambio de empresa, rol viewer, rotación CSRF y logout.
No simula respuestas de autenticación. Desde A5, este runner compartido aplica
002 y espera 200 en las rutas de negocio; la evidencia histórica A4 conserva
sus resultados originales. La cobertura de persistencia se ejecuta desde A5.

La prueba termina con un dump básico restaurado en otra base **del mismo contenedor
aislado**; compara cantidades de seis tablas. No prueba recuperación operacional,
PITR ni equivalencia binaria de todos los datos. El dump contiene hashes de
autenticación: permanece sólo en `e2e/test-results`, nunca en Git.

Los procesos propios se detienen en finally. El contenedor y sus volúmenes anónimos
se retiran sólo tras comprobar su etiqueta de propiedad. No se hace prune ni se
limpian cachés o recursos ajenos. Si hay interrupción forzada, revisar el identificador
del log antes de retirar recursos. Los resultados y backup locales se conservan.

`evidence/report.json` contiene las comprobaciones MySQL; `postgres-security.json`
registra las 345 solicitudes de la regresión PostgreSQL/NestJS/.NET compartida.
Ver [informe](../../docs/mysql-a4-report.md) y [configuración opt-in](../../database/mysql/README.md).
