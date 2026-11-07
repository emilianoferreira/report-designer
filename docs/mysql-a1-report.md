# A1 — Informe de línea base (2026-11-07)

**Estado: A1 completada y verificada tras resolver los snapshots desactualizados. No se inició A3.**

Rama: `codex/mysql-migration`. Referencia de main: `0c9e5d64cfe298fa6bd92ec31328a9d20d82a009`.
Commit de herramientas: `19d8b91` (`test(migration): establish PostgreSQL API renderer baseline for A1`).
El commit de este informe y sus evidencias acompaña a ese commit. No hubo push.

## Archivos

- `e2e/mysql-a1/run.mjs`: inventario no destructivo, PostgreSQL aislado, autenticación real, comparación SQL/API, render de A4/ticket y artefactos.
- `e2e/mysql-a1/renderer-entry.ts`: entrada de bundle exclusiva de pruebas que importa el HtmlRendererService real.
- `e2e/mysql-a1/README.md`: reproducción y matriz de contratos/comportamientos.
- `e2e/price-labels/concurrency-api.mjs`: exporta su runner y permite un callback dentro del ciclo de vida aislado; conserva la ejecución directa existente.
- `e2e/mysql-a1/evidence`: inventario y resumen JSON de la ejecución final, sin credenciales.

No se modificaron producto, persistencia, scripts SQL ni contratos HTTP. NestJS sigue disponible. En el cierre se corrigieron cuatro snapshots HTML desactualizados y se reforzaron sus aserciones, como se detalla al final.

## A1.1 — Inventario y preparación

Se creó la rama desde main. El ensayo interrumpido conserva `packages.lock.json` y artefactos `obj`; faltan el proyecto y el programa. El cache NuGet registra `success:false` y NU1900 por falta de acceso al servicio de información de vulnerabilidades. El lockfile es evidencia de resolución, no de viabilidad del proveedor. El inventario adjunto registra tamaños y SHA-256. Nada se eliminó.

La base del harness corresponde a un cluster embedded PostgreSQL 16.15 nuevo, en un directorio temporal y puertos libres, con credenciales aleatorias. Aunque se llama `postgres`, no es una base del usuario. Las APIs reciben conexiones explícitas a ese cluster. Los procesos creados por el runner se detienen en finally y el directorio se conserva.

La suite de contenedores creó exclusivamente el proyecto `stage8-7d7b3444cc4a428c`, con PostgreSQL TLS y sus recursos propios; el runner ejecutó su limpieza habitual al fallar. No hubo limpieza global de recursos ni cachés.

## Ejecuciones y resultados

| Ejecución | Resultado |
|---|---|
| `dotnet build backend-dotnet/src/ReportDesigner.Api/ReportDesigner.Api.csproj --no-restore -m:1` | Exit 0, sin warnings ni errores |
| `npm --prefix server run build` | Exit 0 |
| `npm run test:price-labels` | Exit 0; precisión, validación, representación, conflictos y borradores aprobados |
| `node e2e/fiscal-profile/regression.cjs` | Exit 0; roundtrip, bloqueo de impresión, PDF multipágina, remito y resguardo |
| `node e2e/stage8/angular-unit.mjs` | Exit 1 de entorno: falta Chromium de Playwright |
| Angular CLI con `CHROME_BIN` apuntando a Chrome instalado y la misma configuración Karma | Exit 0: 389/389 aprobadas |
| `node e2e/mysql-a1/run.mjs` | Exit 0: seguridad/concurrencia real y 4 combinaciones API/renderer aprobadas |
| `node e2e/stage8/run.mjs` en WSL con Docker | Exit 1: seguridad 345 peticiones aprobadas; navegador .NET 26 aprobadas y 2 fallidas |

La compilación Angular informa los avisos existentes de dependencias CommonJS de jsbarcode/qrcode. No se cambiaron dependencias para silenciarlos.

## A1.2 — Evidencia API → InvoiceData → Renderer

Ejecución final: `e2e/test-results/mysql-a1-1c7d4f93-ea4c-4e6a-8df4-a201541a13da/`.
La primera ejecución exploratoria también pasó y se conserva en `e2e/test-results/mysql-a1-4bf4c3a5-9d59-4e51-8259-c6537dd8d632/`; la final agrega total y paridad del número de páginas.

Se autentica por HTTP contra NestJS y .NET y se solicita el comprobante semilla 2. Cada respuesta se compara con la función SQL de esa misma base y se entrega sin reemplazo al renderer real en Chromium. Se comprueban empresa, primera línea, total y ausencia de errores del navegador. Se rechazan 401 y 404 antes de renderizar y no hay fallback a ejemplos.

Para A4 y ticket, ambos backends generan datos, HTML y texto equivalentes. Los PDF tienen páginas y su cantidad coincide entre backends; no se exige igualdad binaria. Los JSON, HTML, PNG, evidencia de renderer y PDF están en el directorio de ejecución. El resumen adjunto incluye hashes del input, HTML y texto, y cantidad de páginas. La generación se ejecutó antes del commit de herramientas; el contenido de las herramientas corresponde al commit 19d8b91.

Este harness valida una semilla de comprobante con ambos formatos. Los contratos de las cinco semillas se comprobaron además en los tests API de stage8. Las pruebas fiscales y de etiquetas existentes mantienen su frontera HTTP simulada y no se presentan como pruebas nuevas de integración con base real.

