# Regresiones del diseñador de etiquetas

## Preparación de lotes — integración del catálogo

Desde el diseñador, **Preparar impresión** abre /price-labels/print. Elegir un
molde guardado y una lista general; buscar por código o barras y agregar resultados.
El catálogo se consulta por páginas de 25; las búsquedas conservan el lote. Cada
artículo admite cantidad individual y la suma no puede superar 100 etiquetas.

La pantalla consume /api/label-print; no usa fixtures locales como sustitución.
Para probar con datos sintéticos, configurar explícitamente LabelPrinting__Provider=Demo
en el backend Development y reiniciarlo. Ver [guía](../../docs/label-print-backend.md).
Con el proveedor deshabilitado se informa la indisponibilidad, sin mostrar artículos.
Los moldes predeterminados que incluyen logo requieren uno real o quitar ese elemento
antes de guardar el molde: el proveedor demo no suministra imágenes.

Cambiar la lista conserva selección, orden y cantidades, invalida los precios anteriores
y resuelve el lote completo. Actualizar precios consulta manualmente; si falla, permite
usar la última instantánea de la misma lista/selección, con fecha y aviso visibles.
Imprimir/exportar verifica la sesión, pero no vuelve a consultar precios. Una sesión
vencida o cambio de empresa descarta los datos. Artículos no disponibles bloquean el
lote; precios ausentes solo permiten moldes que no usan ese dato. Cero es válido y
el tratamiento tributario desconocido se identifica sin calcular impuestos.

Después de npm run build, ejecutar node e2e/price-labels/print-batch.cjs. La prueba
sirve Angular compilado con respuestas API controladas (no acredita conexión real a
Zureo): búsqueda, paginación, cantidades 2/5/1, cambio de lista, cero/ausencia de precio,
fallos, respuestas tardías, exportación de instantánea, sesión vencida y proveedor
inhabilitado. Las pruebas unitarias están en el módulo price-label-print.

Ejecutar desde la raíz del repositorio:

`npm run test:price-labels`

Requiere dependencias instaladas y Google Chrome, o la variable CHROME_BIN con la ruta de un navegador Chromium. Compila la aplicación y la carga desde archivos locales mediante Playwright. La API se simula en memoria: no necesita servidor, credenciales ni base de datos.

Comprueba los ocho defectos corregidos, guardados demorados de plantillas nuevas y existentes, errores de guardado, validación de dimensiones, el evento de impresión y un PDF de tres páginas. También compara el HTML con la referencia de migración actualizada. No comprueba una impresora física ni la persistencia real en PostgreSQL; esos contratos pertenecen a la suite de migración autenticada.

La suite también cubre los paneles plegables, las pestañas, el menú de plantilla, códigos SVG idénticos al render de impresión, cambios de formato y operaciones de agregar/eliminar/arrastrar. Genera capturas en tmp/ a 1600 y 1280 píxeles y verifica que el diseñador de reportes siga visible dentro del área disponible.

La segunda entrega agrega pruebas en `precision.cjs`: un solo paso de historial por arrastre o redimensionado, cancelación con Escape, invalidación de rehacer al editar, campos numéricos completos, aislamiento de los atajos al escribir, ajuste a grilla y a elementos, guías transitorias, reglas escaladas y conservación del historial y del identificador después de guardar. Las ayudas visuales no se incorporan al HTML impreso, cuya referencia continúa verificándose.

El historial conserva hasta 100 acciones durante la sesión de edición y se reinicia al crear o abrir otra plantilla. Grilla, Snap y Elem son independientes: la grilla es visual; Snap ajusta a pasos de 5 mm; Elem utiliza el mismo motor de bordes y centros del diseñador de reportes. Los atajos están disponibles en «Atajos de teclado», debajo del lienzo: Ctrl/Cmd+Z, Ctrl/Cmd+Y o Ctrl/Cmd+Shift+Z, Ctrl/Cmd+S, Ctrl/Cmd+D, Supr/Backspace, flechas (0,1 mm; Shift: 1 mm) y Escape.

La validación previa cubre todos los artículos: precios y códigos inválidos bloquean impresión y HTML, mientras JSON conserva el borrador. Todas las imágenes incluidas en la plantilla se consideran obligatorias; su carga tiene un límite de 10 segundos. Los valores numéricos inválidos no se aplican al estado. `validation.cjs` comprueba errores y recuperación; la suite también verifica que plantillas incompletas no sustituyan el borrador.

La representación comparte `labelPresentation` entre lienzo y HTML. El contenido se recorta dentro del objeto sin recortar los manejadores. Los textos conservan saltos de línea; la vista previa advierte desbordamientos sin cambiar la fuente o geometría. `presentation.cjs` verifica fondos, bordes, radios, opacidad, ajustes de imagen, escalas y HTML descargado. La referencia HTML cambia únicamente de `white-space: normal` a `pre-wrap`.

El guardado y la eliminación de etiquetas envían `If-Match` con la revisión de fila, independiente del historial. Los conflictos 409 conservan el borrador y permiten recargar o crear una copia. DELETE requiere confirmación incluso sin cambios. Las APIs conservan el comportamiento de clientes antiguos que no envían la cabecera.

Para probar concurrencia y seguridad con PostgreSQL real sin Docker: compilar ambos backends (`npm --prefix server run build` y `dotnet build backend-dotnet/src/ReportDesigner.Api/ReportDesigner.Api.csproj -m:1`) y ejecutar `node e2e/price-labels/concurrency-api.mjs`. Usa las dependencias existentes, puertos libres y una base temporal nueva; no consulta ni modifica bases configuradas por el usuario.

## Impresión validada — cuarto incremento

El diagnóstico del lote agrupa incidencias por ID de artículo y elemento. Muestra
cantidad de etiquetas y páginas afectadas; la tabla del lote incluye el resumen
por artículo. Los problemas de precio, código de barras, imagen o geometría bloquean
la salida. Los textos recortados advierten sin alterar fuente ni medidas.

La vista previa mantiene un único documento por revisión. Espera las fuentes y la
decodificación de todas las imágenes (límite de diez segundos por recurso), inspecciona
el contenido y habilita imprimir/exportar solo al terminar. Las acciones vuelven a
validar recursos y comprueban la sesión, sin consultar precios ni reconstruir el HTML.
Cambiar molde, datos o cantidades durante esa espera invalida la acción pendiente.
Las páginas anterior/siguiente y los enlaces del diagnóstico navegan el documento;
imprimir y exportar siempre incluyen todas las páginas, incluso la última parcial.
El JSON descargado sigue siendo exclusivamente el molde.

npm run test:price-labels ahora incluye las regresiones históricas, el lote con API
simulada y una prueba independiente de A4/ticket 80 mm. El lote comprueba diagnóstico
sin duplicados por copias, recorte por artículo, carga/fallo de imágenes, navegación,
impresión del mismo documento, HTML completo y PDF de nueve etiquetas en tres páginas.
El test unitario label-print-validation.spec.ts cubre agrupación, límites, fuentes,
imágenes y cancelación de una impresión obsoleta. La suite fiscal se ejecuta aparte
con node e2e/fiscal-profile/regression.cjs.

Estas pruebas validan navegador, HTML y PDF. No certifican una impresora física ni
calibración. Un HTML exportado con imágenes externas puede necesitar acceder a esas
URLs al abrirlo posteriormente; no se incorpora ni transforma el contenido remoto.
