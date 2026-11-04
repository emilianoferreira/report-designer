# Etapa 9: preproducción HTTPS aislada

Ejecutar en Linux/WSL con Docker/Compose locales, Node, OpenSSL, dependencias npm de raíz y server, Chromium Linux y `certutil` (Ubuntu: paquete libnss3-tools):

```sh
npm run test:preproduction
```

Revisar espacio libre tanto en Linux como en el disco anfitrión de WSL. No se hace prune ni se borra caché ajena. No hay parámetros para grabar snapshots. La suite de etapa 8 sigue disponible con `npm run test:security`; ambos entrypoints comparten `e2e/support/run-isolated.mjs`.

El runner utiliza `deployment/compose.yaml` y el [overlay de preproducción](../../deployment/preproduction.compose.yaml), con un override efímero que añade PostgreSQL 16/TLS y puertos de diagnóstico de APIs solo en loopback. El perfil preparado para el operador no publica web ni las APIs. La configuración pública y los secretos reales no se leen. Proyecto `stage9-<id>`, base `stage0_<uuid>`, volumen y usuarios propios; no se conecta ninguna base existente.

La CA efímera firma certificados separados para PostgreSQL y HTTPS. Las APIs verifican TLS/hostname de la base; el gateway termina HTTPS. El cliente de prueba utiliza una CA explícita y rejectUnauthorized=true. El proceso Node de Playwright recibe NODE_EXTRA_CA_CERTS al iniciar; solo los procesos Chromium de esta prueba utilizan un directorio temporal con NSS y la CA de prueba. No se modifica la confianza del host ni del navegador personal. Un segundo navegador sin esa confianza debe rechazar el certificado. No se desactiva la verificación TLS ni se utilizan excepciones de certificado.

Comprobaciones:

- Certificado confiable y hostname correcto aceptados; CA desconocida y hostname incorrecto rechazados. TLS 1.2/1.3 aceptados y TLS 1.0/1.1 rechazados por el servidor.
- HTTP redirige navegación a la URL HTTPS configurada, conservando ruta/query; /api por HTTP devuelve 426 y no crea sesiones. HTTPS conserva estados/cuerpos API, HSTS y ausencia de reintentos.
- Ambas APIs fuerzan cookies Secure. El navegador verifica HttpOnly/SameSite=Strict/Secure y contexto seguro, sin solicitudes HTTP en la navegación probada. Chromium rechaza un certificado no confiable y un hostname incorrecto con sus validaciones habilitadas.
- Las 297 peticiones de aislamiento/seguridad de etapa 8 se verifican contra las APIs privadas de diagnóstico. Los 25 casos de contratos/editor, los tres casos de autenticación y los tres casos HTTPS recorren el gateway real: 31 casos por backend, .NET → NestJS → .NET, con los snapshots originales. Cada reporte de Playwright determina el conteo efectivo y exige cero fallos o casos omitidos.
- Las 18 pruebas NestJS autenticadas usan su build stage Linux y el PostgreSQL TLS descartable.
- Se conserva el mismo contenedor gateway y la misma sesión al recrear web. Los marcadores en logs confirman el backend seleccionado y la ausencia de reintentos. Documentos A4/ticket/etiqueta guardados en .NET se leen/editan en NestJS y se recargan en .NET, incluido JSON de 1 MiB.
- Usuarios no root, rootfs de solo lectura en APIs/gateway, salud, SPA/caché, base cifrada y limpieza de contenedores, red, volumen, certificados, claves y almacenes temporales.

Los resultados quedan en `e2e/test-results/stage9-<id>/`: stage9.json, https.json, security.json y los resultados/trazas de cada backend. Las contraseñas/cookies/keys de runtime permanecen en un directorio privado del temp del sistema y se eliminan en finally; las imágenes/cachés se conservan. Un cierre forzado del host puede requerir recuperar exclusivamente el proyecto indicado, nunca uno de producción.

Esto prepara el paquete y valida un entorno local equivalente con base aislada; no acredita todavía el hostname/certificado ni el PostgreSQL del servidor que configure el operador. Consultar [el procedimiento de preproducción](../../deployment/PREPRODUCTION.md). El workflow es manual y no tiene secretos de producción, publicación de imágenes o despliegue.

Referencias: [Nginx HTTPS](https://nginx.org/en/docs/http/configuring_https_servers.html), [DNS de upstreams Nginx](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#server), [confianza NSS de Chromium en Linux](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md), [Node TLS](https://nodejs.org/api/tls.html).

## Evidencia de validación

Validado el 4 de noviembre de 2026 en Ubuntu 24.04 WSL2, Docker Engine 29.1.3 y PostgreSQL 16/TLS. `stage9-96e86b7e0ad84463` aprobó 93 ejecuciones de contratos/navegador por HTTPS, 297 peticiones de seguridad en las APIs de diagnóstico y las 18 pruebas NestJS autenticadas. Pasaron certificados confiables, rechazo de CA/hostname inválidos (también en Chromium), TLS 1.2/1.3, rechazo de TLS 1.0/1.1, redirect 308, rechazo HTTP de API con 426 y cookies Secure. Los cinco servicios estuvieron healthy; gateway/APIs mantuvieron rootfs de solo lectura y los cuatro servicios de aplicación, usuarios no root. El mismo gateway/sesión y documentos de hasta 1 MiB sobrevivieron al retorno .NET → NestJS → .NET. Se verificó la limpieza.

La compatibilidad HTTP del runner compartido se comprobó además con `stage8-7b9fcfcf78434158`: 84 casos de contratos/navegador, 297 peticiones de seguridad y 18 pruebas NestJS aprobados, con limpieza verificada. Los contratos OpenAPI, fixtures y 19 snapshots originales permanecen sin cambios. TypeScript, sintaxis de los runners, YAML del workflow manual y Compose con los valores de ejemplo también fueron válidos. No se ejecutó el workflow remoto ni se publicó o desplegó en producción.
