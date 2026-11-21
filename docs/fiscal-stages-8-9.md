# Matriz normativa y evidencia fiscal por campo

Las etapas 8 y 9 agregan un inventario de obligaciones de representación impresa para los ocho tipos soportados y contratos que permiten vincular campos con su origen y contenido generado. Los evaluadores específicos de receptor, importes y referencias corresponden a las etapas 10 a 12.

## Matriz de obligaciones

`fiscal-obligation-matrix.ts` contiene una entrada por rol fiscal y entradas adicionales para soporte, legibilidad, distribución, recuadros, QR, adenda y multipágina. Cada entrada tiene celdas explícitas para 101, 102, 103, 111, 112, 113, 181 y 182, fuente, apartado, fecha de revisión, condición, excepciones, dependencias y cobertura pendiente. Las ramas de receptor, detalle, IVA, total a pagar y referencias documentan las alternativas por campo. Las excepciones sectoriales quedan identificadas para revisión particular.

Los estados de obligatoriedad son `required`, `optional`, `conditional`, `not-applicable` y `pending`. Son independientes de `pass`, `fail` y la severidad de un hallazgo. Las ramas también documentan prohibiciones de menciones. Una celda condicional no ejecuta un control ni autoriza bloqueo. `coverage` indica si existe alguna comprobación parcial o solamente catálogo; ninguna fila declara cobertura completa.

El informe estático incorpora `obligationMatrix` con versión y selección de celdas. Los tipos desconocidos, contradictorios o fuera del alcance permanecen pendientes. Un diagnóstico ajeno al tipo no suspende la selección de una celda independiente. El catálogo anterior mantiene sus identificadores para compatibilidad; sus requisitos agrupados de receptor y detalle se abstienen en casos de remito y resguardo que necesitan ramas separadas.

Fuentes: [Formato CFE 25.2](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=) y [Resolución 798/2012 con modificativas](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012). La fecha `reviewedOn` corresponde a revisión del catálogo; `effectiveFrom` identifica una transición normativa particular y no reemplaza el análisis histórico de cada operación.

## Datos y procedencia

`FiscalData` conserva la versión 1.0 y agrega propiedades opcionales para exportación, receptor no residente sin RUT, persona física, bienes de terceros, titular, cotización a UYU, fecha y procedencia de UI. Las líneas admiten tipo de operación propio; las referencias admiten identificador y descripción de documentos sin codificación. Los adaptadores históricos no reciben mapeos supuestos.

`buildValidationContext` mantiene `facts` y agrega `fieldFacts`, indexado por rutas como `lines.0.amount`, `lines.0.taxes.1.rate` o `references.2.number`. Cada hoja conserva candidatos y procedencia. Un valor inválido no borra sus hermanos válidos; la colección original sigue desconocida si contiene datos inválidos. Los conflictos de colecciones impiden que `fiscalFieldFact` seleccione arbitrariamente una fila entre fuentes. La colección ausente y la lista vacía conservan significados diferentes.

Las rutas por índice solo identifican la instancia en el origen correspondiente. No vinculan automáticamente `invoiceLines.0` con `fiscal.lines.0`, ni reconcilian listas reordenadas. Los contextos antiguos sin `fieldFacts` siguen admitidos y las rutas anidadas no disponibles devuelven desconocido.

## Evidencia del renderer

Cada contenido puede incluir `fields`: ruta de origen, ruta fiscal si existe binding explícito, colección e índice, y asociación individual o compuesta. El detalle automático registra esta información tanto en hojas como en tickets. Los textos literales y los roles declarados no generan correspondencias de datos.

El renderer registra cobertura `partial` para bindings fiscales explícitos, con sus identidades de evidencia. Esto no acredita visibilidad, exactitud ni ausencia de omisiones. La cobertura completa exige interpretar toda la salida relevante; encontrar un rol no alcanza. Las fórmulas compuestas continúan sin descomposición automática.

`printedDecimalMatches` compara decimales como cadenas, con separadores explícitos y agrupación validada. No convierte a coma flotante, redondea ni interpreta símbolos monetarios. Si el formato declarado requiere una pérdida de precisión, devuelve no verificable. El renderer actual conserva su formato y comportamiento; el comparador no participa todavía del bloqueo de impresión.

## Continuación

Quedan pendientes los evaluadores de aplicabilidad por operación y fecha, umbrales y excepciones del receptor, correspondencia de importes y referencias por instancia, cobertura semántica completa y su integración progresiva al feedback. No se añaden cálculos fiscales, consultas externas automáticas, certificación de impresión física ni controles del resultado de Zureo.

## Verificación

- Compilación de producción correcta; avisos CommonJS existentes de qrcode y jsbarcode.
- 459 pruebas unitarias aprobadas en ChromeHeadless, incluidas las nuevas pruebas de matriz y contratos por campo.
- Regresión fiscal de navegador aprobada: guardado y recarga, bloqueo según contexto, superposición y recorte, escenarios JSON, exportación Zureo y PDF multipágina.
- `git diff --check` correcto.
