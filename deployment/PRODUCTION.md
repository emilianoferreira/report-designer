# Producción controlada — etapa 10, pendiente de revisión

Este paquete **prepara** el despliegue; no lo ejecuta. No se conectó una base real, no se tomó un respaldo de producción ni se cambió tráfico. El ensayo usa datos sintéticos en un proyecto Docker y restaura en una base nueva. Servidor, DNS, credenciales, imágenes publicadas y destino de respaldo reales deben revisarse antes de ejecutar los pasos operativos.

**Decisión del 4 de noviembre de 2026:** todavía no se dispone de servidor ni dominio. La elección de infraestructura, la configuración real y la ejecución del despliegue quedan pospuestas por indicación del usuario. Se conservan las herramientas y la evidencia aislada; la ficha permanece en `pending-review`, con servidor y hostname sin completar. Retomar esta revisión cuando se decida la infraestructura.

## Configuración final a revisar

La ficha [production.review.json](production.review.json) contiene los campos pendientes sin contraseñas. El commit de aplicación propuesto es el aprobado en etapa 9; las imágenes de producción deben publicarse/transportarse y fijarse mediante `repositorio@sha256:<digest>`, incluyendo el gateway. No se acepta una etiqueta mutable como identidad final de release.

```sh
npm run release:review
```

Este comando es offline: lista campos pendientes y fases, no conecta PostgreSQL, consulta DNS, publica imágenes o arranca contenedores. Devuelve 2 mientras falten datos/revisión. Solo cuando el operador haya revisado los valores se marca status=reviewed; esto registra una revisión, no autoriza ni ejecuta automáticamente el despliegue.

| Decisión | Debe quedar registrada |
|---|---|
| Infraestructura | Servidor, hostname, interfaz/puertos y reglas de acceso; entrada actual que recibe el tráfico |
| Release | Commit, cuatro digests, disponibilidad local/registro y evidencia de aceptación |
| PostgreSQL | Host/base/versión mayor, roles de aplicación y backup, CA y esquema/migraciones presentes |
| Secretos/TLS | Archivos privados de conexión, contraseña y cadena/clave HTTPS; permisos para sus usuarios de contenedor |
| Respaldo | Directorio privado, destinatario público age, clave de recuperación separada, copia externa y retención |
| Restauración | Destino aislado, rol administrativo, disponibilidad de extensiones/locales y evidencia del ensayo |
| Operación | Ventana, responsables, procedimiento de pausa/drenaje de **todos** los escritores, RPO/RTO y criterios de retorno |

Después de la revisión, completar `deployment/release.env` a partir de [release.env.example](release.env.example). Está ignorado por Git. Conservar la ficha pública revisada y los hashes de la evidencia; no incluir contraseñas, claves privadas, passfiles o dumps en el repositorio. La copia local editable de la ficha puede llamarse production.review.local.json, también ignorada.

## Perfil de release

`compose.yaml` + `production.compose.yaml` mantienen PostgreSQL externo, fuerzan cookies Secure y retiran los puertos públicos de web/APIs. El gateway reutiliza TLS/DNS/proxy de la etapa 9. Los campos de imagen son obligatorios y el overlay elimina sus builds; la ejecución propuesta utiliza --no-build --pull never.

El estado inicial es NestJS autenticado y MAINTENANCE_MODE=1. Este modo permite GET/HEAD/OPTIONS, pero rechaza mutaciones con 503 antes de llegar al backend, con no-store/Retry-After. Solo el valor explícito 0 abre escrituras; valores inválidos cierran el acceso. No congela procesos externos, trabajos SQL, conexiones directas ni el gateway anterior: el procedimiento de drenaje debe cubrirlos por separado. Recrear el gateway carga el cambio y puede interrumpir conexiones; esperar el fin de las escrituras y revisar resultados ambiguos, sin reintentos automáticos.

## Respaldo consistente y cifrado

Las herramientas de [operations/](operations/) usan clientes PostgreSQL de la **misma versión mayor** que el servidor, Node con dependencias de server, y age. Los binarios deben estar instalados en Linux. Configurar conexión explícita con CA/hostname verificados y passfile 0600; no usar PGPASSWORD o contraseñas en argumentos. El directorio de backups requiere 0700. El rol de backup necesita lectura completa: no debe ocultar filas por RLS ni omitir objetos.

