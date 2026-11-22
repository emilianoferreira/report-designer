# Entrega 1 — geometría WYSIWYG

## Reproducción

Desde la raíz, con dependencias instaladas y Chrome disponible:

```powershell
node node_modules/@angular/cli/bin/ng.js build --configuration=development
node e2e/wysiwyg/geometry.cjs
node e2e/fiscal-profile/regression.cjs
node e2e/price-labels/report-compatibility.cjs
```

El ensayo sirve el build local mediante rutas Playwright y simula HTTP en memoria. Genera capturas del lienzo y Vista Previa por formato, y medidas en `tmp/wysiwyg/measurements.json`. Abrir las parejas `*-canvas.png` y `*-preview.png` para comparar. Usa el escenario de cinco artículos y aleja el lienzo al 60 %. También prueba los moldes históricos A4 y 80 mm y un CFE dividido en tres hojas.

Las cajas se miden en el DOM respecto de cada hoja. La tolerancia es 0,25 px CSS sin escala, para absorber redondeo subpíxel. La posición conocida del texto verifica la suma del margen y la coordenada con una expectativa independiente. También se compara el HTML descargado abierto en otro documento. Guardar debe seguir deshabilitado y cualquier petición de escritura falla.

## Línea base

`baseline.json` identifica el commit auditado y el SHA-256 del renderer original normalizado a LF. Registra las medidas anteriores tomadas en Chromium y hashes de los HTML z-code históricos. El renderer sigue siendo idéntico al de ese commit. Los hashes de exportación se registraron tras verificar esa identidad. La ejecución normal compara los hashes, sin actualizarlos. La opción `--record` es exclusivamente para una revisión explícita de línea base.

La auditoría inicial midió el texto A4 en (1,249; 2,749) mm en edición y (11,245; 12,745) mm en Vista Previa. Con detalle declarado de 8 mm, el pie pasó de Y=102,811 mm a Y=126,095 mm al aumentar de uno a cinco artículos. Esos datos quedan documentados como evidencia anterior. Las capturas y medidas de la ejecución son evidencia de la composición actual.

## Composición

ValidationSessionService publica el documento que ya prepara para el análisis del diseño. El lienzo lo presenta en un iframe con scripts deshabilitados y mide sus secciones. Vista Previa sigue preparando e inspeccionando su propio documento mediante la misma función. Ambos dimensionan la superficie con la misma medición de hojas y extensión del rollo.

Los controles existentes se superponen a las secciones medidas. Los elementos muestran su contenido resuelto en el documento compartido. Las tablas y artículos forman parte de ese documento y carecen de controles propios de edición. Las mejoras de interacción, marcadores de elementos omitidos y edición de repeticiones corresponden a las entregas siguientes. En esta entrega el encabezado y detalle usan la primera instancia y el pie usa la última.

El JSON de moldes y el renderer/exportador histórico permanecen intactos. Se conservan los inspectores y la política fiscal. La suite fiscal verifica el bloqueo de impresión y la composición multipágina.

## Entrega 2 — interacciones sobre geometría real

Ejecutar desde la raíz:

```powershell
node node_modules/@angular/cli/bin/ng.js build --configuration=development
node e2e/wysiwyg/interactions.cjs
node e2e/wysiwyg/geometry.cjs
node e2e/fiscal-profile/regression.cjs
node e2e/price-labels/report-compatibility.cjs
```

La demo de interacciones usa API simulada, márgenes asimétricos y detalle con cinco artículos. Ejecuta gestos al 60 %, 100 % y 140 %, verifica sus cajas DOM antes y después de soltar, y genera parejas de capturas en `tmp/wysiwyg-interactions`.

Comprueba cancelación con Escape sin cambios guardados, selección de elementos bloqueados, arrastre, resize desde el borde izquierdo conservando el borde derecho, edición X/Y decimal, deshacer/rehacer, guías alineadas con el margen real, movimiento de grupos conservando sus distancias incluso contra el límite imprimible y traslado de encabezado y detalle al pie medido. El traslado desde Detalle recompone la tabla y el pie con el renderer compartido durante el gesto. Se compara la posición final con Vista Previa.

Los gestos usan una tolerancia de un píxel de pantalla convertido según el zoom para el desplazamiento solicitado, debido al redondeo del puntero. La correspondencia de las cajas DOM durante/después del gesto y entre superficies admite 0,25 px CSS. El ajuste exacto de guías y X/Y se mide contra expectativas independientes en milímetros.

Para comprobar manualmente la salida durante la edición, usar **Comparar impresión** en la barra del lienzo. Al alternar se conservan el escenario, zoom, desplazamiento y selección. Los campos X/Y expresan milímetros relativos al margen izquierdo y al origen de la sección medida. Admiten valores decimales con paso 0,1 mm y se confirman al salir del campo.

Los borradores de arrastre y resize se generan en memoria mediante el renderer y la preparación de impresión existentes. Cada respuesta se descarta si corresponde a un gesto anterior. Se escribe una única operación en el historial al soltar. Los elementos históricos se cargan con sus valores originales. El ensayo de geometría sigue comprobando los hashes de z-code registrados en la entrega 1.

## Entrega 3 — bloques generados, recortes y paginación

Ejecutar desde la raíz con Chrome disponible:

```powershell
node node_modules/@angular/cli/bin/ng.js build --configuration=development
node e2e/wysiwyg/blocks-and-pages.cjs
node e2e/wysiwyg/geometry.cjs
node e2e/wysiwyg/interactions.cjs
node e2e/fiscal-profile/regression.cjs
node e2e/price-labels/report-compatibility.cjs
```