## Fallos de la primera ejecución (resueltos en el cierre)

La suite vigente falla en los snapshots `report-a4-preview.html` y `report-ticket-80-preview.html`, en `e2e/stage0/tests/editor-roundtrip.spec.ts:73`. La salida actual agrega atributos `data-render-element`, `data-render-section`, `data-render-generated` y `data-render-source` respecto de las referencias congeladas. Los archivos de producto y snapshots no cambiaron en A1: es una discrepancia de la línea base actual, no de una migración de datos.

Evidencia: `e2e/test-results/stage8-7d7b3444cc4a428c/22-playwright-dotnet.log` y el subdirectorio `dotnet/browser`, con HTML recibido, capturas y trazas. `security.json` registra las 345 peticiones correctas en ambos backends.

No se actualizaron snapshots ni se filtraron atributos para hacer pasar la comparación. Como el runner aborta al fallar el navegador .NET, no alcanzó el recorrido equivalente de navegador NestJS ni la fase posterior de Jest de esa ejecución. No se contabilizan como aprobadas.

## Pendientes identificados en la primera ejecución

1. Revisar y resolver la discrepancia de los dos snapshots como una decisión independiente, o aprobar explícitamente una excepción acotada de línea base.
2. Volver a ejecutar la suite vigente hasta completar también el navegador NestJS y Jest; no basta con las comprobaciones de seguridad compartidas ya aprobadas.
3. Revisar la evidencia de A1 antes de autorizar A3.

Estos pendientes quedaron resueltos por la revisión y ejecución de cierre descritas a continuación. La licencia/proveedor, elección de almacenamiento JSON, migración de datos existentes y preparación operacional permanecen pendientes de sus etapas.

## Cierre de A1 — causa y corrección revisada

La comparación completa corrigió el diagnóstico inicial: las diferencias no eran solamente atributos de evidencia. Los snapshots pertenecían a la referencia previa a las mejoras fiscales incorporadas en `8910b5d` y `f5ab50f`. El producto actual ya tenía cobertura unitaria para estas mejoras:

1. Atributos de identidad, sección y procedencia de filas (`data-render-*`), usados por el análisis fiscal.
2. Reglas CSS que respetan la visibilidad de elementos solo en pantalla o solo en impresión.
3. Eliminación de `position:relative` del rectángulo para conservar la geometría absoluta del diseñador.
4. Margen de cuatro módulos del QR, con su viewBox y fondo correspondientes; el patrón de módulos se conserva.
5. `size: auto` del ticket de altura dinámica, frente al tamaño fijo anterior.

Se comprobó que los dos HTML recibidos coinciden exactamente con sus referencias al aplicar únicamente esos cambios conocidos. Esa comprobación fue una herramienta de auditoría puntual; no se incorporó ninguna normalización ni filtro al test. Se actualizaron los dos snapshots de preview y los dos de exportación z-code, con los cambios correspondientes a cada salida. Los snapshots JSON y de etiquetas no cambiaron.

El test de recorrido del editor ahora comprueba explícitamente las cinco referencias `invoiceLines.0` a `invoiceLines.4`, las secciones, las reglas de visibilidad, la posición absoluta del rectángulo, el margen/viewBox del QR y el tamaño automático del ticket. Después sigue comparando el HTML completo mediante `toMatchSnapshot`, incluyendo atributos, geometría, texto, SVG y CSS. No se ejecutó el modo de regeneración automática de snapshots.

## Evidencia final y aceptación

Ejecución completa: `e2e/test-results/stage8-c77c7728f5d04f43/`. Comando: `node e2e/stage8/run.mjs` en WSL con Docker, compilando las imágenes del código actual.

| Verificación | Resultado final |
|---|---|
| Navegador/API .NET | 28/28 aprobadas |
| Navegador/API NestJS | 28/28 aprobadas |
| Navegador/API después de retornar a .NET | 28/28 aprobadas |
| Jest del backend NestJS | 18/18 aprobadas, 2 suites |
| Seguridad y aislamiento en ambos backends | 345 peticiones verificadas |
| PostgreSQL TLS, persistencia y retorno .NET → NestJS → .NET | Aprobado |
| Limpieza del ensayo | Contenedores, volumen de base y red propios eliminados; secretos temporales eliminados |

El manifiesto final `stage8.json` registra `passed:true`, 84 casos de navegador/contrato, imágenes y base aislada. Se conserva copia versionada en `e2e/mysql-a1/evidence/stage8-complete.json`, junto con los logs de navegador y Jest. Los artefactos completos permanecen en el directorio de ejecución. No se repitieron las suites Angular, etiquetas, fiscal y harness real de A1.2 ya aprobadas: no hubo cambios posteriores en código de producto ni en ese harness.

Los criterios de A1 quedan satisfechos: rama aislada, inventario preservado, base ajena al usuario, contratos documentados, integración real API/renderer con HTML/capturas/PDF y regresiones vigentes completas. `main` continúa en `0c9e5d64cfe298fa6bd92ec31328a9d20d82a009`. No se inició A3 ni se hizo push.

Persisten como límites del alcance: el harness API/renderer usa una semilla con dos formatos (los contratos API cubren las cinco), y la vista previa del producto continúa usando ejemplos. La equivalencia entre PostgreSQL y MySQL y el licenciamiento del proveedor aún no se han probado; corresponden a etapas posteriores.
