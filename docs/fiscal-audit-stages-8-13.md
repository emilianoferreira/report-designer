# Revisión de las etapas 8 a 13

La matriz de representación impresa pasa a la versión 1.1. El alcance sigue siendo el botón Imprimir del navegador para los ocho tipos de CFE soportados. La versión del molde y del contrato de datos sigue siendo 1.0.

## Problemas corregidos

| Área | Caso reproducido | Resultado después de la revisión |
| --- | --- | --- |
| Matriz y contexto | Un perfil de otra salida o versión podía recibir obligaciones o resultados del navegador. Dos listas de origen con una fila mal formada podían aportar partes de una misma referencia por índice. | El catálogo, la matriz y las reglas usan el mismo criterio de alcance. Si dos fuentes impiden establecer la correspondencia de sus filas, se suspende su cotejo. Con una sola fuente se conservan los campos hermanos válidos. |
| Receptor | El nombre del emisor con igual texto podía acreditar el del receptor. Una copia correcta ocultaba otra copia explícita con valor incorrecto. Dos rótulos candidatos podían llevar a medir el primer recuadro. | Se respeta el campo de origen y se informa cada copia identificable por página. Un recuadro ambiguo, un documento que solo cambia de puntuación y las operaciones particulares de consumo final con RUC quedan pendientes. |
| Importes | Un total erróneo podía aparecer también como error del total a pagar. Las menciones repetidas de IVA compartían identificador. Un tributo sin clasificar o un indicador mal formado podía originar conclusiones firmes. | Cada importe se atribuye a su campo. Un total correcto puede cubrir ambos conceptos cuando coinciden. Cada mención de IVA conserva su identidad y la condición sin resolver queda pendiente. El monto no facturable se verifica con el campo A.129 identificado. |
| Monedas y formatos | Cualquier cadena de tres letras se aceptaba como moneda. Un punto no declarado podía interpretarse como separador decimal. Un formato numérico sobre el número de un documento podía producir un fallo de referencia. | Se comparan los códigos explícitamente cubiertos por la tabla D, incluidas UYI y UYR. Los formatos ambiguos quedan pendientes. |
| Referencias | El origen podía declararse completo pese a una razón global o identificación individual ausente. Los campos monetarios de una global o de un e-Remito podían producir un bloqueo. Una fecha civil formateada en Uruguay podía retroceder un día. | Los datos incompletos, contradictorios y el F.8 negativo tienen diagnóstico propio. Los campos excluidos por modalidad o tipo dejan de originar fallos impresos. El renderer conserva el día civil en bindings fiscales de fecha sin hora. |
| Feedback e impresión | El contenido oculto de un descendiente entraba en la comparación del texto. Deshacer una edición antes de la actualización diferida podía dejar el botón con el mismo snapshot y sin contexto. | El cotejo escalar usa texto directo con evidencia medida. Otras composiciones quedan pendientes. Imprimir vuelve a preparar el contexto invalidado incluso cuando se recupera el mismo molde. |

Se contrastaron las excepciones de identificación y los precios de remitos con el numeral 14. La excepción expresa de precios para remitos de exportación se diferencia del tratamiento aún pendiente del tipo 181. Las exclusiones de referencias se contrastaron con la zona F, los códigos de moneda con la tabla D y el inicio histórico del umbral de e-Tickets con la tabla E. [Resolución DGI 798/2012](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012) · [Formato CFE 25.2](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=)

## Cómo seguir un hallazgo en el código

1. En `utils/fiscal-context.ts` se normalizan los hechos del comprobante. `fiscal-obligation-matrix.ts` y `fiscal-rule-catalogue.ts` determinan el alcance normativo.
2. El renderer registra el campo y su formato en el manifiesto. `printed-field-observations.ts` relaciona ese manifiesto con la página, el elemento y el texto medido. `fiscal-field-evidence.ts` compara valores representados.
3. `receiver-fiscal-rules.ts`, `amount-fiscal-rules.ts` y `reference-fiscal-rules.ts` producen los hallazgos. `inspectFiscalPrint`, en `rendered-fiscal-rules.ts`, los incorpora al informe de la salida actual.
4. `validation-feedback.ts` y `print-validation-policy.ts` alimentan el diseñador y la vista previa. Al imprimir, `preview.component.ts` inspecciona nuevamente su propio documento. La exportación Zureo usa el molde actual.

## Verificación

Pasaron las 552 pruebas de Angular en ChromeHeadless, incluidas 20 nuevas de esta revisión. La compilación de producción con `npm run build` terminó con los avisos CommonJS existentes de `jsbarcode` y `qrcode`.

Sobre esa compilación pasaron las dos regresiones Playwright con API simulada. `e2e/fiscal-profile/regression.cjs` cubre persistencia del molde, geometría, exportación y PDF multipágina. `e2e/fiscal-profile/content-feedback.cjs` cubre selección, bloqueo por campo, permiso ante pendientes y exportación Zureo durante un bloqueo del navegador.

## Controles pendientes

| Prioridad | Control | Evidencia que falta |
| --- | --- | --- |
| 1 | Confirmar omisiones reales en hojas, tickets y repeticiones multipágina | Inventario completo del contenido visible y preimpreso, incluidos moldes históricos, fórmulas, grupos y campos generados con varias fuentes. |
| 1 | Resolver identificación en operaciones particulares | Excepciones por sector, actividad que obliga a documentar a consumo final con RUC, identificación trasladada a adenda y su prioridad en cada página. |
| 1 | Certificar aplicabilidad y asociación integral de referencias | Justificación de la modalidad global, documentos sin codificación, operaciones especiales y composición en varios renglones o páginas. La existencia del original requiere cotejo externo. |
| 2 | Ampliar representación de importes | Signos especiales y convenciones de ajustes, montos agrupados por tasa, precios del remito, monedas fuera del subconjunto cubierto, redondeos y formatos compuestos. |
| 2 | Ampliar el alcance histórico y por familia | Tipos fuera de los ocho soportados, vigencias específicas por operación, procedencia de las cotizaciones e identidad registral del receptor. |
| 3 | Verificar salida física y Zureo | Altura física de caracteres, legibilidad después del escalado y salida efectiva de impresora. La ejecución del molde en Zureo requiere evidencia del propio motor. |

La revisión se limita a la representación de datos provistos. Los cálculos de impuestos, las conversiones y las correcciones con IA quedan fuera de este módulo.