La configuración privada se prepara desde [operations.example.json](operations/operations.example.json), por ejemplo deployment/operations.local.json. No hay destino por defecto. source contiene host/puerto/base/usuario/CA/passfile, sin el valor de la contraseña. recipient es una clave **pública** age. La identidad privada de recuperación se guarda separadamente y debe estar disponible para el ensayo, no dentro del mismo conjunto de respaldos.

```sh
# Solo imprime el plan; no conecta ni crea un respaldo.
node deployment/operations/postgres.mjs backup /ruta-privada/operations.json
# Ejecución futura, únicamente después de revisión/aprobación y reviewed=true:
node deployment/operations/postgres.mjs backup /ruta-privada/operations.json --execute
```

El respaldo abre una transacción de solo lectura REPEATABLE READ, exporta su snapshot y hace pg_dump custom sobre ese mismo snapshot. Calcula conteos y SHA-256 ordenados por tabla, además de definiciones de columnas, funciones, restricciones, índices, vistas, extensiones y secuencias de la aplicación. La lectura se hace por cursor con hashes por fila, sin descargar todo el contenido a memoria del cliente. Las escrituras concurrentes quedan fuera del punto de captura; el corte final debe hacerse con escritores drenados, también para DDL y secuencias.

pg_dump fluye directamente hacia age. No se escribe un dump en claro: solo un archivo cifrado .dump.age y un manifiesto privado .dump.age.json con tamaño/checksum, versión, locale y huellas de verificación. La compresión custom de PostgreSQL no se considera cifrado. Revisar ambos archivos, copiar el conjunto cifrado a un destino externo privado y verificar allí tamaño/checksum contra el manifiesto confiable. No hay borrado por retención ni envío a un proveedor automático: destino, custodios y política quedan por aprobar.

pg_dump cubre una base, no el clúster: roles/contraseñas globales, tablespaces, configuración del servidor/proveedor, secretos, certificados y disponibilidad de extensiones requieren inventario y recuperación separados. El ensayo valida el esquema actual del proyecto en PostgreSQL 16; una versión, locale, extensión u objeto adicional del entorno real requiere su propia evidencia. No ejecutar SQL de un archivo de origen no confiable solo porque esté cifrado.

## Validar restauración en un destino aislado

```sh
node deployment/operations/postgres.mjs restore-check /ruta-privada/operations.json
# Ejecución futura revisada; crea una base nueva, nunca sobrescribe la de origen:
node deployment/operations/postgres.mjs restore-check /ruta-privada/operations.json --execute
```

El destino administrativo es explícito y preferentemente otro servidor aislado. restoreDatabase debe ser restorecheck_<32 caracteres hex aleatorios> y no existir. Se verifica checksum **antes** de crear la base. No hay --clean, dropdb ni promoción automática. Un destino existente se rechaza, sin borrarlo. Si falla una operación posterior, la base nueva queda sin promover para inspección; solo su administrador podrá retirarla tras verificar su identidad.

Se descifra por pipe y se ejecuta pg_restore --single-transaction --exit-on-error --no-owner --no-privileges. Se comparan todas las huellas/conteos del esquema de aplicación y secuencias con el manifiesto. Después se revocan las sesiones restauradas y se vacían límites de login para no revivir sesiones revocadas después del backup. Antes de abrir la aplicación se necesita login nuevo.

Owners/ACL no se trasladan ciegamente a otro entorno. Crear/revisar los roles y aplicar explícitamente [application-grants.sql](operations/application-grants.sql) como propietario, con --set=app_role=<rol revisado>. No crea usuarios ni cambia contraseñas. Revisar también permisos heredados/default y los objetos adicionales del destino. Las APIs no necesitan DDL, superusuario o escritura de Invoices. Conectar una instancia de aplicación aislada al destino verificado y recorrer autenticación, contratos, editor y retorno antes de declarar recuperable la release. Nunca apuntar el runner de fixtures a una copia real: sus guardas exigen una base descartable y marcador propios.

El respaldo puede tomarse con un rol de lectura completo; la validación requiere un rol separado capaz de crear la base y restaurar sus objetos. No ampliar el rol de las APIs para esas operaciones. Las definiciones de SQL, ownership, triggers, políticas RLS, tipos u objetos específicos que se encuentren en la base real deben incorporarse a su inventario y aceptación: la huella preparada cubre los objetos presentes en este proyecto, no sustituye una auditoría de todos los objetos posibles de PostgreSQL.

