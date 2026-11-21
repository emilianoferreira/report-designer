# Etapa 16 · Omisiones confirmadas del receptor

Esta página describe el comportamiento histórico. Para probar la política de impresión actual, usá la [demo de la etapa 18](fiscal-stage-18.md).

El diseñador y Vista Previa muestran **Omisión confirmada · informativa** cuando un campo obligatorio está ausente del HTML de un documento de una página con cobertura completa. El informe registra el fundamento, el campo afectado y la página. La evidencia de ausencia es el registro de cobertura de esa página.

## Alcance

- En e-Factura y sus notas, se usa la rama de comprador RUC resuelta por la etapa 14. Los campos habilitados son el rótulo, el RUC, el nombre y el domicilio.
- En e-Ticket y sus notas, se usa la rama ordinaria de consumo final. Documento y país se evalúan solo cuando la etapa 14 confirma la obligación por umbral o retenciones o percepciones. Al igualar el umbral, esos campos no son obligatorios por importe.
- Se exige una fecha de emisión conocida, una operación declarada sin exportación y una sola página verificada en la superficie del navegador. Un ticket identificado con número de documento pero sin tipo conocido queda pendiente de clasificación.
- El valor de origen o rótulo esperado debe ser conocido y el informe debe tener un único registro de cobertura completa para el campo y la página. Una discrepancia conserva su control existente. Una alternativa sin interpretar deja pendiente la cobertura, incluso si el valor aparece dentro de otro binding visible. Esa coincidencia no acredita el rol fiscal.
- Las excepciones, la adenda, la repetición entre páginas y las dimensiones del recuadro siguen sus controles actuales. La omisión de esta etapa es informativa para el botón Imprimir y se limita a la salida del navegador bajo el soporte declarado.

## Demo reproducible

1. Usá una copia de un molde de hoja. Dejá vacías las secciones con alturas que quepan en una página, y agregá al encabezado un campo de datos de 65 × 8 mm ligado a `fiscal.receiverDocumentNumber`, sin formato y con rol **Documento del receptor**. Seleccioná el tipo 111 en el perfil fiscal, o usá un molde sin perfil.
2. En **Validaciones**, importá el escenario sintético siguiente. En el grupo **Receptor** se esperan omisiones del nombre, domicilio y rótulo. El documento visible tiene su propio control de correspondencia.

```json
{
  "invoice": {},
  "company": {},
  "invoiceLines": [],
  "printSupport": { "kind": "blank" },
  "fiscal": {
    "schemaVersion": "1.0",
    "isCfe": true,
    "cfeType": 111,
    "issueDate": "2026-11-20",
    "finalConsumer": false,
    "exportOperation": false,
    "receiverNonResidentWithoutRut": false,
    "receiverSectorException": false,
    "professionalSecrecy": false,
    "receiverDocumentType": "RUC",
    "receiverDocumentNumber": "219876540012",
    "receiverName": "Taller del Sur",
    "receiverAddress": "Av. Italia 123"
  }
}
```

3. Retirá el campo de documento en la copia. La página 1 muestra una omisión adicional para el RUC. En **Vista Previa → Validación de impresión**, la tarjeta permite ir a la página. El botón **Imprimir** sigue habilitado por estos hallazgos.
4. Reimportá con `"printSupport": {"kind":"preprinted","pages":[{"page":1,"roles":["recipient.document"]}]}`. El documento queda pendiente por soporte preimpreso. Las otras omisiones siguen en el informe.
5. Para un ticket, cambiá el perfil a 101 y usá el mismo JSON con `cfeType: 101`, `finalConsumer: true`, `receiverDocumentType: "CI"`, `receiverCountry: "UY"`, `currency: "UYU"`, `uiValue: "6"`, `uiValueDate: "2025-12-31"`, `uiValueSource: "Escenario sintético"`, `hasWithholdingsOrPerceptions: false` y papel en blanco. Con `netAmount: "30000"` se espera solo el rótulo. Con `netAmount: "30000.01"` se agregan documento y país. En ambas variantes, usá un ticket vacío.

`receiver-omissions.spec.ts` reproduce con el renderer los casos presente, ausente y ambiguo de cada campo. `e2e/fiscal-profile/content-feedback.cjs` verifica el diagnóstico en Vista Previa y que la impresión se invoque con omisiones confirmadas.
