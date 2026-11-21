# Contratos e identificación fiscal (continuación: etapas 1 y 2)

## Recorrido para estudiar el código

1. `core/models/validation.model.ts` define identidad de contenido y hallazgos sin importar ningún diseñador. Estado, severidad y salida son conceptos independientes. No contiene geometría.
2. `fiscal.model.ts` conserva los roles opcionales del molde y agrega vocabulario para identificación y constancias. No se escriben roles al abrir un molde histórico.
3. `fiscal-identification.ts` agrupa roles en zonas lógicas. No impone coordenadas ni pertenencia a header/detail/footer. Una identidad puede representar varias zonas.
4. `fiscal-rule-catalogue.ts` declara fuente, alcance, condiciones y dependencias de las obligaciones identificadas. `required` significa obligación aplicable, no presencia ni cumplimiento. El catálogo parcial es explícito: las obligaciones no incluidas continúan pendientes en el registro existente.
5. `html-renderer.service.ts` construye `RenderEvidence.content` por llamada. Las identidades de elementos conservan roles declarados; las de contenido automático se crean donde se genera cada celda o fragmento, con rutas de origen. `association: composite` informa que los roles comparten contenido y todavía no tienen medición individual.
6. `static-fiscal-rules.ts` expone aplicabilidad en `fieldRequirements` y hallazgos con `ruleId` y `findingId` individual. `id` permanece como alias compatible del identificador de regla. Los identificadores de hallazgo son locales al informe, no claves persistentes entre revisiones.

Los textos iguales no adquieren significado fiscal por coincidencia. El inspector existente requiere rol declarado además de coincidencia con el dato para sus aprobaciones textuales. Un rol por sí solo nunca aprueba una regla.

El catálogo pasa a `stage-0.3`. Se corrigen las citas de la representación impresa al PDF oficial 25.2 (pp. 78–84 y tabla de topes p. 89); no se cambian los umbrales ni criterios geométricos existentes. Las explicaciones históricas del servicio de IA conservan su catálogo independiente y requieren sincronización documental posterior.

## Contenido generado y límites

El detalle de hojas y tickets identifica descripción, cantidad, precio e importe según los campos que usa realmente el renderer. Los descuentos legacy y los totales no reciben equivalencias fiscales supuestas. Las celdas de totales tienen identidad propia; las que contienen valores conservan la ruta original, incluso cuando su rol queda vacío. Los rótulos generados sin origen de datos tienen `sourcePaths: []`.

Los atributos `data-render-content` relacionan el HTML con el manifiesto. Los IDs generados son locales al render. Las cajas de bloques y filas existentes siguen disponibles como estructura; no son una segunda prueba del contenido de sus celdas. La asociación con instancias paginadas corresponde a la futura inspección.

`renderPreview` y la exportación Zureo no reciben esta instrumentación. `renderWithEvidence` agrega atributos sin cambiar estilos ni datos del molde. La salida Zureo sigue siendo una ruta independiente, sin atribuirle resultados del navegador.

El contexto mantiene conocidos, desconocidos y contradicciones por campo. Las obligaciones consultan sus dependencias, sin convertir datos ausentes en falsos. Las particularidades por operación, referencias globales, exoneraciones y secretos profesionales que requieren más evidencia permanecen pendientes. No se cambian reglas normativas ni bloqueos de impresión.

## Pendiente: etapas 3 y 4

Medir fragmentos y gráficos, visibilidad efectiva y recortes; registrar instancias y páginas; asociar contenido generado con configuración editable; detectar candidatos y confirmar afectación visible. No se implementan aquí el inspector geométrico general, superposiciones generales, máscaras de tinta ni correcciones automáticas.

## Verificación

Ejecutar `npm run build`, Karma con ChromeHeadless y `node e2e/fiscal-profile/regression.cjs`. Las pruebas de identificación complementan las existentes de contexto, roles, persistencia y compatibilidad: moldes históricos, múltiples roles, obligaciones condicionales, contradicciones, identidades individuales y contenido automático de hojas/tickets.
