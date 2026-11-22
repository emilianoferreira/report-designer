# Revisión de etapas fiscales 1 a 7

## Alcance y resultado

Se revisaron contratos, contexto y procedencia de datos, roles, catálogo estático, evidencia del renderer, inspector, detector, reglas de ubicación, paginación, escenarios, feedback y política de impresión. Se mantienen los ocho tipos soportados y la separación browser/Zureo. No se modificaron datos fiscales guardados, posiciones del molde, endpoints o base de datos. No se incorporaron funciones de IA.

La revisión no constituye una certificación DGI. Los controles no implementados o sin evidencia suficiente permanecen pendientes. Un catálogo de roles no equivale a una matriz completa de obligaciones de impresión por tipo y operación.

## Problemas corregidos

| Problema observado | Corrección y alcance |
| --- | --- |
| El fondo y los bordes de una caja podían contabilizar la misma tinta varias veces y superar artificialmente la tolerancia de choque. | Primitivas decorativas sin duplicación del relleno ni de las esquinas. Regresión con intersección de 1 px². |
| Un elemento de altura cero se descartaba antes de buscar texto recortado. | Inspección de sus nodos de texto y detección de la pérdida de tinta. |
| IDs duplicados podían heredar los roles de la primera entrada del manifiesto. | La identidad ambigua conserva localización técnica pero no recibe roles; se informa cobertura pendiente. Los controles textuales exigen identidad única. |
| El inspector no abstuvo todos los contextos de apilamiento complejos y sombras. | Esos estilos quedan no verificables. No se confirma una infracción sobre su rasterización parcial. |
| Algunas reglas aprobaban textos con efectos no soportados por el inspector. | Las aprobaciones textuales requieren primitivas medidas, sin recortes ni conflicto. |
| Un diagnóstico sobre otro dato suspendía controles independientes del documento. | La evaluación renderizada usa los hechos disponibles y sus conflictos; un error de moneda, por ejemplo, no oculta una fecha comprobable. El catálogo estático conserva algunas abstenciones más amplias, documentadas como pendientes. |
| Exoneración parcial/desconocida podía recibir una aprobación demasiado general. | REG-01 conserva pendiente el caso que necesita verificar la condición de exoneración. |
| Un rol QR podía utilizarse como prueba suficiente para una infracción de ubicación. | La relación código/QR exige que previamente se haya verificado el contenido del QR en la salida. |
| Multipágina podía mostrar una aprobación integral con evidencia parcial y condensaba varios controles en una sola instancia. | EXT-03 permanece pendiente de cobertura completa. QR y controles de hoja conservan resultados e identidad individuales por página. |
| Repetir el paginador devolvía incorrectamente una página; el ajuste final no verificaba toda la numeración. | Idempotencia para documentos paginados y comprobación final de páginas, celdas y rótulo, con restauración del original si la composición no cabe. |
| La opacidad configurada se ignoraba para figuras, imágenes y códigos, creando una diferencia entre lienzo y salida. | La opacidad se aplica mediante el CSS común de posición. Es un cambio de fidelidad del renderer: un molde con esos elementos translúcidos ahora imprime la opacidad que declaró. |
| Cantidades provenientes de JSON se insertaban sin escape en detalle de hojas/tickets. | Se imprimen como texto escapado, sin interpretar marcado incluido en el dato. |
| Un error asíncrono al preparar el iframe podía quedar como rechazo no gestionado. | Captura explícita, invalidación del informe y mensaje técnico; no se autoriza impresión por ausencia de informe. |

## Cobertura pendiente

