# Etapa 18 · Validación del receptor antes de imprimir

El diseñador y Vista Previa muestran el campo obligatorio, la modalidad evaluada, el fundamento, la página y la cobertura de la salida del navegador. Una misma obligación puede producir un hallazgo por cada hoja exigible. La tarjeta lleva a la página donde falta el dato.

Al pulsar **Imprimir**, el diseñador comprueba que el molde, el escenario y el documento de Vista Previa correspondan a la preparación vigente. Inspecciona de nuevo esa salida antes de invocar la impresión. Una omisión bloquea cuando la obligación y la ubicación están resueltas, se conoce el valor o rótulo esperado y la inspección del campo en esa página tiene cobertura completa y sin evidencia del dato. El informe enumera los hallazgos que provocaron el bloqueo.

El soporte preimpreso relevante, las excepciones todavía sin resolver y el contenido sin interpretación conservan el estado pendiente. Si las hojas cambian de cantidad, orden o identidad desde la preparación, la cobertura queda pendiente hasta preparar la nueva secuencia. La política sigue aplicando los controles confirmados de etapas anteriores. **HTML z-code** exporta las directivas para Zureo con su flujo independiente.

## Demo en el diseñador

1. Abrí una copia de un molde que quepa en una página y dejá las tres secciones sin elementos. Usá un perfil de e-Ticket o un molde sin perfil. Importá este escenario en **Validaciones**.

```json
{
  "invoice": {},
  "company": {},
  "invoiceLines": [],
  "printSupport": { "kind": "blank" },
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
    "netAmount": "100",
    "currency": "UYU",
    "uiValue": "6",
    "uiValueDate": "2025-12-31",
    "uiValueSource": "Escenario sintético"
  }
}
```

2. Abrí **Vista Previa → Imprimir**. El rótulo **CONSUMO FINAL** falta en la página 1 y bloquea la impresión del navegador. En la tarjeta del receptor se muestra la cobertura completa del HTML. Probá descargar **HTML z-code** con el bloqueo activo.
3. Volvé a **Diseño** y agregá un texto visible que diga **CONSUMO FINAL**, con el rol fiscal **RUC COMPRADOR / CONSUMO FINAL**. Volvé a **Vista Previa** y pulsá **Imprimir**. La omisión del rótulo desaparece tras la nueva inspección.
4. Retirá ese texto y volvé a importar el mismo escenario con `"printSupport": {"kind":"preprinted","pages":[{"page":1,"roles":["recipient.label"]}]}`. En **Cobertura del receptor** aparece el aporte preimpreso pendiente de inspeccionar. El navegador permite imprimir.

## Regresión automatizada

```powershell
npm run build
node e2e/fiscal-profile/content-feedback.cjs
node e2e/fiscal-profile/regression.cjs
```

La primera regresión cambia el HTML vigente después de preparar Vista Previa y compara byte a byte la descarga de Zureo antes y durante el bloqueo. Comprueba que se pueda imprimir con contenido generado fuera de las páginas, con una hoja reemplazada, con un preimpreso relevante o con una excepción de secreto profesional pendiente. Al restaurar la hoja original y retirar el contenido alternativo, vuelve a confirmar la omisión. Las pruebas del inspector cubren también una omisión en una hoja intermedia y un informe desactualizado.
