# Preproducción — etapa 9

Perfil preparado y verificable localmente, sin despliegue en producción. Reutiliza las imágenes Angular/Nginx, ASP.NET Core y NestJS y añade un gateway HTTPS sin privilegios. Ambas APIs permanecen activas sobre el mismo **PostgreSQL exclusivo de preproducción**. No contiene servicio de base, migraciones automáticas, semillas o usuarios predeterminados.

```text
Navegador ── HTTPS ── gateway ── web + Angular ── /api ── ASP.NET Core
                                                        o NestJS (retorno explícito)
                                                               │
                                                       PostgreSQL aislado / TLS
```

El tráfico entre contenedores gateway/web/API usa la red privada de Compose. La conexión de navegador es HTTPS y la conexión PostgreSQL verifica TLS/hostname. Solo el gateway publica puertos. El listener HTTP sirve liveness y redirige navegación con 308; **rechaza /api con 426**, sin reenviar credenciales ni repetir escrituras. El gateway resuelve nuevamente la dirección de web mediante DNS de Docker cuando ese contenedor se recrea. Cambiar backend no requiere recrear el gateway ni recompilar Angular.

## Configuración independiente

Requisitos: host Linux con Docker Engine y Compose **2.24.4 o posterior** (el overlay utiliza `!reset` para retirar el puerto HTTP de web). DNS y un certificado/cadena válidos para el hostname de preproducción; una base y credenciales distintas de producción. La aceptación local utiliza una CA efímera; no es el certificado que se entregará al servidor real.

Archivos:

| Archivo | Uso |
|---|---|
| `compose.yaml` + `preproduction.compose.yaml` | Aplicación y gateway HTTPS; cookies Secure forzadas en ambas APIs |
| `preproduction.env.example` | Configuración pública independiente y etiquetas de imágenes |
| `nginx/preproduction.conf.template` | TLS 1.2/1.3, HTTP limitado, HSTS y proxy sin reintentos |
| `PREPRODUCTION.md` | Preparación, aceptación y retorno |

Copiar `deployment/preproduction.env.example` a `deployment/preproduction.env` y preparar `deployment/preproduction-secrets/` fuera de Git. Ambas rutas están ignoradas y excluidas del contexto de build. Puede utilizarse un directorio privado externo mediante rutas absolutas. Las rutas relativas de Compose se resuelven respecto de `deployment/`, el directorio del primer archivo Compose.