## Secuencia de despliegue propuesta, aún sin ejecutar

1. Revisar ficha, recursos, versiones y cuatro digests; mantener la release anterior y NestJS autenticado disponibles. Comprobar DNS/TLS, permisos de archivos y PostgreSQL sin habilitar acceso público.
2. Bloquear escrituras en la entrada **actual**, detener otros escritores y drenar operaciones. Registrar el estado/versión de plantillas y comprobar que no haya comandos con resultado incierto.
3. Tomar respaldo previo a cualquier cambio de esquema/permisos, copiarlo fuera del host y validar una restauración nueva. Registrar hashes, origen/destino, tiempos y resultado. Confirmar disponibilidad de la identidad age y responsables de recuperación.
4. Inspeccionar esquema real. Aplicar solo migraciones pendientes revisadas: 004-auth.sql únicamente si falta, nunca 001/seed/reset sobre datos existentes. Preparar roles, grants y usuarios explícitos. Si hubo cambios de esquema/autenticación, tomar y restaurar además un checkpoint posterior compatible con la release antes de abrir tráfico.
5. Con configuración ya aprobada, validar Compose, disponer de imágenes por digest y arrancar en mantenimiento sobre NestJS. Las órdenes siguientes son un procedimiento futuro, no se ejecutaron contra producción:

```sh
docker compose -p report-designer-production --env-file deployment/release.env -f deployment/compose.yaml -f deployment/production.compose.yaml config --quiet
docker compose -p report-designer-production --env-file deployment/release.env -f deployment/compose.yaml -f deployment/production.compose.yaml pull
docker compose -p report-designer-production --env-file deployment/release.env -f deployment/compose.yaml -f deployment/production.compose.yaml up -d --no-build --pull never --wait
```

6. Validar salud/HTTPS, 401 sin sesión y rechazo de escrituras en mantenimiento. Limitar el acceso a operadores mientras se prepara la aceptación; no confundir healthy con aceptación funcional.
7. Tras revisar backup/restore y el drenaje, cambiar MAINTENANCE_MODE=0 y recrear solo gateway. En acceso controlado, verificar login/empresa, documentos existentes de solo lectura y un documento canario aprobado de cada formato. Guardar IDs creados y retirar únicamente esos canarios. No cargar fixtures genéricos en producción.
8. Cambiar **solo** API_UPSTREAM=api-dotnet:8080 y recrear web con --no-build --pull never --no-deps --force-recreate --wait. El gateway/certificado y la base son los mismos. Confirmar sesión, datos, consultas Invoices y editor. Habilitar tráfico según la ventana/acceso aprobado.
9. Observar errores, latencia, salud, conexiones PostgreSQL y guardados/recargas. Usar criterios y responsable acordados; no se fijan umbrales ni un RPO/RTO ficticios. Conservar NestJS y las imágenes/evidencias hasta terminar el período de estabilidad.

## Retorno de backend y recuperación de datos son acciones distintas

**Retorno a NestJS:** esperar escrituras en curso, poner API_UPSTREAM=api-nestjs:3000 y recrear únicamente web con las mismas imágenes y base. Verificar sesión y documentos escritos antes **y después** del backup. No restaurar ni deshacer cambios SQL al alternar APIs. Si se necesita frenar daño, cerrar escrituras en gateway y cubrir los demás escritores antes de investigar. Puede existir una interrupción breve por recreación/DNS; no se promete cero downtime.

**Recuperación de datos:** solo ante un incidente que lo requiera y con aprobación separada del punto de recuperación y pérdida de escrituras posteriores. Restaurar en una base nueva, verificarla, resolver migraciones/grants/secretos y decidir una promoción explícita. El dump lógico no reproduce operaciones posteriores al snapshot y no sustituye WAL/PITR del proveedor cuando el RPO lo requiera. Los tiempos del ensayo pequeño no predicen el RTO de producción.

## Validación realizada sin producción

`npm run test:release` ensaya el perfil controlado sobre datos sintéticos. [Alcance y evidencia de etapa 10](../e2e/stage10/README.md). El workflow manual solo ejecuta ese ensayo; no tiene pasos de despliegue, respaldo real, publicación o credenciales de producción.

Referencias: [pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html), [passfiles](https://www.postgresql.org/docs/16/libpq-pgpass.html), [age](https://github.com/FiloSottile/age).
