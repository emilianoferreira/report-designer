# Etapa 8: autenticación y autorización por empresa

Angular y **ambas APIs** requieren una sesión. PostgreSQL conserva los documentos existentes y ahora almacena identidades, membresías, sesiones y límites de login. NestJS aplica las mismas restricciones: volver a ese backend no desactiva la seguridad ni exige iniciar sesión nuevamente. No se desplegó ni se aplicó SQL sobre una base existente.

## Decisiones y contratos

- Sesión opaca aleatoria de 256 bits. La cookie `rd_session` es HttpOnly, host-only, Path=/, SameSite=Strict y Secure por defecto en producción. Solo el hash SHA-256 de la credencial se almacena en PostgreSQL. Duración absoluta: ocho horas. Logout elimina la sesión y la cookie; cambiar empresa rota la credencial y el token CSRF. Las sesiones sobreviven a reinicios y al retorno entre APIs.
- Las contraseñas se derivan con PBKDF2-HMAC-SHA256, 600.000 iteraciones, sal aleatoria de 128 bits y resultado de 256 bits. No hay usuarios ni contraseñas iniciales, registro público o recuperación por correo. El alta/restablecimiento se realiza mediante la herramienta administrativa explícita indicada abajo. Las cuentas desconocidas ejecutan también la derivación de una contraseña ficticia.
- La sesión determina la empresa activa. En cada petición se comprueba que usuario, empresa y membresía sigan vigentes; la revocación, desactivación y los cambios de rol se aplican en la siguiente petición. Si hay varias membresías, el login selecciona inicialmente la primera por UUID y Angular permite cambiarla.
- `editor` puede consultar y escribir Templates y consultar Invoices en su empresa activa. `viewer` puede consultar, seleccionar otra empresa autorizada y cerrar sesión, pero no escribir Templates. No hay administración de usuarios o permisos desde la API pública.
- GET `/api/auth/session` devuelve usuario, empresas autorizadas, empresa activa, rol, vencimiento y `csrf_token`. Angular conserva esos datos en memoria y recupera la sesión al recargar. POST `/api/auth/login` usa `{email,password}` y el header `X-CSRF-Token: login`; POST `/api/auth/company` usa `{company_id}`; POST `/api/auth/logout` devuelve 204. Las operaciones autenticadas que modifican estado exigen el token CSRF de la sesión. Se rechazan peticiones marcadas `Sec-Fetch-Site: cross-site`. Las APIs no habilitan CORS con credenciales; Angular utiliza sus proxies del mismo origen.
- Login usa límites atómicos compartidos en PostgreSQL: 10 intentos por correo normalizado y 100 por dirección de conexión en ventanas de 15 minutos. Se devuelve 429 al excederlos. Detrás de Nginx, el segundo límite agrupa la conexión del proxy; no se confía arbitrariamente en X-Forwarded-For. Este límite debe dimensionarse antes de un entorno con muchos usuarios simultáneos.

El [contrato autenticado](../../contracts/openapi.auth.json) conserva los esquemas de respuesta exitosos de Templates/Invoices y el JSON abierto del editor. [openapi.json](../../contracts/openapi.json) permanece como referencia histórica sin modificaciones. Development sirve la nueva referencia; Production conserva el 404.

Cambios deliberados respecto del contrato inseguro anterior:

| Situación | Respuesta actual |
|---|---|
| Falta sesión, venció, fue revocada o perdió su membresía | 401 JSON |
| `companyId`/`company_id` ajeno a la empresa activa, incluso si el usuario tiene otra membresía | 403 JSON |
| GET, PUT, guardar diseño, duplicar o borrar un documento de otra empresa | 404 JSON, igual que un documento inexistente |
| CSRF ausente/incorrecto, escritura como viewer | 403 JSON |
| PUT que suministra id, company_id, company, created_at o updated_at | 403 JSON |
| `based_on` de otra empresa | 404; no se guarda la referencia |
| `companyId` omitido | Se usa la empresa activa de la sesión |

