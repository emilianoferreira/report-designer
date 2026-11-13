# A6 — validación funcional de la aplicación con MySQL

Fecha de ejecución: 2026-11-13. Rama: codex/mysql-migration.
Main se mantiene en 0c9e5d64cfe298fa6bd92ec31328a9d20d82a009.

## Cambios

Sólo herramientas de pruebas y documentación. El runner A5 ahora exporta runA5
con un callback opcional, conservando su ejecución directa. checkBrowser de A4
admite un recorrido opcional después del login y antes del cambio de empresa.
El nuevo runner A6 reutiliza ambos y ejercita Angular compilado con HTTP real:
catálogo (creación, metadatos, duplicación, recarga y eliminación), etiquetas
(creación, guardado con If-Match y recarga), A4 y ticket (edición del diseño,
guardado legacy sin If-Match, recarga y vista previa). Las respuestas HTTP se verifican.
Las bases son sintéticas y aisladas; la API usa un usuario sin permisos DDL.

La vista previa Angular conserva sus datos de ejemplo. El camino con datos
reales API autenticada → InvoiceData → HtmlRendererService se valida dentro de
A5, comparando PostgreSQL/MySQL y produciendo HTML, PNG y PDF para A4/ticket.
No se agrega una funcionalidad de producto para cambiar esa vista previa.

## Cobertura

A5 valida CRUD, nulos/ausentes, JSON de precisión extrema, versiones legacy,
If-Match entre dos réplicas, carreras guardado/borrado, aislamiento por empresa,
permisos, relaciones extranjeras, fechas, zona horaria y decimales. A4 valida
sesiones, CSRF, cambio de empresa, rol viewer, límites de login compartidos,
TLS verificado, esquema y respaldo básico con restauración aislada.
La suite compartida verifica PostgreSQL/.NET y NestJS. Las regresiones existentes
de etiquetas/fiscal usan su frontera HTTP simulada; la suite Angular cubre
389 pruebas. Estas pruebas complementan los recorridos de HTTP real de A6.

## Incidencias del ensayo

La primera corrida falló por una espera incorrecta del harness: al renombrar
una etiqueta, Angular usa PUT /templates/:id y la prueba esperaba /design.
La API devolvió 200; se corrigió la espera y se repitió el ensayo. No se cambió
el producto, no se desactivaron controles y no se actualizaron snapshots.
La segunda corrida detectó que el editor de reportes usa el contrato legacy sin
If-Match, a diferencia del editor de etiquetas. Se comprobó en el servicio de
producto existente; la prueba ahora verifica ese contrato, sin incorporar un
cambio funcional a la migración. El guardado legacy se serializa en el backend,
pero no detecta un borrador obsoleto; el último cliente aceptado puede sobrescribir
contenido anterior. El API con If-Match sí rechaza revisión obsoleta con 409.
La tercera corrida completó los recorridos funcionales, pero falló al intentar cambiar de empresa con alice, cuya membresía sólo incluye A. Se corrigió la identidad del harness a multi (editor A / viewer B), sin ampliar permisos. Los intentos fallidos permanecen en test-results.

El comando npm test inició Karma en modo watch por el reenvío de argumentos en
este entorno. Tras 389 éxitos se detuvo exclusivamente su proceso ng verificado
y se repitió directamente con node node_modules/@angular/cli/bin/ng.js test
--watch=false --browsers=ChromeHeadless: terminó con código 0 y 389 éxitos.

## Límites

La validación funcional de desarrollo no constituye autorización de corte
productivo ni migración de datos del usuario. PostgreSQL sigue siendo el modo
predeterminado. No hay escritura dual ni sincronización para volver a PostgreSQL
tras aceptar escrituras en MySQL. Permanecen los riesgos documentados en A3/A5:
licencia para distribución propietaria, validación JSON por los escritores .NET,
orden accidental de consultas sin ORDER BY y necesidad de declarar zona horaria.
La preparación operacional avanzada y el retiro de infraestructura son posteriores.
No se tocaron bases del usuario, configuración de main ni recursos ajenos.

## Resultado y aceptación

A6 completada para validación funcional de desarrollo. La corrida final terminó
con código 0: mysql-a5-33d3cdc3-6836-4db6-9c27-7fc72ef25a13.

- Recorridos Angular reales de catálogo, etiquetas, A4/ticket, login, empresa y logout: pasan; sin pageerror.
- A5: 33 comprobaciones, 5 comprobantes y caso de fecha/nulos; dos pares A4/ticket con HTML y PNG iguales y páginas PDF equivalentes, sin igualdad binaria exigida.
- MySQL: 45 comprobaciones de esquema, autenticación, seguridad y respaldo restaurado.
- PostgreSQL/NestJS/.NET: 345 solicitudes de regresión, pasan.
- A2: 17 casos y 6 renders, pasan.
- Angular: 389 pruebas, código 0; logs de casos negativos esperados incluidos.
- Etiquetas y fiscal: código 0; snapshots existentes conservados.
- Build Angular y .NET: pasan; Angular mantiene advertencias CommonJS de jsbarcode y qrcode.

El contenedor y volúmenes propios se retiraron tras verificar su etiqueta. Los
backups con material de autenticación permanecen locales y fuera de Git.
[Índice de corrida](../e2e/mysql-a6/evidence/run.json),
[comparaciones](../e2e/mysql-a6/evidence/report.json),
[MySQL](../e2e/mysql-a6/evidence/mysql-auth-schema.json),
[regresiones](../e2e/mysql-a6/evidence/regressions.json).
La carpeta evidence contiene JSON, HTML, capturas y PDFs sintéticos. Los HTML
se conservan sin modificar su whitespace para preservar los hashes del ensayo.

No quedan fallos abiertos de las suites ejecutadas; las incidencias anteriores
fueron supuestos incorrectos del harness y están documentadas. Esta aceptación
no elimina los límites de concurrencia legacy ni los riesgos operacionales y
legales descritos arriba. No se promueve MySQL al modo predeterminado ni se
realiza corte productivo. Main permanece intacta y no se hace push de A6.

La revisión visual de la primera corrida con código 0 encontró capturas tomadas
antes de terminar la carga del iframe. Se agregó espera explícita de previewReady
y contenido no vacío del iframe, y se repitió la suite. No se usa una captura
con carga pendiente como evidencia final de renderizado.
