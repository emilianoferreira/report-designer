# Preparación de producción — etapa 6

Paquete preparado para un host Linux con Docker Engine y Compose. No se ha desplegado ni publicado ninguna imagen. Angular se sirve como archivos optimizados con Nginx; las APIs .NET y NestJS permanecen disponibles en la red interna de Compose, conectadas al PostgreSQL existente. Solo el frontend se publica, por defecto en `127.0.0.1:8080`, detrás del gateway HTTPS del host.

```text
Navegador → gateway HTTPS/autenticación → Nginx + Angular
                                         /api → api-dotnet:8080 (normal)
                                              → api-nestjs:3000 (retorno explícito)
                                                        ↓
                                                PostgreSQL existente
```

## Archivos

| Archivo | Función |
|---|---|
| `web.Dockerfile` | npm ci + Angular production; runtime Nginx sin Node/dev server |
| `api-dotnet.Dockerfile` | Restore con lock + publish Release; runtime ASP.NET Core Production con usuario app |
| `api-nestjs.Dockerfile` | Nest compilado; runtime Node sin dependencias dev, usuario node |
| `compose.yaml` | Tres servicios, healthchecks, logs acotados, secretos en archivos y API_UPSTREAM reversible |
| `nginx/default.conf.template` | SPA, caché de chunks, index sin caché, /api sin reintentos y readiness del backend elegido |
| `production.env.example` | Configuración pública de host, imágenes y base, sin credenciales |
| `secrets.example/` | Formato de archivos privados que deben crearse fuera de Git |
| `edge-nginx.conf.example` | Ejemplo de gateway HTTPS y autenticación HTTP del host |
| `../.github/workflows/production-package.yml` | Workflow manual de build/validación, sin push ni despliegue |

El contexto Docker excluye .env, secretos, claves, node_modules, resultados y binarios locales. Las imágenes no incorporan contraseñas: los entrypoints leen los secretos al arrancar. Los scripts shell se versionan con LF. Las imágenes base se seleccionan por versión mayor/menor para recibir parches al construir; para una liberación repetible, registrar los digests de las tres imágenes finales y conservar esas imágenes, sin reconstruir la misma etiqueta. El workflow manual todavía debe ejecutarse en un equipo con Docker para confirmar los builds Linux.

## Configuración que deberá completar el operador

Los comandos de arranque de esta guía son para una ejecución futura aprobada. Desde la raíz del repositorio:

```sh
cp deployment/production.env.example deployment/production.env
mkdir -p deployment/secrets
cp deployment/secrets.example/ConnectionStrings__Postgres.example deployment/secrets/ConnectionStrings__Postgres
cp deployment/secrets.example/DB_PASSWORD.example deployment/secrets/DB_PASSWORD
```

Editar los archivos privados, reemplazando los ejemplos. `production.env` y `deployment/secrets/` están ignorados por Git. `SECRETS_DIR` admite una ruta externa absoluta si los secretos se administran fuera del checkout.

