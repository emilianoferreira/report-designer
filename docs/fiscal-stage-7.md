# Etapa 7: preparación y política de impresión

## Recorrido único

`prepareBrowserPrint` espera fuentes e imágenes con un límite de cinco segundos, comprueba la vigencia, pagina los CFE cuando hay recursos y evalúa el documento resultante. Se usa tanto en el iframe de análisis del diseñador como en el iframe de Vista Previa. Cada consumidor obtiene resultados de su propio documento: el informe del diseñador no se utiliza para autorizar una impresión.

La vista previa utiliza siempre la superficie de impresión del renderer, incluidos los elementos printOnly y la exclusión de screenOnly. Antes de llamar a `window.print()`, comprueba versión de inyección, identidad del documento y snapshot completo de molde y datos, y vuelve a inspeccionar esa superficie. `decideBrowserPrint` centraliza la decisión. La impresión doble concurrente conserva la protección existente.

Un resultado ausente, estático, de otra salida o desactualizado requiere preparar nuevamente el documento. Es una condición técnica de vigencia, no un incumplimiento fiscal ni un bloqueo por controles pendientes. Excepciones de preparación se informan como problemas técnicos; nunca se interpreta la ausencia de informe como autorización validada.

## Qué bloquea

Solo cuando el contexto conoce inequívocamente que el documento es CFE:

- Fallos normativos confirmados de esa salida renderizada.
- `TEC-OVERLAP` y `TEC-CLIP` confirmados, con referencias a evidencia de contenido.

La severidad no sustituye al estado de cumplimiento. Una advertencia pendiente nunca bloquea, aunque su severidad sea alta. Los problemas técnicos ajenos a esas reglas tampoco se convierten automáticamente en motivos de bloqueo. Los fallos de recursos y los tiempos agotados dejan controles pendientes; no son por sí solos infracciones confirmadas. Un fallo confirmado independiente, como dimensiones de papel, sigue teniendo efecto aunque existan otros pendientes.

La condición fiscal desconocida, contradictoria o conocida como no fiscal no activa este bloqueo de CFE. El perfil del molde por sí solo no convierte al documento en fiscal.

El mensaje de bloqueo enumera reglas y páginas afectadas. El informe completo conserva las identidades individuales, localización y evidencia. Resolver un problema exige una nueva evaluación del documento vigente; no se desplazan elementos automáticamente.

## Salida Zureo

La exportación HTML z-code sigue generando directivas sin datos ejecutados. No recibe ni reutiliza decisiones del navegador. La interfaz indica expresamente que la salida ejecutada en Zureo necesita su propia validación. La política de impresión del navegador rechaza informes de otro alcance y descarta hallazgos marcados para Zureo.

Los botones de exportación no equivalen a impresión fiscal validada. El control cubre el botón Imprimir de la aplicación, no impresiones externas de archivos descargados ni cambios posteriores en el controlador de impresora. No se incorporaron cambios a la API, la base de datos o funciones de IA.

## Pruebas

Las pruebas unitarias cubren fallos normativos y técnicos confirmados, pendientes de cualquier severidad, evidencia inexistente, instantáneas obsoletas, documentos no fiscales/desconocidos/contradictorios, aislamiento de Zureo y múltiples instancias por página. La preparación compartida prueba errores de imagen, espera limitada y descarte de documentos obsoletos después de resolver recursos.

La regresión de navegador verifica que `window.print()` no se invoque ante tinta superpuesta o recortada en un CFE; que sí se invoque con una cobertura translúcida pendiente; que no se active el bloqueo fiscal para datos no fiscales/desconocidos; y que se puedan exportar directivas Zureo pese a un fallo del navegador. Conserva los recorridos de guardado/recarga, cambio de datos durante la preparación, JSON compartido, sello, remito/resguardo y PDF multipágina.
