# Etapa 17 · Excepciones, adenda y repetición del receptor

Esta página describe el comportamiento histórico. La política vigente de impresión se prueba con la [demo de la etapa 18](fiscal-stage-18.md).

El informe del navegador reutiliza la decisión normativa del receptor, el inventario de cobertura y las páginas preparadas. Las omisiones que se confirman en esta etapa siguen siendo informativas. El cotejo de otros incumplimientos conserva su política de impresión.

## Qué evalúa

| Caso | Evidencia evaluada |
| --- | --- |
| Entidad no residente sin RUT | Se comprueba en una misma hoja el nombre y domicilio o el rótulo y el recuadro medido. Una composición incompleta conserva pendiente la alternativa. El documento y país se evalúan por separado cuando los exige el ordinal 12. |
| Exportación de servicios en e-Ticket y e-Resguardo de retención o percepción | Las ramas ya resueltas verifican nombre y domicilio, o nombre y documento del retenido, respectivamente. Se exige cobertura completa para confirmar una ausencia. Los créditos fiscales, tipos de exportación fuera del catálogo, excepciones sectoriales sin fundamento identificado y consumo final con RUC conservan su revisión específica. |
| Secreto profesional y adenda | Se comprueban los datos de identificación juntos en la cabecera o dentro de un recuadro de adenda asociado y medido. La adenda debe tener su rótulo primero y los datos del receptor antes del contenido libre. En el cuerpo se comprueba separación de 5 mm de los bordes y de otros datos medibles. En hoja separada se exige distinguir esa hoja del CFE. |
| CFE de varias hojas | El navegador debe entregar una secuencia verificable de hojas del CFE. Se evalúan individualmente los campos con obligación de repetición resuelta, como nombre y RUC del comprador o documento y país del receptor de un e-Ticket cuando corresponde. Si falta un campo y hay cobertura completa en una única hoja de la secuencia, el hallazgo se localiza en esa hoja. |

Quedan pendientes la adenda posterior al CFE cuando la salida no permite identificar su límite, la altura física de los caracteres, la precedencia no interpretable y la combinación de secreto profesional con repetición por hoja. El renderer actual puede producir hojas continuadas de un CFE. La variante de adenda en hoja separada está cubierta por una prueba de inspección con una salida construida para el caso.

[Resolución DGI 798/012, numerales 13.J y 14](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012) · [Resolución DGI 2886/014, numeral 5](https://www.impo.com.uy/bases/resoluciones-dgi-nd/2886-2014) · [Resolución DGI 1264/023, numeral 3](https://www.impo.com.uy/bases/resoluciones-dgi/1264-2023/3) · [Formato CFE 25.2, representación impresa](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=)

## Fundamentos revisados y criterios de inspección

| Decisión | Fundamento y alcance |
| --- | --- |
| Entidad no residente sin RUT | Desde la publicación del 23/08/2014, la opción de consignar nombre y domicilio sustituye el ordinal 11. El ordinal 12 conserva sus condiciones. Los hechos sobre residencia, tipo de entidad y operación deben estar resueltos. [2886/014, numerales 1, 4 y 5](https://www.impo.com.uy/bases/resoluciones-dgi-nd/2886-2014) |
| Exportación y e-Resguardo | Desde la misma publicación, la excepción de exportación exige nombre y domicilio. La rama automatizada cubre exportaciones de servicios con e-Ticket. La excepción del e-Resguardo exige nombre y documento para retenciones o percepciones a personas físicas y entidades del exterior. El crédito fiscal es un uso adicional del e-Resguardo desde el 01/08/2024. El crédito informado junto con retenciones o evidencia contradictoria conserva pendiente la modalidad. [2886/014, numerales 2 y 5](https://www.impo.com.uy/bases/resoluciones-dgi-nd/2886-2014) · [798/012, numeral 1.h y numeral 14](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012) |
| Secreto profesional | La excepción de 2019 permite trasladar la identificación del encabezado a la adenda cuando se acredita el supuesto de secreto profesional. Para revisar delimitación y precedencia en el navegador se aplica el texto publicado el 06/07/2023. En emisiones anteriores a esa publicación queda pendiente esa verificación histórica. La inspección usa valores vinculados al origen dentro del recuadro y exige evidencia vinculada del CFE para distinguir ambas composiciones. También excluye como evidencia del encabezado los campos que caen dentro del recuadro aunque carezcan de rol de adenda. [780/019, numerales 1 y 2](https://www.impo.com.uy/bases/resoluciones-dgi-originales/780-2019?tipoServicio=11) · [1264/023, numeral 3](https://www.impo.com.uy/bases/resoluciones-dgi/1264-2023/3) |
| Repetición por hoja | El alcance toma el inciso publicado el 21/11/2012. Se exige numeración única, visible y medible en cada hoja y se conserva pendiente la secuencia que no permite distinguir una hoja de adenda. En e-Factura con RUC de comprador se controla nombre y RUC. En e-Ticket se controla documento y país si la obligación ya está resuelta. El domicilio o el recuadro del comprador se revisan a nivel del documento. [2719/012, numeral 6](https://www.impo.com.uy/diariooficial/2012/11/21/documentos.pdf) · [798/012, numeral 14](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012) |
| e-Ticket con RUC o tipo de documento sin confirmar | El código A-C60 `2` y las variantes textuales RUC y RUT identifican el supuesto especial. La obligación de envío del numeral 20 no resuelve por sí sola la impresión del receptor. En una secuencia de e-Ticket con número de documento conocido y tipo sin confirmar, la repetición queda pendiente. [Formato CFE 25.2, campo A-C60, p. 32](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=) · [798/012, numeral 20.b](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012) |

## Demostración reproducible

### Excepción en el diseñador

Usá el JSON de la [demo de la etapa 16](fiscal-stage-16.md). Cambiá al tipo 101 en el escenario y perfil, declarando `finalConsumer: true`, `receiverNonResidentWithoutRut: true`, `receiverIsIndividual: false` y un tipo de documento distinto de RUC. Mantené una fecha de emisión reciente y `exportOperation: false`. En un molde de una página, agregá dos bindings sin formato para `fiscal.receiverName` y `fiscal.receiverAddress`, con sus roles de receptor. Abrí **Validaciones → Receptor**. La alternativa se verifica al encontrar ambos datos en la hoja. Al quitar solo el domicilio, la composición conserva el estado pendiente.

### Adenda y tres hojas

Las pruebas funcionales de [receiver-omissions.spec.ts](../src/app/features/template-designer/utils/receiver-omissions.spec.ts) escriben la salida del renderer en un iframe real. Para reproducirlas en Windows:

```powershell
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --include="src/app/features/template-designer/utils/receiver-omissions.spec.ts"
```

- **Adenda.** El escenario coloca el rótulo y los datos del receptor dentro de un rectángulo en el detalle, antes de una nota libre. Comprueba la alternativa de hoja separada y desplaza la nota antes de los datos para observar el resultado pendiente. También prueba una serie literal con rol fiscal, valores dentro de un recuadro en la cabecera y una adenda ordinaria que contiene un valor discrepante.
- **Tres hojas.** La prueba construye una secuencia numerada e inspeccionable con los datos de comprador y quita solo el RUC en la segunda hoja. Se espera una sola omisión informativa en la página 2. El país preimpreso, una etiqueta oculta o duplicada y una hoja numerada con solo adenda tienen pruebas de resultado pendiente e impresión permitida.
- **Botón Imprimir.** Después de compilar, ejecutá `node e2e/fiscal-profile/content-feedback.cjs`. El caso de secreto profesional sin ubicación resuelta comprueba que el botón invoque la impresión del navegador.
