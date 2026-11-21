# Etapa 15 · Cobertura del receptor por campo y página

El informe del diseñador y de Vista Previa añade **Cobertura del receptor en el HTML de impresión**. Debajo aparecen los campos obligatorios y, cuando la rama está identificada, los campos pendientes de una condición o alternativa de la etapa 14. El informe presenta el resultado por página lógica del navegador. La cobertura se calcula aun cuando el molde carezca de un binding para ese campo.

## Cómo se obtiene la cobertura

El renderer mantiene su inventario de bindings como evidencia parcial. Después de preparar y paginar el iframe, `inspectReceiverCoverage` combina ese inventario con las observaciones de campos, la tinta medida y el contenido del DOM. El informe conserva el campo o rol, la página, el estado, los motivos pendientes y los identificadores de evidencia cuando hay contenido atribuible.

| Requisito verificable | Evidencia o motivo pendiente |
| --- | --- |
| Página inspeccionable | Iframe de impresión listo, recursos disponibles, superficie medible y secuencia de páginas resuelta. El contenido fuera de las páginas o estilos que puedan cambiar con el medio de impresión dejan pendiente la cobertura. |
| Campo interpretable | Binding escalar fiscal sin formato, identificable en el manifiesto y coincidente con el origen, o rótulo normativo con rol y tinta medidos. Un dato generado puede aportar la misma evidencia con un contrato explícito. |
| Alternativas descartadas o interpretadas | Texto libre, fórmulas, gráficos, contenido CSS —incluido el contenido añadido en márgenes de impresión—, elementos recortados y asociaciones sin resolver conservan pendientes los campos que podrían verse afectados. Un binding escalar de receptor sin valor resuelto afecta a su campo en las páginas donde aparece. Otros diagnósticos con elemento visible identificable se atribuyen a sus páginas. Si el renderer no puede localizar la alternativa, su efecto sigue pendiente en todas las páginas. |
| Soporte del escenario determinado | `{"kind":"blank"}` declara papel en blanco para el escenario. `{"kind":"preprinted","pages":[{"page":1,"roles":["recipient.document"]}]}` declara un inventario de aportes de esa página y deja pendiente el documento. Un inventario puede declarar `roles: []` en una página sin aportes al receptor. La falta de una página del inventario, una declaración mal formada o la ausencia de declaración conservan el soporte como desconocido. |

Una cobertura completa indica que se pudo interpretar la salida del navegador para ese campo y esa página bajo el soporte declarado. Puede tener cero identificadores de contenido. Un aporte preimpreso relevante conserva su motivo pendiente incluso si el HTML ya muestra el campo o si la página todavía no se pudo medir. La declaración del escenario no aporta evidencia física y el informe mantiene los estados de cumplimiento y la decisión de impresión de las etapas anteriores.

## Demo reproducible

1. Usá una copia descartable de un molde de hoja compatible con el tipo 111. En esa copia dejá vacías las secciones de encabezado, detalle y pie, con alturas que entren en una sola hoja. Importá desde **Validaciones** este escenario sintético.

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
    "receiverSectorException": false,
    "receiverNonResidentWithoutRut": false,
    "professionalSecrecy": false,
    "receiverDocumentType": "RUC",
    "receiverDocumentNumber": "219876540012"
  }
}
```

2. Abrí **Cobertura del receptor en el HTML de impresión**. Para **Documento del receptor** se espera cobertura completa en página 1. El cotejo del documento queda pendiente porque el molde vacío no aporta un valor visible.
3. Reimportá con `"printSupport": {"kind":"preprinted","pages":[{"page":1,"roles":["recipient.document"]}]}`. El documento queda con cobertura pendiente por el aporte preimpreso. Si retirás `printSupport`, el motivo cambia a soporte desconocido.
4. Volvé a declarar papel en blanco y agregá un texto libre con `219876540012`. La coincidencia sigue pendiente de asociación. Reemplazalo por un campo sin formato ligado a `fiscal.receiverDocumentNumber` con rol `recipient.document` para obtener cobertura completa y evidencia del binding.
5. Abrí **Vista Previa → Validación de impresión** y buscá la misma cobertura en el documento vigente. Estos cambios de cobertura no activan bloqueos.

Las pruebas de `receiver-page-coverage.spec.ts` reproducen los casos de cobertura con y sin binding usando el renderer. También muestran una primera página con contenido generado de asociación conocida y una segunda con contenido sin identificar.
