# Etapa 7: validación de imágenes Docker sin producción

```sh
npm ci
npm ci --prefix server
npx playwright install --with-deps chromium
npm run test:docker
```

Ejecutar desde la raíz en Linux o Ubuntu WSL2 con Docker Engine local y Compose v2, OpenSSL, Node (22 recomendado) y acceso al socket Docker. La suite no instala herramientas automáticamente. En Windows, ejecutarla dentro de la distribución WSL que tenga el motor y Chromium Linux; no utiliza Docker Desktop ni los binarios Chromium de Windows. No requiere SDK .NET ni PostgreSQL instalados en el host.

El runner rechaza un endpoint Docker remoto TCP/SSH. Usa los Dockerfiles y Compose de `deployment/` y añade exclusivamente un override temporal JSON. No lee `deployment/production.env`, secretos reales ni una base existente. El proyecto se llama `stage7-<id aleatorio>`, las imágenes se etiquetan con ese identificador, los puertos se publican solo en loopback y la base es `stage0_<uuid>`. No se ejecutan push, despliegues remotos ni cambios en el proyecto Compose de producción.

## Qué comprueba

1. Construye las tres imágenes de producción y arranca PostgreSQL 16 como contenedor de prueba con un volumen exclusivo.
2. Genera una CA y certificado temporales con SAN para pg-test/loopback. Ambas APIs conservan VerifyFull y pg se conecta mediante NODE_EXTRA_CA_CERTS. La conexión del host también verifica CA y nombre; las sesiones TLS de ambas APIs se comprueban en pg_stat_ssl.
3. Carga los tres SQL originales en esa base nueva, crea un usuario de aplicación sin privilegios DDL y coloca el marcador de aislamiento. Las pruebas SQL se niegan a operar sin ese marcador.
4. Arranca los entrypoints reales con secretos montados; comprueba healthchecks, usuarios no root y filesystem de solo lectura de ambas APIs. Verifica el frontend empaquetado, caché de index/chunks y ausencia del endpoint de referencia en Production.
5. Ejecuta las 134 comparaciones de etapas 2–4, usando TLS también para sus conexiones SQL.
6. Ejecuta los 25 casos completos de API/editor a través del Nginx de la imagen con .NET y repite con NestJS, recreando únicamente web mediante API_UPSTREAM.
7. Guarda A4, ticket y etiqueta con .NET; cambia a NestJS, recarga y guarda; vuelve a .NET y compara JSON/versiones completos. La etiqueta incluye un documento de 1 MiB para comprobar el límite y los temporales de Nginx dentro del contenedor.
8. Ejecuta otros 25 casos completos después de regresar a .NET: 75 ejecuciones de pruebas en total, sin regenerar snapshots. Los flujos reales de navegador guardan en PostgreSQL, recargan en un contexto nuevo, renderizan y exportan.

En cada cambio de destino se envía un marcador de UUID inválido y se confirma en los logs que solo lo recibió la API seleccionada. No se agregan headers ni endpoints al producto. Los casos HTTP usan el mismo puerto del frontend, por lo que también verifican el proxy de producción y su conservación de estados/cuerpos.

## Evidencia y limpieza

Los logs de construcción, contenedores y comandos, resultados Playwright y sus trazas de fallos quedan en `e2e/test-results/stage7-<id>/`. `stage7.json` registra versión del motor, IDs/tags de imágenes, usuarios, estados de salud, TLS, conteos y limpieza. Se mantienen los snapshots originales y no existe modo record en este runner.

Los secretos se crean en un directorio privado del temp del sistema (no dentro del contexto Docker). Al finalizar, incluso si falla una prueba, se ejecuta down con volúmenes **solo para ese proyecto aleatorio**, se verifica que no queden sus contenedores/volúmenes y se elimina el directorio temporal validado. No hay prune global. Las imágenes y caché de build se conservan para revisar/reutilizar; no contienen secretos de runtime. Si falla la limpieza, el proceso termina con error y guarda evidencia explícita. Una terminación forzada del host/SIGKILL puede impedir el finally; recuperar únicamente el proyecto indicado en el log, nunca el de producción.

El workflow manual `.github/workflows/production-package.yml` ejecuta esta misma suite en Ubuntu y conserva los resultados siete días. No tiene secretos de producción ni publica imágenes. Ejecutarlo es una validación de contenedores temporales, no un despliegue.

Esta suite verifica el empaquetado Linux, entrypoints, permisos, red/DNS Compose, TLS y flujos funcionales. No acredita certificados/DNS/gateway del servidor final, autorización por empresa, rendimiento bajo carga, alta disponibilidad ni recuperación de un PostgreSQL real. Esas propiedades requieren el entorno y las decisiones de la organización.

Validación local del 3 de noviembre de 2026: Ubuntu 24.04 WSL2, Docker Engine 29.1.3 y Compose 2.40.3. Las tres imágenes se construyeron y arrancaron con sus entrypoints de producción. Aprobaron las 134 comparaciones y las 75 ejecuciones de API/editor, incluidos los snapshots originales, el retorno mediante recreación de web, TLS y el documento de 1 MiB. Los tres servicios de aplicación usaron usuarios no root, ambas APIs conservaron rootfs de solo lectura y los cuatro servicios estuvieron healthy. Se verificó la eliminación de contenedores/volumen del proyecto y de los secretos temporales. El workflow remoto no se ejecutó y no se publicó ni desplegó en producción.