- `RELEASE_TAG`: SHA revisado o identificador inmutable. No usar una etiqueta mutable compartida entre releases.
- `PUBLIC_HOST`: hostname real del gateway; se usa en AllowedHosts de .NET. El frontend conserva las rutas relativas /api y no incluye secretos ni destinos de API en el bundle.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`: PostgreSQL existente accesible desde los contenedores. `localhost` dentro de un contenedor es ese contenedor, no el host de la base.
- `ConnectionStrings__Postgres`: cadena Npgsql completa. Sus host/base/usuario deben coincidir con los anteriores. Escapar contraseñas con comillas según Npgsql; no pasar este archivo por sustitución de variables del shell.
- `DB_PASSWORD`: contraseña del mismo usuario para NestJS, con un único salto de línea final opcional.
- `pg-ca.pem`: cadena PEM de confianza del servidor PostgreSQL, suministrada por el administrador/proveedor. Crear este archivo en el directorio privado; no se incluye una CA ficticia en el paquete.

Ambos backends verifican TLS y el hostname de PostgreSQL: Npgsql con `SSL Mode=VerifyFull`/Root Certificate y pg con PGSSLMODE=verify-full/NODE_EXTRA_CA_CERTS. El hostname debe corresponder al certificado. El ejemplo espera PostgreSQL con TLS habilitado; la prueba local aislada usa loopback sin TLS y no acredita la conexión TLS real del proveedor.

Compose monta archivos privados como secretos de solo lectura; en Compose local no son una bóveda cifrada. Ajustar propietarios/permisos en el host para que los usuarios no root de las imágenes puedan leerlos (app en .NET y node en NestJS), y limitar el acceso a administradores. Los archivos fuente siguen siendo responsabilidad del operador y de su sistema de secretos. No imprimir `env`, las cadenas ni `docker inspect` en logs compartidos.

No hay servicio PostgreSQL, volumen de datos, migración, seed ni db:reset en Compose. El usuario de aplicación requiere los permisos existentes: lectura de tablas/función de Invoices y CRUD en report_templates, sin permisos de DDL ni de superusuario. Confirmar en ambos backends el mismo host/base y los mismos identificadores de empresa/documentos antes de habilitar tráfico. No ejecutar los SQL de creación/seed sobre una base ya utilizada.

## Validar y construir, sin arrancar la aplicación

```sh
docker compose --env-file deployment/production.env -f deployment/compose.yaml config --quiet
docker compose --env-file deployment/production.env -f deployment/compose.yaml build --pull
```

Estos comandos validan y construyen; no ejecutan `up`. La salida de `config` sin `--quiet` contiene configuración y rutas de secretos, pero no debe usarse para publicar valores privados. Conservar el SHA, lockfiles, digests de imágenes, configuración pública y evidencia de pruebas de cada release. Para transportar imágenes a otro host, usar un registro propio o docker save/load según el procedimiento del equipo; este paquete no hace push ni contiene credenciales de registro.

El workflow `Validate production package (no deployment)` permite hacer el build Linux manualmente en GitHub Actions. Comprueba los ejecutables y `nginx -t` dentro de las imágenes. No tiene acceso a la base ni pasos de despliegue. No se ha ejecutado desde esta sesión.

## Arranque futuro y aceptación

Antes de habilitar acceso, el gateway debe terminar HTTPS y aplicar autenticación o el acceso privado del entorno. La API conserva la deuda de autorización por empresa de NestJS; un gateway con contraseña no aporta aislamiento entre empresas. El ejemplo edge incluye autenticación básica para un entorno compartido de confianza; sustituirla por el mecanismo de identidad de la organización cuando corresponda. No publicar directamente los puertos de las APIs ni abrir el listener HTTP de Compose a Internet.

Para una base existente, acordar un respaldo consistente con su administrador antes del primer cambio de tráfico. Ejemplo para el operador: `pg_dump --format=custom --file=<ruta-privada>/before-release.dump --dbname=<base>` usando credenciales fuera de la línea de comandos (PGPASSFILE/secret manager) y verificar la restauración en otra base. No hay copias, restauraciones ni borrados automáticos en este paquete.

Una vez revisados los artefactos y completada la configuración, el operador podrá arrancar:

```sh
docker compose --env-file deployment/production.env -f deployment/compose.yaml up -d --no-build
docker compose --env-file deployment/production.env -f deployment/compose.yaml ps
curl --fail http://127.0.0.1:8080/health/live
curl --fail http://127.0.0.1:8080/health/ready
```

Ambas APIs se mantienen activas para un retorno rápido; web espera su estado healthy en el arranque inicial. Healthcheck de .NET comprueba SELECT 1; el de NestJS consulta la lista de una empresa inexistente. La ruta web `/health/ready` consulta ese mismo endpoint en el backend seleccionado y conserva los errores. La ruta `/health/live` comprueba solo Nginx. Un estado unhealthy no reinicia automáticamente un contenedor: el operador debe observarlo e intervenir. Los logs van a stdout/stderr y se rotan; no incluyen access logs de cuerpos de plantillas.

Comprobar por el gateway real: acceso HTTPS/autenticado, recarga directa de /templates y /price-labels, apertura desde el listado, guardar/recargar/renderizar un reporte A4, un ticket y una etiqueta, exportaciones y consultas Invoices. Verificar que los datos llegan a PostgreSQL y que no se está usando localStorage como sustituto. El preview sigue usando los datos de muestra actuales; el endpoint de facturas se valida aparte.

Nginx conserva estados/cuerpos de /api y no convierte errores en index.html. No reintenta una escritura contra NestJS cuando .NET falla. Los chunks con hash tienen caché immutable; index.html usa no-store. El límite de JSON de producción se fija en 32 MiB en Nginx, Kestrel y NestJS; JSON_BODY_LIMIT y Http__MaxRequestBodyBytes no alteran los defaults de desarrollo si se omiten. Ajustar coordinadamente el gateway externo si se cambia ese límite.

## Volver a NestJS sin reconstruir Angular ni restaurar datos

1. Confirmar que api-nestjs está healthy y conectado a la misma base. Esperar las escrituras en curso antes de cambiar tráfico.
2. Cambiar únicamente `API_UPSTREAM=api-nestjs:3000` en `deployment/production.env`. Conservar RELEASE_TAG e imágenes.
3. Recrear solo el proxy con la misma imagen:

```sh
docker compose --env-file deployment/production.env -f deployment/compose.yaml up -d --no-build --no-deps --force-recreate web
curl --fail http://127.0.0.1:8080/health/ready
```

4. Recargar y editar un documento guardado con .NET; verificar su versión y JSON en la base y las exportaciones. El bundle Angular es el mismo.
5. Para regresar a .NET, poner `API_UPSTREAM=api-dotnet:8080` y repetir la recreación de web.

No usar restart para cargar una variable de Compose nueva: se necesita recrear web. El cambio puede provocar una interrupción breve y no es un despliegue sin downtime; no repetir automáticamente escrituras cuyo resultado sea ambiguo. No alternar automáticamente entre backends. No hacer `down -v`, db:reset ni restaurar un respaldo al cambiar el proxy: eso perdería escrituras posteriores al respaldo. Si se necesita volver a imágenes de una release anterior, usar sus digests y comprobar su compatibilidad con el esquema; esta reversión de código es distinta de alternar los backends de la misma release.

## Pruebas locales sin despliegue

```powershell
$env:DOTNET_HOST_PATH = "$PWD/tmp/dotnet-sdk/dotnet.exe" # O SDK en PATH
$env:NGINX_HOST_PATH = "$PWD/tmp/stage6-tools/nginx-1.30.6/nginx.exe"
npm run test:production
```

En Linux se puede usar NGINX_HOST_PATH=/usr/sbin/nginx y opcionalmente NGINX_MIME_TYPES para el archivo mime.types; ejecutar la suite como usuario normal. Los binarios no se descargan automáticamente ni forman parte del repositorio.

La suite compila Angular production, publica .NET Release, arranca el assembly publicado en Production y NestJS compilado con NODE_ENV=production. Usa el bloque Nginx versionado, sustituyendo solo directorio de estáticos, puertos y destino loopback de la base aislada; ejecuta `nginx -t` y sirve los mismos bundles. Corre las 134 comparaciones previas, 68 pruebas de API/editor, 5 controles de retorno y comprobaciones de SPA, caché, salud, documento de 1 MiB y error 502 cuando el backend no responde. Los resultados quedan en e2e/test-results/stage0-<uuid>, incluido stage6.json; los procesos y la base se eliminan al finalizar.

Limitación de verificación: la prueba nativa acredita los artefactos y la configuración Nginx, pero no los permisos, entrypoints, DNS o healthchecks dentro de imágenes Linux. Este equipo no tiene Docker Engine: el build y la validación dentro de contenedores quedan preparados en el workflow manual y deben completarse antes de desplegar. TLS, DNS, credenciales, gateway, permisos reales y recuperación del PostgreSQL del entorno requieren la configuración real del operador.

Verificado el 3 de noviembre de 2026 en Windows x64: Angular production compilado (con advertencias CommonJS existentes de jsbarcode/qrcode), .NET 10.0.403 publicado sin errores ni advertencias, Nginx 1.30.6 con sintaxis válida y Compose 5.7.0 con configuración válida. `npm run test:production` aprobó 134 comparaciones, 68 pruebas, cinco controles de retorno y cuatro grupos de comprobaciones de producción. Los scripts shell pasaron bash -n. No se ejecutó Docker build, el workflow, push ni Compose up; la base y los procesos locales de prueba se limpiaron.

Referencias: [Compose secrets](https://docs.docker.com/reference/compose-file/secrets/), [Nginx sin privilegios](https://github.com/nginx/docker-nginx-unprivileged), [contenedores .NET](https://learn.microsoft.com/en-us/dotnet/core/docker/), [TLS en pg](https://node-postgres.com/features/ssl).
