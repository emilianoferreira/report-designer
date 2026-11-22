# Auditoría de integración de los PR #3 y #4

22 de noviembre de 2026

## Alcance

Validación de los recorridos de creación, edición, duplicación, guardado, reapertura, simulación e impresión de comprobantes y etiquetas. El laboratorio usa Angular, .NET y MySQL con datos sintéticos. La revisión se concentra en regresiones de los PR integrados y deja las correcciones para una etapa posterior.

## Versión auditada

`origin/main` en `e9e2603` (merge del PR #4), con el merge `1dc4e9b` del PR #3. El árbol Git de `main` y el del checkout activo son idénticos (`1474d3427112c89ec36fc61963c471c4ea9facf7`). Se usó este checkout sin cambiar de rama.

## Resultados en el laboratorio

Angular sirvió la interfaz por el puerto 4211. La API .NET respondió 200 en `/health/ready`. Desde Chromium, con sesión de editor, el frontend obtuvo 200 en `/api/templates` y leyó un comprobante sintético de MySQL en `/api/invoices`. Las altas, guardados, duplicados y reaperturas siguientes se ejecutaron contra la misma API.

| Recorrido real | Resultado observado |
|---|---|
| Comprobante A4 | Alta en blanco, vínculo de fecha y total, guardado, recarga y duplicado con URL independiente. La simulación de 1, 5 y 15 artículos produjo PDF de 1, 1 y 2 hojas A4 con límite de 8 líneas. El total estuvo una sola vez. |
| Ticket de 80 mm | Alta en blanco, edición, guardado, recarga, duplicado y simulación. El PDF tuvo una página por escenario. El ancho medido fue 80,1 mm y el largo pasó de 64,9 a 127,7 y 311,8 mm con 1, 5 y 15 artículos. |
| Etiquetas | Alta de molde de 50 × 30 mm, simulación, guardado, recarga y duplicado. Se prepararon dos artículos y tres copias. El cambio de Principal a Mayorista conservó cantidades y actualizó precios. Tras corregir el mismo molde y guardar, reaparecieron la lista, las cantidades y el prefijo nuevo. |
| Salida de etiquetas | El mismo lote produjo una hoja A4 y tres páginas térmicas de aproximadamente 50 × 30 mm. El botón Imprimir entregó al navegador el documento revisado. |

Los PDF se generaron con Chromium a partir del documento que recibió el botón Imprimir. Se verificaron recuentos y dimensiones digitales.

Los recorridos reales se hicieron a 1280 × 800. Chromium no registró excepciones de página. Los moldes nuevos y sus copias quedaron en el laboratorio con el prefijo «UX auditoría 3-4».

## Pruebas automatizadas

| Comando | Resultado |
|---|---|
| `npm run build` | Pasó. Avisos CommonJS de `jsbarcode` y `qrcode`. |
| `npm test -- --watch=false --browsers=ChromeHeadless` | Falló al compilar los tests. Ver A-01. |
| Angular con exclusión temporal del spec del catálogo en el ejecutor y en TypeScript | 587 pasaron y 1 falló. El caso de envío del formulario aún espera el objeto anterior, sin `startingPoint`. La configuración temporal solo se usó para el diagnóstico. |
| `dotnet run --project backend-dotnet/tests/LabelPrinting/LabelPrinting.csproj --no-restore` | Pasó. 161 aserciones del backend de impresión de etiquetas. |
| `node e2e/price-labels/print-batch.cjs` | Pasó. Lote, cambio de lista, retorno desde el editor, salida A4 y rollo, teclado a dos tamaños de ventana. |
| `node e2e/price-labels/report-compatibility.cjs` | Pasó. Reportes A4 y térmicos, cinco artículos y exportación de directivas. |
| `node e2e/fiscal-profile/regression.cjs` | Pasó. Guardado, JSON de simulación, validación de impresión y PDF de varias páginas. |
| `node e2e/wysiwyg/blocks-and-pages.cjs` | Pasó. Composición de secciones, límites, recortes y paginación. |
| `node e2e/price-labels/regression.cjs` | Pasó. Editores, compatibilidad, persistencia, conflictos y calibración. La prueba cubre el conflicto de molde de forma aislada. A-02 aparece al combinarlo con un lote activo. |

## Hallazgos

### A-01 · Alta técnica · La suite de Angular queda bloqueada antes de ejecutar las pruebas

- **Reproducción.** Ejecutar `npm test -- --watch=false --browsers=ChromeHeadless`. La compilación de pruebas arroja TS2345 en dos llamadas a `onFormSaved`. Karma termina con un error de carga.
- **Impacto.** La compilación de producción pasa. El comando de pruebas general pierde toda la cobertura unitaria porque el ejecutor se detiene en la compilación.
- **Causa probable.** El PR #4 hizo obligatorio `startingPoint` en los datos del formulario y los specs conservan las entradas y expectativas del contrato anterior.
- **Causa probable.** El PR #4 hizo obligatorio `startingPoint` al crear moldes. Dos entradas de prueba todavía usan el contrato anterior. La prueba de error también espera el rechazo de una promesa y el componente actual captura el error para dejar el formulario y mostrarlo.
- **Comprobación auxiliar.** Excluir el spec solo en el ejecutor deja el TS2345. Al excluirlo también con un `tsconfig` temporal, se ejecutaron 588 casos. La única falla fue `MoldFormComponent should emit saved data on submit`, cuya expectativa tampoco incluye `startingPoint`.
- **Archivos.** [Pruebas del catálogo](../src/app/features/template-designer/components/template-list/template-list.component.spec.ts#L33) · [Prueba del formulario](../src/app/features/template-designer/components/mold-form/mold-form.component.spec.ts#L44) · [Contrato del formulario](../src/app/features/template-designer/components/mold-form/mold-form.component.ts#L15) · [Guardado del catálogo](../src/app/features/template-designer/components/template-list/template-list.component.ts)

### A-02 · Media funcional · Se pierde el lote al guardar como copia después de un conflicto

- **Reproducción.** Preparar un lote con dos artículos, tres copias y Mayorista. Pulsar **Abrir molde**. Abrir el mismo molde en otra pestaña y guardar una revisión. Cambiar el nombre en el editor original y pulsar **Guardar y volver al lote**. Ante el conflicto 409, pulsar **Guardar borrador como copia** y luego **Preparar impresión** desde esa copia.
- **Resultado.** La copia se guarda, pero la pantalla vuelve con **Lote · 0 / 100 etiquetas**, lista sin elegir y sin vista previa. El camino de guardar sobre el mismo molde conservó el lote.
- **Impacto.** El usuario pierde el trabajo de selección y debe reconstruir el lote precisamente al usar la acción de recuperación del conflicto.
- **Causa probable.** Al guardar como copia, el editor navega al ID nuevo sin el parámetro del lote. El servicio de borrador lo vincula al molde original y limpia el traspaso al salir de esa ruta.
- **Archivos.** [Navegación después de guardar](../src/app/features/price-label-designer/components/price-label-designer/price-label-designer.component.ts#L356) · [Vigencia del borrador del lote](../src/app/features/price-label-print/label-print-draft.service.ts#L29)

### A-03 · Baja visual · La barra de Reportes muestra cantidades ambiguas en el escenario de 15 artículos

- **Reproducción.** Abrir la vista previa de un comprobante de prueba, pulsar **15 artículos** y observar la barra a 1280 × 800.
- **Resultado.** El resumen muestra «15 artículos · Página 1 de 2», mientras la barra deja a la vista «1 artículo» y «15 artículos». La salida contiene las 15 líneas. También se confirmó que la barra de exportaciones ocupa dos filas a ese ancho.
- **Causa probable.** El control original de 1/5 artículos usa «1 artículo» como texto para cualquier modo distinto de `multi`. El escenario nuevo se añadió como botón independiente.
- **Archivo.** [Barra y estado de vista previa](../src/app/features/template-designer/components/preview/preview.component.html#L12)

### Comprobaciones de problemas ya documentados

- **Formato térmico y paginación.** En los casos válidos probados, el PDF ya respetó el ancho del ticket y las páginas del A4 coincidieron con la vista previa.
- **Resumen de la tirada.** A 1280 × 800, junto a Imprimir se ven el soporte y las páginas. La lista de precios queda en la configuración superior. Persiste la fricción registrada en el [diagnóstico de UX](rediseno-funcional-y-ux.md), sin discrepancia observada entre el precio revisado y la salida.

## Pendientes para el cierre

- Restablecer la suite Angular y repetir el comando general. Incorporar el caso de conflicto con lote activo a la prueba de recuperación de Etiquetas.
- Validar escala, corte y lectura de códigos en los dispositivos de destino. Los tamaños aquí registrados son medidas digitales del PDF.
- Contrastar los datos de comprobantes, los precios y la ejecución de las directivas con Zureo. Los casos de este documento usan los proveedores sintéticos del laboratorio.
- Las pruebas de despliegue y la matriz completa de migración quedan fuera de esta auditoría de los flujos principales. El recorrido real de este documento usó .NET y MySQL. Las regresiones Chromium preexistentes complementaron esa comprobación con sus fixtures.