- `PUBLIC_HOST`: hostname sin esquema, puerto ni ruta. Debe coincidir con DNS y SAN del certificado. `HTTPS_PORT`/`REDIRECT_PORT` son los puertos externos; los listeners internos son 8443/8080. El redirect utiliza ese hostname fijo, no el Host arbitrario de la petición.
- `PREPRODUCTION_BIND`: 127.0.0.1 por defecto para acceso local/túnel. Para un host de preproducción compartido, configurar una interfaz privada y sus reglas de red antes de habilitar acceso.
- `IMAGE_PREFIX`/`RELEASE_TAG`: prefijo independiente y release revisada. Conservar los digests de las imágenes finales; no reconstruir una etiqueta ya aceptada. Mantener la API NestJS autenticada de esa misma release para el retorno.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`: destino exclusivo de preproducción. Revisar que no correspondan al PostgreSQL de producción. No se clona ni consulta una base existente desde la suite local.
- `SECRETS_DIR`: `ConnectionStrings__Postgres`, `DB_PASSWORD` y `pg-ca.pem`, con el formato de [la guía de despliegue](README.md). Ambas APIs deben apuntar al mismo PostgreSQL y verificar su hostname.
- `TLS_CERT_FILE`: PEM con certificado y cadena intermedia del gateway. `TLS_KEY_FILE`: clave correspondiente. Montaje de solo lectura; el usuario 101 del gateway debe poder leerlos. Los archivos fuente requieren permisos administrados en el host; los secretos de Compose no sustituyen una bóveda.

El overlay fuerza `Auth__SecureCookie=true` y `AUTH_SECURE_COOKIE=true`; no utiliza el ajuste HTTP de la suite de etapa 8. Las cookies son host-only, HttpOnly, SameSite=Strict y Secure. Los encabezados HSTS (un día, sin includeSubDomains), nosniff y Referrer-Policy se aplican en HTTPS. No se introduce una CSP que modifique el comportamiento de los previews.

## Base y usuarios

Para una base nueva de preproducción, el administrador aplica los SQL 001–004 en orden al destino explícito. Para una base existente con el esquema de negocio, aplicar solo las migraciones pendientes; no ejecutar seed/reset. Las APIs no ejecutan DDL al arrancar. Conceder los permisos mínimos documentados en [etapa 8](../e2e/stage8/README.md).

Crear usuarios y membresías explícitamente con `npm run auth:provision`, usando `AUTH_DATABASE_URL` administrativo del entorno de preproducción y un JSON privado por stdin. No hay registro público ni credenciales iniciales. Comprobar que dos usuarios de empresas distintas no puedan abrir, editar, duplicar o borrar documentos ajenos. Validar también el rol viewer y la revocación de sesiones.

El perfil no restaura ni copia datos de producción. Para una futura aceptación con datos representativos, utilizar fixtures o una copia saneada aprobada, con respaldo y restauración verificados por su administrador en un destino separado.

## Construcción y arranque de preproducción

Estos comandos son el procedimiento para el entorno que configure el operador; no se ejecutaron contra un servidor remoto. Desde la raíz:

```sh
docker compose -p report-designer-preproduction --env-file deployment/preproduction.env -f deployment/compose.yaml -f deployment/preproduction.compose.yaml config --quiet
docker compose -p report-designer-preproduction --env-file deployment/preproduction.env -f deployment/compose.yaml -f deployment/preproduction.compose.yaml build
docker compose -p report-designer-preproduction --env-file deployment/preproduction.env -f deployment/compose.yaml -f deployment/preproduction.compose.yaml up -d --no-build --wait
```

Antes de permitir acceso, confirmar por separado hostname/certificado, base, usuarios y etiquetas de imágenes. Consultar `ps`, `/health/ready` por HTTPS con verificación de certificados y los logs acotados de cada servicio. No utilizar `curl -k`, `NODE_TLS_REJECT_UNAUTHORIZED=0` o `ignoreHTTPSErrors` para aceptar el entorno. Para una CA privada, distribuir confianza de forma explícita según la política de la organización.

Con el gateway real, recorrer login/logout, selección de empresa, listas y enlaces directos, A4/ticket/etiqueta: editar, guardar, recargar en otra sesión de navegador y renderizar/exportar. Verificar versión/JSON en PostgreSQL y ausencia de fallback local. Validar Invoices por separado: los previews mantienen los datos de muestra originales. Los recursos externos que incluyan las plantillas deben ser compatibles con HTTPS.

No considerar healthy como reinicio automático o disponibilidad garantizada. La suite local no acredita DNS, certificados del proveedor, firewall, recuperación del PostgreSQL real ni capacidad bajo carga del servidor definitivo.

## Retorno a NestJS

1. Confirmar api-nestjs healthy y el mismo destino PostgreSQL. Esperar las escrituras en curso.
2. Cambiar solo `API_UPSTREAM=api-nestjs:3000` en `deployment/preproduction.env`, conservando release, imágenes y secretos.
3. Recrear únicamente web:

```sh
docker compose -p report-designer-preproduction --env-file deployment/preproduction.env -f deployment/compose.yaml -f deployment/preproduction.compose.yaml up -d --no-build --no-deps --force-recreate --wait web
```

4. Esperar `/health/ready` por HTTPS. El gateway conserva su contenedor/certificado y actualiza DNS; la misma cookie y sesión deben funcionar con NestJS. Recargar y guardar documentos escritos por .NET y verificar SQL, versión y exports.
5. Volver a `API_UPSTREAM=api-dotnet:8080` y repetir la recreación de web y la aceptación.

Puede existir una interrupción breve, incluida la actualización DNS; no se promete cero downtime. No reintentar automáticamente una escritura con resultado ambiguo. No hacer down con volúmenes, reset ni restaurar un respaldo al alternar APIs: ambas usan los mismos datos. Nunca retornar a una imagen histórica sin autorización.

## Aceptación local automatizada

```sh
npm run test:preproduction
```

La [suite de etapa 9](../e2e/stage9/README.md) crea un proyecto Docker aleatorio con PostgreSQL/TLS, certificados, identidades y confianza de navegador temporales, y elimina sus recursos al terminar. No lee `preproduction.env`, secretos reales o producción. El workflow manual preparado en el repositorio ejecuta esa misma suite y conserva evidencia; no publica ni despliega imágenes.
