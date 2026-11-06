# Regresiones del diseñador de etiquetas

Ejecutar desde la raíz del repositorio:

`npm run test:price-labels`

Requiere dependencias instaladas y Google Chrome, o la variable CHROME_BIN con la ruta de un navegador Chromium. Compila la aplicación y la carga desde archivos locales mediante Playwright. La API se simula en memoria: no necesita servidor, credenciales ni base de datos.

Comprueba los ocho defectos corregidos, guardados demorados de plantillas nuevas y existentes, errores de guardado, validación de dimensiones, el evento de impresión y un PDF de tres páginas. También compara el HTML con la referencia de migración actualizada. No comprueba una impresora física ni la persistencia real en PostgreSQL; esos contratos pertenecen a la suite de migración autenticada.

La suite también cubre los paneles plegables, las pestañas, el menú de plantilla, códigos SVG idénticos al render de impresión, cambios de formato y operaciones de agregar/eliminar/arrastrar. Genera capturas en tmp/ a 1600 y 1280 píxeles y verifica que el diseñador de reportes siga visible dentro del área disponible.

La segunda entrega agrega pruebas en `precision.cjs`: un solo paso de historial por arrastre o redimensionado, cancelación con Escape, invalidación de rehacer al editar, campos numéricos completos, aislamiento de los atajos al escribir, ajuste a grilla y a elementos, guías transitorias, reglas escaladas y conservación del historial y del identificador después de guardar. Las ayudas visuales no se incorporan al HTML impreso, cuya referencia continúa verificándose.

El historial conserva hasta 100 acciones durante la sesión de edición y se reinicia al crear o abrir otra plantilla. Grilla, Snap y Elem son independientes: la grilla es visual; Snap ajusta a pasos de 5 mm; Elem utiliza el mismo motor de bordes y centros del diseñador de reportes. Los atajos están disponibles en «Atajos de teclado», debajo del lienzo: Ctrl/Cmd+Z, Ctrl/Cmd+Y o Ctrl/Cmd+Shift+Z, Ctrl/Cmd+S, Ctrl/Cmd+D, Supr/Backspace, flechas (0,1 mm; Shift: 1 mm) y Escape.

La validación previa cubre todos los artículos: precios y códigos inválidos bloquean impresión y HTML, mientras JSON conserva el borrador. Todas las imágenes incluidas en la plantilla se consideran obligatorias; su carga tiene un límite de 10 segundos. Los valores numéricos inválidos no se aplican al estado. `validation.cjs` comprueba errores y recuperación; la suite también verifica que plantillas incompletas no sustituyan el borrador.

La representación comparte `labelPresentation` entre lienzo y HTML. El contenido se recorta dentro del objeto sin recortar los manejadores. Los textos conservan saltos de línea; la vista previa advierte desbordamientos sin cambiar la fuente o geometría. `presentation.cjs` verifica fondos, bordes, radios, opacidad, ajustes de imagen, escalas y HTML descargado. La referencia HTML cambia únicamente de `white-space: normal` a `pre-wrap`.