Los filtros SQL/repository incluyen la empresa. Las escrituras NestJS bloquean la fila durante la transacción y aplican una lista explícita de campos editables. .NET mantiene filtros de empresa también en los UPDATE/DELETE/INSERT SELECT. Antes de ejecutar la función de datos de factura se verifica la pertenencia de la factura y sus relaciones contacto/sucursal/tipo, evitando exponer relaciones inconsistentes de otra empresa. El aislamiento se implementa en la aplicación; no se presenta como PostgreSQL RLS.

Angular protege las rutas y carga los reportes antes de entrar directamente al diseñador. Cambiar empresa/cerrar sesión pide confirmar el descarte de cambios pendientes y después realiza una navegación completa, vaciando listas e historiales en memoria. Si vence una sesión durante la edición, guardar falla de forma visible y conserva el borrador y el indicador de cambios pendientes. Ya no existe fallback a localStorage: ni un 401/403 ni una caída del backend se convierten en un guardado local exitoso. Las claves locales históricas no se leen ni se mezclan con la sesión; no se borran automáticamente documentos antiguos del usuario. Las vistas previas siguen usando los datos de muestra originales.

## Preparar una base de desarrollo existente

1. Aplicar **solo** `database/004-auth.sql`, una vez, con el propietario del esquema y un destino PostgreSQL explícito. Es una migración transaccional aditiva; no reinicia, modifica ni carga fixtures en las diez tablas de negocio. Para una base nueva, ejecutar los cuatro SQL en orden. `seed` incluye ahora el cuarto SQL; no ejecutar `db:reset` contra una base utilizada.
2. Conceder al rol de aplicación SELECT en auth_users/auth_memberships; SELECT/INSERT/DELETE en auth_sessions; SELECT/INSERT/UPDATE en auth_login_limits, además de los permisos existentes de Templates/Invoices. El aprovisionamiento utiliza una credencial administrativa separada; el proceso de las APIs no necesita DDL ni permisos para crear usuarios/membresías.
3. Preparar un JSON privado fuera de Git: `{ "email": "<correo>", "password": "<contraseña de 12–1024 caracteres>", "companies": [{ "id": "<uuid de empresa existente>", "role": "editor" }] }`.
4. Definir `AUTH_DATABASE_URL` con la conexión administrativa explícita y suministrar ese JSON por stdin a `npm run auth:provision`. Ejemplo PowerShell: `Get-Content -Raw C:\ruta-privada\usuario.json | npm run auth:provision`. No poner la contraseña en argumentos del proceso ni versionar el JSON. Para TLS, usar PGSSLMODE=verify-full y NODE_EXTRA_CA_CERTS con la CA correspondiente.
5. La herramienta crea o restablece el usuario, lo activa, reemplaza sus membresías y revoca sus sesiones, todo en una transacción. Solo imprime el ID. Para revocar accesos, un administrador puede desactivar el usuario o retirar la membresía; no se necesita reiniciar las APIs. Mantener una tarea administrativa de limpieza para sesiones vencidas y ventanas de login antiguas.

Sin la migración o sus permisos, readiness falla. No se ejecuta la migración automáticamente al arrancar. En desarrollo HTTP la cookie no es Secure; el paquete de producción usa Secure. `AUTH_SECURE_COOKIE=false` se utiliza exclusivamente por la suite HTTP de loopback y se traduce a `Auth__SecureCookie` en .NET. Con HTTPS del gateway real debe mantenerse true.

## Validación aislada reproducible

Linux/WSL con Docker/Compose locales, OpenSSL, Node, dependencias npm del frontend y server y Chromium Linux:

```sh
npm run test:security
```

Comprobar espacio libre para imágenes y cachés también en el disco anfitrión de WSL: el espacio virtual de Linux no garantiza espacio físico en C:. No se hace prune global. El healthcheck de PostgreSQL espera TCP, evitando aceptar el servidor temporal por socket que utiliza initdb.

No acepta parámetros ni grabación de snapshots. Los alias test:migration, test:dotnet, test:cutover, test:production y test:docker ejecutan ahora esta suite autenticada. Los antiguos entrypoints stage0/run.mjs y stage7/run.mjs remiten a ella. El modo record falla antes de crear recursos. Los conteos de 134 comparaciones anteriores son evidencia histórica; no se afirma volver a ejecutar sin cambios vectores que exigían eludir la autorización.

