# Backend ASP.NET Core — etapa 1

Base de la migración progresiva. El host ASP.NET Core arranca junto a NestJS y comprueba su conexión a PostgreSQL mediante EF Core/Npgsql. Angular mantiene su proxy actual hacia NestJS. Las nueve operaciones de negocio permanecen allí y sus contratos/snapshots no se modifican.

## Estructura y límites

```text
ReportDesigner.Api ────────────> Infrastructure ─────> Application ─────> Domain
  Host HTTP y composición        EF Core/Npgsql       Casos de uso       Modelo de dominio
```

| Proyecto | Responsabilidad en esta etapa |
|---|---|
| `src/ReportDesigner.Api` | Configuración, controladores registrados, serialización JSON, salud y referencia del contrato |
| `src/ReportDesigner.Infrastructure` | Registro de dependencias, DbContext y comprobación de conectividad PostgreSQL |
| `src/ReportDesigner.Application` | Límite reservado para casos de uso y puertos; todavía sin implementación de negocio |
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

`ReportDesignerDbContext` se registra con vida scoped y proveedor PostgreSQL. El esquema sigue siendo responsabilidad de `database/001-schema.sql`, `002-seed.sql` y `003-view-invoice-data.sql`. El arranque no ejecuta `EnsureCreated`, `Migrate`, seeds ni ningún DDL. El contexto todavía no tiene entidades mapeadas: se agregarán al migrar cada funcionalidad, conservando nombres de tablas y columnas existentes.

| Ruta del host .NET | Resultado |
|---|---|
| `GET /health/live` | 200 `Healthy` si el proceso atiende HTTP, sin consultar la base |
| `GET /health/ready` | 200 `Healthy` cuando `SELECT 1` funciona mediante EF Core; 503 `Unhealthy` si la conexión falla |
| `GET /reference/openapi.json` | Solo Development: copia exacta del contrato NestJS de etapa 0 |

Readiness comprueba conectividad, no existencia ni compatibilidad del esquema. Los cuerpos de salud no exponen errores SQL ni credenciales. La API puede arrancar con una base inaccesible y seguir viva; readiness indica que aún no está lista.

El contrato compartido se copia desde `contracts/openapi.json` al compilar/publicar. La ruta `reference` sirve una referencia de migración, no un documento generado de operaciones ya disponibles en ASP.NET Core. `/api/templates*` y `/api/invoices*` siguen sin implementación en .NET (404); no existe redirección ni cambio del proxy Angular.

La configuración JSON conserva nulls, nombres explícitos y claves de diccionarios; no permite números JSON especiales ni conversión implícita de strings a números. Los DTO futuros deberán usar nombres de contrato explícitos y mantener `template_json` como JSON abierto, sin convertir las extensiones del editor a un modelo rígido. Los detalles de fechas, errores, versiones y decimales se implementarán junto a cada endpoint y deberán pasar la etapa 0 antes de cambiar tráfico.

## Verificación aislada

Desde la raíz del repositorio, con dependencias npm y Chromium instalados según `e2e/stage0/README.md`:

```powershell
# Solo si el SDK no está en PATH:
$env:DOTNET_HOST_PATH = "$PWD/tmp/dotnet-sdk/dotnet.exe"
npm run test:dotnet
```

Reutiliza el runner de etapa 0: crea PostgreSQL descartable, carga los SQL y verifica su marcador antes de iniciar las comprobaciones .NET. Restaura paquetes con lock, compila y comprueba salud, conexión real, fallo con credenciales incorrectas, rechazo de configuración ausente, identidad del contrato y ausencia de rutas de negocio migradas. Después ejecuta los 25 casos nuevos de etapa 0 y los 18 existentes de NestJS contra esa misma base aislada. La configuración del entorno de desarrollo y los datos existentes no se usan.

Los logs .NET y `stage1.json` quedan junto a los resultados de etapa 0 en `e2e/test-results/stage0-<uuid>`. El SDK debe estar instalado o indicado por `DOTNET_HOST_PATH`; el runner no lo descarga. La caché de NuGet y el directorio CLI quedan bajo `tmp`.

Validación del 3 de noviembre de 2026 en Windows x64: build Release sin errores ni advertencias, siete comprobaciones de la base .NET aprobadas y regresión completa de 25 casos de etapa 0 más 18 casos preexistentes del backend aprobada. Se conserva la referencia original; no se regeneran snapshots para esta etapa.

La siguiente etapa puede empezar por consultas de Templates con mapeos explícitos y DTO compatibles. El cambio de tráfico y la sustitución de endpoints requieren sus pruebas de paridad; no forman parte de esta entrega.
