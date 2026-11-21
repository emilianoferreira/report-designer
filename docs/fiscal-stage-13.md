# Integración del feedback y validación previa a imprimir

La etapa 13 integra la presentación de receptor, importes y referencias con la política de impresión existente. Los motores de las etapas 10 a 12 siguen evaluando sus campos; el feedback explica sus resultados y el botón Imprimir vuelve a inspeccionar su propio documento vigente. No se agregan cálculos fiscales ni consultas de IA.

## Feedback compartido

`ValidationFeedbackComponent` se utiliza en el diseñador y en Vista Previa. Agrupa las comprobaciones en Receptor, Importes moneda y signos, y Referencias. Expone resultados confirmados, pendientes y verificados en el escenario, manteniendo también los no aplicables disponibles en el detalle. Los contadores representan comprobaciones e instancias, no una certificación de campos ni de cumplimiento global. Se informa el tipo de CFE conocido y la versión de matriz disponible.

`ValidationFinding.fieldPath` agrega una ruta opcional al contrato común. Los motores la completan sin cambiar su identidad de regla. `findingTarget` la convierte en una localización legible: ítem, tributo, ajuste o referencia, seguida de la página cuando corresponde. Así, dos fallos de una misma regla conservan identidades y acciones independientes.

Las tarjetas permiten seleccionar propietarios editables y abrir la página afectada. Los botones de selección se deduplican por elemento y sección; los hallazgos no se fusionan. El contenido sin propietario editable conserva la navegación a página. Los resultados nuevos no se duplican en la lista genérica del catálogo ni se conectan al componente de orientación de IA anterior.

## Confirmación y política de bloqueo

`confirmedPrintFailures` conserva los controles normativos existentes y las superposiciones o recortes técnicos confirmados. Para los controles de contenido de las etapas 10 a 12, admite únicamente las reglas que pueden confirmar una infracción y exige evidencia de contenido e identidad válida de página. Resúmenes, cobertura, necesidad de referencias y diagnósticos del origen no se convierten en bloqueos aunque reciban accidentalmente estado de fallo.

La severidad sigue independiente del cumplimiento: un fallo confirmado con severidad advertencia bloquea; un pendiente con severidad error no bloquea. Una condición fiscal desconocida, contradictoria o conocida como no CFE no activa la restricción fiscal. Los informes ajenos a la salida del navegador no autorizan su impresión.

El feedback utiliza la misma decisión para explicar qué bloquea y qué no. Un resultado sin confirmación suficiente se presenta como tal y no recibe resaltado de error confirmado. La inspección del lienzo sirve de feedback, nunca de autorización para otro iframe.

## Vigencia del artefacto

La sesión del diseñador invalida informe, feedback y resaltado inmediatamente al cambiar molde, escenario o interacción. Vista Previa también retira sus resultados al editar, antes de esperar los 300 ms de actualización. El informe se muestra para todos los escenarios, incluidos los históricos, en lugar de depender del selector de ejemplo fiscal.

Antes de imprimir se vuelven a comprobar snapshot de molde y datos, versión de inyección e identidad del documento; después se inspecciona nuevamente ese documento. Una modificación de su texto visible puede producir un bloqueo aunque su análisis previo fuera correcto. Reparar o regenerar la salida exige una evaluación nueva: los bloqueos no quedan adheridos al escenario ni al molde.

La suscripción de Vista Previa cancela el debounce al destruirse. Esto evita que la finalización de la suscripción emita una edición pendiente y prepare otro documento después del cierre. La protección contra impresiones concurrentes se conserva.

## Independencia de Zureo

Las comprobaciones, mensajes y restricciones corresponden al navegador. Exportar y copiar directivas Zureo no dependen de esa decisión y toman el molde actual, incluso durante el intervalo de actualización de Vista Previa. No reutilizan un informe del navegador como evidencia de ejecución del ERP. Los datos del escenario y el feedback no se guardan en el molde.

No se cambian posiciones, tamaños, estilos ni valores fiscales. Los archivos descargados y la ejecución real de directivas mantienen sus controles externos pendientes.

## Verificación

- 532 pruebas unitarias aprobadas en ChromeHeadless, incluidas pruebas nuevas de política, presentación compartida, selección, invalidación, preparación del documento real, impresión concurrente, cierre con edición pendiente y exportación independiente.
- Compilación de producción correcta; permanecen los avisos CommonJS existentes de qrcode y jsbarcode.
- `node e2e/fiscal-profile/regression.cjs`: correcto; compatibilidad histórica, guardado y recarga, escenarios JSON, QR, superposiciones, recortes, Zureo y PDF multipágina.
- `node e2e/fiscal-profile/content-feedback.cjs`: correcto; las tres familias permiten imprimir con pendientes, bloquean discrepancias confirmadas al reinspeccionar el iframe, conservan selección y navegación, permiten exportar Zureo y dejan de bloquear al regenerar una salida correcta. Usa API simulada y no realiza solicitudes de IA ni escrituras de moldes.
- `git diff --check`: correcto.

## Cobertura que permanece pendiente

Integrar los controles no resuelve las limitaciones documentadas en las etapas 10 a 12: excepciones sectoriales, altura física de caracteres, omisiones sin cobertura semántica completa, agrupaciones y formatos no interpretados, redondeos no verificables, elegibilidad de referencias globales y existencia de documentos en DGI. Tampoco certifica el resultado físico de impresión ni Zureo. Esos casos siguen visibles como pendientes y no se convierten en fallos por inferencia.