El runner construye las tres imágenes de producción y crea únicamente un proyecto `stage8-<id>`, una base `stage0_<uuid>` y un volumen propios. Usa PostgreSQL 16 con CA/certificados efímeros y verificación TLS en ambos backends. Crea usuarios sin credenciales predeterminadas dentro de esa base y valida:

- Las nueve operaciones sin autenticar; login, CSRF, roles, enumeración por ID y CRUD cruzado entre empresas; identidad/propietarios protegidos y `based_on`; SQL sin cambios ante rechazos; relaciones de facturas de otra empresa; vencimiento, revocación, desactivación y cambios de rol; rotación y límites compartidos entre runtimes.
- Contratos exitosos originales, los 19 snapshots y los 25 casos de API/editor, adaptando únicamente las expectativas de autorización y usando sesiones separadas para cada empresa. Se añaden tres pruebas de navegador: login sin exponer cachés locales, cambio de empresa desde un reporte con cambios pendientes/logout, y guardado rechazado por vencimiento sin perder el borrador.
- Esos 28 casos se ejecutan con .NET → NestJS → .NET: 84 ejecuciones. También se ejecutan las 18 pruebas NestJS existentes con sesiones y PostgreSQL aislado por TLS, en un contenedor temporal con las dependencias Linux de su propio build stage.
- Retorno con la misma cookie y documentos A4/ticket/etiqueta, incluido JSON de 1 MiB; marcadores en logs que confirman el backend seleccionado sin reintentos; usuarios no root, APIs con rootfs de solo lectura, salud y SPA/caché.

Los secretos/contraseñas/cookies de prueba están en un directorio temporal privado fuera del contexto de build. `finally` elimina exclusivamente los contenedores/volumen del proyecto, verifica la limpieza y elimina ese directorio. Imágenes y caché se conservan. Los resultados sin credenciales de runtime quedan en `e2e/test-results/stage8-<id>/`. El workflow manual ejecuta esta misma validación; no publica imágenes ni despliega.

La regresión unitaria de Angular puede ejecutarse con `npm test -- --watch=false`. Alternativa Linux aislada del navegador del host:

```sh
docker build -f e2e/stage8/angular-tests.Dockerfile -t report-designer-tests:stage8 .
docker run --rm report-designer-tests:stage8
```

El contenedor de pruebas no conecta una base ni publica puertos; `--no-sandbox` se limita a su Chromium de pruebas. Las imágenes de producto no cambian su configuración por ello.

Referencias: [sesiones OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [almacenamiento de contraseñas OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [CSRF en ASP.NET Core](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery).

## Evidencia de validación

Validado el 4 de noviembre de 2026 en Ubuntu 24.04 WSL2 con Docker Engine 29.1.3 y PostgreSQL 16/TLS. La ejecución `stage8-28685780e3e94adb` aprobó 297 peticiones verificadas de seguridad, 84 ejecuciones de contratos/editor y las 18 pruebas NestJS autenticadas. Los 19 snapshots originales no se regeneraron. La regresión unitaria de Angular aprobó sus 344 casos en el contenedor de pruebas. Ambas APIs y web conservaron usuarios no root; las APIs, rootfs de solo lectura. Se verificó el retorno con la misma sesión y documentos, incluido JSON de 1 MiB. El runner confirmó la eliminación de contenedores/volumen y secretos temporales. No se ejecutó el workflow remoto ni se publicó/desplegó en producción.

Durante la validación, el disco anfitrión agotó su espacio. Se retiraron exclusivamente cachés generadas del workspace (SDK temporal, NuGet y Angular), se verificó manualmente la limpieza del proyecto interrumpido y se repitió la suite completa con resultado satisfactorio. La prueba NestJS usa el build stage de Compose para reutilizar su caché. El SDK Windows descargado en `tmp/dotnet-sdk` ya no está disponible; el desarrollo .NET local requiere un SDK instalado o un DOTNET_HOST_PATH válido. La suite Docker utiliza el SDK de su imagen y no depende de ese directorio.