| Familia | Qué falta o requiere evidencia adicional |
| --- | --- |
| Datos y semántica | Completar la matriz de obligatoriedad para cada operación de los ocho tipos; descomponer fórmulas y elementos compuestos de forma inequívoca; asociar todos los valores automáticos con campos fiscales. `Total`, `Subtotal` y rótulos libres de impuestos no reciben equivalencias supuestas. Tipos fuera del alcance conservan cobertura pendiente. |
| Legibilidad y soporte | Borde normativo sin letras en toda la salida, altura física real de caracteres, interlineado, legibilidad/color, límite e interpretación del tamaño del logo. Las dimensiones declaradas de hoja/rollo no prueban tamaño físico, gramaje, resolución, controlador, escala ni papel preimpreso. |
| Receptor | Recuadros y dimensiones, consumo final, umbrales y cotización UI aplicable, retenciones/percepciones, tipo/país del documento, excepciones sectoriales y secreto profesional. No se declara omisión por falta de roles. |
| Cuerpo, importes y referencias | Cobertura completa de IVA por tasa, régimen, descuentos/recargos, signos, montos no facturables, retenciones, crédito fiscal, total frente a total a pagar, servicios/operaciones mixtas, constancias y todas las referencias asociadas. Las verificaciones exactas disponibles no certifican la aritmética ni el XML. |
| Régimen | Casos de exoneración parcial, menciones permitidas/prohibidas, recuadros, posiciones y alturas de leyendas; excepciones por operación. |
| QR y pie | Pares de medida intermedios sin interpretación confirmada, gráficos externos que puedan contener el sello, lectura por escáner/impresora, código con rótulos o composición no desglosada, ingreso/resolución, sitio de verificación, constancia IVA, CAE/rango/vencimiento y sus recuadros/alturas completos. |
| Ubicación y adenda | Ángulos y sectores sin límites numéricos expresos; elegibilidad de distribución alternativa; delimitación y cobertura total de adenda, prioridad de constancias obligatorias, excepciones de distribución y secreto profesional. El margen de adenda solo se decide en el subconjunto con recuadro, datos y disposición verificables. |
| Geometría | SVG genéricos, canvas/objetos, imágenes sin acceso a píxeles, transparencia parcial, efectos, transformaciones, máscaras, tipografía avanzada y apilamiento complejo. La tolerancia de 2 px² y los píxeles de baja opacidad pueden dejar afectaciones menores sin detectar. Un pendiente no afirma ausencia de superposición. |
| Multipágina | Verificación integral de valores y excepciones en cada hoja, sello completo y datos exclusivos de última hoja. Agrupaciones, pageHeader/pageFooter y opciones de repetición no soportadas por el renderer permanecen pendientes; no se intenta reconstruirlas silenciosamente. |
| Zureo y salida externa | Ejecución de directivas y medición del resultado real del ERP. Tampoco se controlan cambios del controlador de impresora ni impresiones externas de archivos descargados. Ninguna aprobación browser se atribuye a estas salidas. |

La impresión de CFE desde la aplicación bloquea fallos normativos y superposiciones/recortes confirmados sobre su artefacto vigente. Los pendientes y los datos fiscales desconocidos o contradictorios no se convierten en infracciones. Esto permite imprimir con cobertura incompleta, conforme a la política solicitada; el informe informa esa limitación.

## Verificación

- `npm run build`: correcto; permanecen avisos CommonJS de qrcode/jsbarcode.
- Karma/ChromeHeadless: 435 pruebas aprobadas, incluidas regresiones nuevas de la revisión.
- `node e2e/fiscal-profile/regression.cjs`: correcto; guardado/recarga, escenarios JSON, selección/resaltado, impresión vigente, bloqueo por superposición/recorte, permiso con transparencia pendiente, Zureo independiente y PDF multipágina.
- `git diff --check`: correcto.

Fuentes normativas del catálogo: [Formato CFE 25.2](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=), representación impresa y tablas asociadas; [Resolución DGI 798/2012 y modificativas](https://www.efactura.dgi.gub.uy/files/resolucion-no-798-2012?es=). Esta revisión corrige evidencia y cobertura: no incorpora nuevos umbrales geométricos legales ni declara resueltas interpretaciones pendientes.
