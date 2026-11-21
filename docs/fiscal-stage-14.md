# Etapa 14 · Obligaciones del receptor

La matriz impresa 1.2 usa `receiverRequirements` para decidir las obligaciones del receptor. El evaluador recibe un `ValidationContext` normalizado y devuelve una rama y un resultado por campo, con estado, valor esperado, fundamento, hechos con procedencia, ubicaciones admitidas y alcance de repetición. El catálogo `REC-01.identity` resume los tres campos de identificación del comprador. El informe expone el resultado detallado en `receiverObligations` y el feedback de receptor muestra la decisión y el apartado normativo del control.

Un campo puede ser obligatorio aunque su valor de origen sea desconocido. En ese caso el cotejo queda pendiente. Una ubicación como `receiver-zone` describe una zona normativa de la representación y no una sección física del molde. El alcance por hoja que devuelve el evaluador es una obligación, todavía sin detección de omisiones.

## Ramas y fuentes

| Operación resuelta | Decisión |
| --- | --- |
| Comprador RUC en e-Factura, sus notas, e-Remito o e-Resguardo | Rótulo, recuadro, RUC, nombre y domicilio según 14º.8–10. Para varias hojas, repetir nombre y RUC. |
| e-Ticket y notas a consumo final ordinario | Rótulo y recuadro por 14º.11. Documento y país por 14º.12 si hay retenciones o percepciones o si el neto provisto supera el límite. Cuando corresponde identificar al receptor en varias hojas, repetir documento y país. |
| Entidad no residente sin RUT en e-Ticket y notas | Rótulo y recuadro, o nombre y domicilio, conforme al inciso de no residentes. El grupo se declara como alternativa y sus componentes quedan pendientes de evaluación conjunta. Documento y país conservan la condición independiente del ordinal 12. |
| Consumo final con RUC en e-Ticket y notas | Pendiente de identificar las reglas impresas de la operación particular. El numeral 20º regula el envío. |
| Exportación de servicios documentada a consumo final mediante e-Ticket y notas | Nombre y domicilio. Aplica la excepción a) del numeral 14º. Una bandera de exportación sin el tipo de operación queda pendiente. Los tipos específicos de exportación requieren ampliar el catálogo de CFE. |
| e-Resguardo de retención o percepción a persona física o entidad del exterior | Nombre y documento según excepción b). Un crédito fiscal sin retención o percepción no activa esta rama. |
| Secreto profesional | La alternativa de zona de identificación o adenda usa el texto cubierto desde la publicación de la Resolución 780/019, el 20 de marzo de 2019. Desde el 6 de julio de 2023 se cita la modificativa 1264/023 para la adenda. Una condición desconocida o una fecha fuera del período cubierto deja pendientes la ubicación y el cotejo impreso. La obligación del dato conserva su estado propio. |

La comparación de umbral usa el neto UYU y la cotización UI ya informados. Para tickets, la tabla E comienza el 8 de mayo de 2012. El límite pasa de 10.000 a 5.000 UI el 1 de noviembre de 2022. Igualar el límite no alcanza. El país emisor del documento se toma del origen.

La revisión usa el 23 de agosto de 2014, fecha de publicación de la Resolución 2886/014, como inicio del período cubierto para el supuesto de retenciones o percepciones independiente del umbral y para las excepciones de no residentes, exportación de servicios y retenidos. La comparación histórica del umbral puede resolver la obligatoriedad antes de esa fecha. La ubicación histórica del ordinal 12 queda pendiente. Para afirmar repetición por hoja se exige una fecha dentro del período cubierto desde la publicación de la Resolución 2719/012 el 21 de noviembre de 2012. La combinación de repetición y secreto profesional sigue pendiente.

[Resolución DGI 798/012, numerales 1, 13.J, 14 y 20](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012) · [Formato CFE 25.2, representación impresa y tabla E](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=) · [Resolución 2886/014, numerales 1, 2, 4 y 5](https://www.impo.com.uy/bases/resoluciones-dgi-nd/2886-2014) · [Resolución 2719/012, numeral 6](https://www.impo.com.uy/diariooficial/2012/11/21/documentos.pdf) · [Resolución 531/022, numeral 1](https://www.impo.com.uy/bases/resoluciones-dgi/531-2022/1) · [Resolución 780/019](https://www.impo.com.uy/bases/resoluciones-dgi-originales/780-2019?tipoServicio=11) · [Resolución 1264/023, numeral 3](https://www.impo.com.uy/bases/resoluciones-dgi/1264-2023/3)

## Demostración en el diseñador

En un molde de ticket con perfil CFE 101, importá este escenario JSON desde **Validaciones** y abrí **Receptor**. Los valores son sintéticos. Para observar el cotejo del documento, el molde puede incluir un campo ligado a `fiscal.receiverDocumentNumber` con rol `recipient.document`.

```json
{
  "invoice": {},
  "company": {},
  "invoiceLines": [],
  "fiscal": {
    "schemaVersion": "1.0",
    "isCfe": true,
    "cfeType": 101,
    "issueDate": "2026-11-20",
    "finalConsumer": true,
    "exportOperation": false,
    "receiverNonResidentWithoutRut": false,
    "receiverSectorException": false,
    "professionalSecrecy": false,
    "hasWithholdingsOrPerceptions": false,
    "receiverDocumentType": "CI",
    "receiverDocumentNumber": "12345678",
    "receiverCountry": "UY",
    "currency": "UYU",
    "netAmount": "30000",
    "uiValue": "6",
    "uiValueDate": "2025-12-31",
    "uiValueSource": "Escenario sintético"
  }
}
```

1. Con `netAmount: "30000"`, el umbral no se supera y documento y país son opcionales.
2. Reimportá con `netAmount: "30000.01"`. Documento y país pasan a ser obligatorios. En un molde sin esos campos, el informe conserva la correspondencia pendiente.
3. Volvé a `"30000"`, activá `hasWithholdingsOrPerceptions` y quitá `uiValue`. Documento y país siguen siendo obligatorios, con la comparación del umbral pendiente.
4. Cambiá `receiverDocumentType` a `"RUC"`. El caso queda pendiente por la modalidad particular del ticket. Para comparar con un comprador RUC, usá un molde con perfil 111 o sin perfil y cambiá `cfeType` a 111 y `finalConsumer` a `false`. El rótulo, el RUC, el nombre y el domicilio pasan a ser obligaciones del comprador.
5. En el escenario 111, activá `professionalSecrecy`. El contrato registra cabecera y adenda. La verificación de delimitación, precedencia y repetición sigue pendiente.

Las pruebas del receptor y de la matriz ejecutan estos mismos criterios sobre el evaluador y el informe. La evaluación integral de alternativas, las excepciones sectoriales específicas, tipos fuera del catálogo y la cobertura para confirmar ausencias quedan pendientes de revisión en sus etapas correspondientes.