La demo genera parejas de capturas `*-canvas.png` y `*-preview.png`, y las cajas medidas por hoja en `tmp/wysiwyg-blocks/measurements.json`. Los escenarios A4 y ticket de 80 mm alternan entre cero, uno y cinco artículos. El ensayo verifica recorte de un texto largo, un elemento que invade el margen izquierdo y un texto que cabe correctamente. Inspeccionar la advertencia selecciona el elemento editable sin modificarlo.

En el lienzo, **Bloques generados** muestra contornos de tablas, artículos, subtotales y numeración. **Contenido generado** permite inspeccionar también cada fila y su ruta de origen cuando el renderer la proporciona. La inspección de un bloque generado limpia la selección de elementos editables. Los contornos carecen de manejadores de edición y las pruebas comprueban que Delete y los gestos sobre la tabla conservan Guardar deshabilitado. La comparación rápida oculta las anotaciones del lienzo.

Los límites imprimibles corresponden a los márgenes configurados del molde en cada hoja. Las cajas se miden en el DOM a escala CSS original, con tolerancia de 0,25 px para el límite y para comparar lienzo y Vista Previa. Los contornos de contenedores generados incluyen la extensión visible de sus descendientes, incluidos los subtotales flotantes.

Los recortes reutilizan `inspectRenderedLayout` y sus mediciones de texto, gráficos y desbordamiento. Se muestra **Contenido recortado** para las observaciones medidas y **Revisar posible recorte** cuando el inspector considera el caso no soportado. Una preparación con recursos incompletos muestra el estado pendiente y evita emitir una medición confirmada de recorte. Estas observaciones alimentan exclusivamente la capa de edición.

La prueba fiscal divide cinco filas en tres hojas mediante un máximo de dos filas y en dos hojas mediante la altura disponible. Comprueba cada caja DOM entre lienzo y Vista Previa, cinco rutas de artículo únicas, la numeración de todas las páginas, el cierre exclusivo en la última y la cantidad de hojas del PDF. También verifica el área imprimible de cada hoja. Un molde con agrupación y límite de filas conserva las cinco filas y muestra el diagnóstico existente de paginación pendiente.

Los indicadores se dibujan en la capa Angular externa al documento generado. Las reglas DGI, el paginador, el renderer, los contratos y los hashes de z-code históricos mantienen su línea base. Las nuevas anotaciones no se guardan en el JSON del molde ni se agregan al HTML exportado.

## Revisión final de las entregas 1, 2 y 3 — 21 de noviembre de 2026

Se revisaron la composición compartida, los orígenes de secciones, la conversión de zoom, los gestos, la edición decimal X/Y, las observaciones de contenido y la preparación de páginas. La revisión encontró un cruce de cargas en el lienzo. Una espera de fuentes del documento anterior podía terminar después de cambiar el molde y volver a habilitar su geometría. Se corrigió la invalidación por revisión y por estado pendiente. La selección simple conserva la capa de edición disponible y la suspensión de preparación empieza con el movimiento del gesto.

La prueba `design-canvas-surface.spec.ts` reproduce la carga de fuentes retrasada, la actualización pendiente del escenario y la continuidad de la capa de arrastre. Los dos primeros casos fallaron antes de la corrección. La suite de interacción espera que la superficie esté lista antes de iniciar cada gesto y verifica la selección completa del grupo.

Comando adicional para la suite Angular completa:

```powershell
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --progress=false
```

La revisión incluye la compilación de desarrollo, la suite Angular, las tres demos WYSIWYG, la regresión fiscal y los tres ensayos de etiquetas (`regression.cjs`, `print-batch.cjs` y `report-compatibility.cjs`). Los escenarios usan mocks HTTP y datos en memoria. La correspondencia del DOM conserva la tolerancia de 0,25 px CSS. Se verifican los hashes originales de z-code y la carga de moldes históricos sin cambios implícitos.

El renderer, las reglas DGI, la política de bloqueo, el paginador, el estado persistido de moldes, los contratos .NET y la persistencia MySQL conservan sus archivos de origen. Las capturas y medidas reproducibles están en las carpetas `tmp/wysiwyg`, `tmp/wysiwyg-interactions` y `tmp/wysiwyg-blocks`.

Resultados de la ejecución final, todos con salida 0.

| Comprobación | Resultado |
|---|---|
| Compilación de desarrollo | Correcta |
| Suite Angular completa | 596 pruebas aprobadas, incluidas las 3 regresiones de carga |
| Geometría WYSIWYG | 8 casos aprobados y hashes históricos coincidentes |
| Interacciones | Aprobadas al 60 %, 100 % y 140 % |
| Bloques, recortes y páginas | Aprobados, incluidos PDF y paginación pendiente |
| Regresión fiscal | Aprobada |
| Etiquetas, impresión por lotes y compatibilidad de reportes | Las 3 suites aprobadas |

Las pruebas se ejecutaron contra Chrome. Karma necesitó acceso al servidor local de pruebas en este entorno. Los primeros intentos de inicio se recuperaron antes de la ejecución final.

## Entrega 4 pendiente del entorno de prueba de Zureo

Por decisión del usuario, la entrega 4 queda pendiente hasta contar con un entorno real de prueba de Zureo. La opción por molde para imprimir elementos posicionados en tickets de 58/80 mm forma parte de esa entrega pendiente.

La condición para retomarla es disponer de un mecanismo que ejecute el HTML z-code exportado y permita observar el HTML resultante con los mismos datos de ejemplo. Esa ejecución deberá verificar posiciones, dimensiones, visibilidad, bindings, fórmulas y orden de los bloques en ambas anchuras, con cero, uno y cinco artículos. La correspondencia se contrastará con el lienzo, Vista Previa y HTML resuelto antes de habilitar la opción.

La validación ejecutada en las entregas 1 a 3 cubre el navegador y la compatibilidad del z-code histórico. La ejecución en el motor Zureo queda asociada a la entrega 4.
