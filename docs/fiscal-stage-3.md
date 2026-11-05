# Etapa 3: fidelidad y evidencia del renderer

`renderWithEvidence(template, data)` devuelve HTML, un manifiesto de observaciones
y una instantánea JSON de las entradas. El manifiesto se crea por llamada; no se
comparte entre renders ni se guarda en los moldes. No contiene resultados normativos.

La vista previa consume esta salida y conserva sus entradas en memoria. Los
elementos llevan `data-render-element` y sección; el manifiesto registra roles
declarados y si se emitió HTML (no significa que resulte visible o imprimible).
Se identifican también bloques y filas generadas. Las filas de artículos apuntan
a `invoiceLines.<índice>`. Las filas de totales tienen identificadores generados,
sin atribuirles una equivalencia fiscal o un binding que el renderer no conoce.
Los identificadores generados son locales a esa salida, no IDs persistentes.

## Correcciones

- QR sin contenido: no se genera un QR con una URL ficticia. Se conserva una caja
  vacía identificada como error y se registra el dato faltante.
- Código de barras sin datos: tampoco recibe contenido numérico de ejemplo.
- Fallos de fórmulas y condiciones: se registran, y un fallo en la condición no
  se convierte en verdadero por contener un mensaje de error no vacío.
- Rectángulos: se elimina el `position:relative` que anulaba su posición absoluta.
- `screenOnly` y `printOnly`: se aplican mediante reglas CSS de medio, compartidas
  por la salida mostrada y la impresión del mismo iframe.
- QR: símbolo y zona silenciosa quedan explícitos en el SVG (cuatro módulos).
  Esto no declara un margen normativo en mm; su medida requiere la etapa posterior.
- Rollo dinámico: `@page size:auto` evita imponer una longitud fija artificial.
  El ancho físico debe configurarse en el controlador de impresión; esa limitación
  aparece en el manifiesto. No se introduce paginación ni una altura física calculada.

## Recursos y limitaciones explícitas

La inyección del iframe descarta trabajos obsoletos. Espera `document.fonts.ready`
y la decodificación de imágenes, con límite de cinco segundos y diagnósticos de
imagen/tiempo de espera. La finalización de carga es un estado técnico, no prueba
de disponibilidad de cada fuente ni de legibilidad. No cambia el permiso de imprimir.

Se informa cuando el renderer omite elementos posicionados de detalle en tickets,
cuando un pie personalizado sustituye los subtotales automáticos y cuando existen
secciones repetidas, opciones de repetición o estilos con nombre no soportados.
Estas observaciones impiden que una futura inspección confunda una declaración
del modelo con contenido realmente generado. No se cambia automáticamente el molde.

La exportación Zureo sigue siendo una ruta de directivas distinta; no se le atribuye
el manifiesto de la impresión por navegador. La instrumentación del navegador no
ejecuta el motor de reglas sobre el DOM, no mide cajas ni detecta solapamientos,
recortes, cumplimiento de QR o paginación; tampoco bloquea imprimir.

Las pruebas verifican trazabilidad, entradas sin mutación, independencia entre
renders, datos faltantes, errores de condiciones, posicionamiento, medios CSS,
zona silenciosa del QR y limitaciones de tickets. La prueba de navegador conserva
el recorrido de perfil/roles y la comparación antes/después del mismo diseño.
