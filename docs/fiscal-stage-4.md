# Etapas 3 y 4: inspección geométrica y conflictos de contenido

Estado histórico de estas etapas: la política de bloqueo aquí descrita se amplía en `fiscal-stage-7.md` para incluir superposiciones y recortes confirmados de CFE.

## Recorrido del código

- `core/models/layout-evidence.model.ts`: mediciones, tinta e identidades por página. Coordenadas en píxeles CSS, relativas a la página y sin zoom de la vista previa.
- `rendered-layout-inspector.ts`: adaptador DOM de solo lectura. Consume el manifiesto del renderer; no cambia el molde ni el documento. Se ejecuta después de los recursos y de la paginación existente.
- `shared/utils/content-overlap.ts`: motor puro, independiente de los diseñadores y de DGI. Compara primitivas dentro de una misma página, no cajas de filas o tablas duplicadas.
- `layout-rule-results.ts`: convierte conflictos en hallazgos técnicos con identidad individual, página, coordenadas en mm, evidencia y elementos editables asociados cuando existen.
- `inspectFiscalPrint`: incorpora estos hallazgos junto a las reglas existentes; procesa todas las páginas incluso si una regla fiscal no puede decidir.

## Qué se confirma

Se miden líneas de texto con Range y se rasterizan con la misma fuente en canvas, verificando coincidencia de anchura y métricas verticales. Se excluyen espacios y píxeles de baja opacidad. Las líneas que cambian por datos dinámicos se procesan individualmente. Se detecta pérdida de tinta contra overflow de elementos/ancestros y el límite de página declarado. En rollos se usa la longitud efectivamente renderizada, sin máximo ficticio.

Fondos y bordes rectos opacos participan como decoración. Un fondo detrás del texto y un recuadro cuyo borde no toca letras son composiciones válidas. Un relleno delante que cubre tinta produce un conflicto. Las primitivas del mismo nodo no se enfrentan entre sí.

Las imágenes ya decodificadas y accesibles a canvas conservan su canal alfa y object-fit centrado. Una imagen transparente no se considera un rectángulo opaco. El QR generado con fondo blanco opaco tiene su región pintada identificada. Otros SVG/canvas/objetos, imágenes externas sin acceso a píxeles, transparencias parciales y estilos complejos producen candidatos pendientes cuando sus regiones se cruzan con contenido.

La tolerancia geométrica es 0,05 px; para confirmar afectación se exige al menos 2 px² de intersección de tinta o pérdida por recorte. Son tolerancias técnicas para reducir ruido, no mínimos normativos ni prueba de la impresora física. Las intersecciones menores pueden quedar sin detectar.

## Límites explícitos

Transformaciones, filtros, clip-path, mezclas y opacidad parcial no se certifican. Tampoco se certifican textos cuyas métricas canvas/DOM difieren, elipsis o estilos tipográficos no soportados. El modelo de orden de pintura cubre el z-index de los elementos posicionados del renderer actual; no interpreta HTML arbitrario con contextos de apilamiento complejos. Las áreas no verificables se muestran pendientes, nunca como incumplimiento confirmado ni como aprobación global.

El informe corresponde a los datos de ese render. No acredita todas las posibles longitudes o cantidades de artículos. Si la paginación está pendiente se informa esa limitación y no se confirma un recorte por una altura de hoja no materializada.

No se modifican exportación Zureo, posiciones ni estilos del molde. No se amplía el bloqueo de impresión: la política existente sigue seleccionando fallos normativos, mientras estos nuevos resultados son técnicos. La integración de feedback en el lienzo y la ampliación de la política de bloqueo pertenecen a etapas posteriores. No hay correcciones con IA.

## Pruebas

Karma ejecuta medidas reales en Chrome: texto/texto, espacios y cajas grandes, decoración detrás y delante, clipping, recursos pendientes, texto dinámico multilínea, imágenes transparentes/opacas, tickets generados y paginación real del renderer. Los IDs repetidos en distintas hojas se distinguen por página y se conserva un conflicto en una hoja intermedia. También se comprueba la conversión al informe y la conservación de la política de impresión.
