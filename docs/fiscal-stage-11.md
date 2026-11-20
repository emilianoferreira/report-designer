# Representación de importes moneda y signos

La etapa 11 verifica correspondencia entre campos fiscales conocidos y texto medido en la salida del navegador. Comprueba representación; no suma líneas, aplica tasas, calcula bases, concilia totales ni convierte monedas. Las referencias de la etapa 12 siguen pendientes.

## Organización

`amount-fiscal-rules.ts` separa `amountRequirements`, que describe campos y condiciones, de `evaluateAmountPrint`, que comprueba el artefacto impreso. El informe compartido `inspectFiscalPrint` incorpora sus hallazgos al feedback y a la política vigente de impresión. Cada hallazgo conserva campo, instancia, página, evidencia y estado independiente de la severidad.

Los totales de venta no se trasladan a e-Remitos o e-Resguardos. Los campos de cantidad y precio distinguen bienes, servicios y operación mixta por línea. Los importes informados de descuentos, recargos, ajustes, retenciones, crédito fiscal y tributos conservan su significado y su instancia. Cero es un valor válido.

`FiscalTax.kind` agrega una clasificación opcional del origen: IVA, retención, percepción u otro tributo. Nombre o tasa no asignan esta clasificación automáticamente. Los tickets conservan su alternativa de no discriminar IVA. La comprobación de menciones prohibidas se limita a nombres explícitos de IVA medidos y asociados a un tributo declarado como IVA en los regímenes pertinentes; no interpreta números aislados como menciones ni trata la constancia del pie como un tributo del cuerpo.

## Asociación con la salida

La comprobación exige un binding fiscal explícito e individual, rol compatible, identidad única y texto medido íntegro, sin recortes ni conflictos. Los textos idénticos en otros campos no satisfacen una obligación. Tampoco se vincula una línea histórica con `fiscal.lines` por compartir índice. Contenido compuesto, fórmulas no desglosadas, identificadores duplicados y recursos pendientes conservan estado pendiente.

Total del comprobante y total a pagar pueden compartir una única impresión solo si ambos valores conocidos son exactamente iguales y la evidencia identifica alguno de esos dos campos. Valores distintos o desconocidos impiden compartirla. Esto comprueba correspondencia de valores; no certifica que la etiqueta de un texto libre sea suficiente en todos los contextos.

La ausencia de contenido interpretable no demuestra una omisión. Una discrepancia se confirma sobre un campo explícito efectivamente impreso; los moldes antiguos sin semántica conservan compatibilidad y cobertura pendiente.

## Formatos moneda y signos

`FieldEvidence.numericFormat` registra los separadores, precisión y prefijo reales del renderer. No cambia el HTML visual ni acepta como efectivo un formato declarado que el renderer no utiliza. `comparePrintedAmount` compara cadenas decimales exactas con ese formato, incluyendo signo y cero. Si hace falta interpretar un redondeo, hay riesgo de pérdida de precisión por coma flotante o el formato no está soportado, se abstiene.

Un código de moneda explícito se compara con el origen. El prefijo monetario `US$` identifica USD en el formato actual; `$` queda ambiguo y nunca se transforma automáticamente en UYU. El control del prefijo monetario no se aplica a cantidades ni tasas.

El tipo nota de crédito no fuerza signos negativos. El indicador conocido 7 de un ítem se trata como no facturable negativo al comprobar su importe, sin invertirlo dos veces. Indicadores desconocidos o fuera del subconjunto interpretado quedan pendientes. Descuento o recargo no implica automáticamente un signo: ante igual magnitud con signo contrario, se conserva pendiente la interpretación de esa convención. Los indicadores especiales de ajustes globales requieren revisión; no se inventa la interpretación de D.7.

## Límites

Quedan pendientes las omisiones sin cobertura semántica completa, agrupaciones o sustituciones válidas de importes de ítems, identificación integral de tasas y tributos, porcentajes y formatos compuestos, redondeos de presentación no verificables, indicadores especiales de signos, y suficiencia normativa de etiquetas libres. La validación aritmética fiscal permanece fuera del alcance. Ninguna comprobación del navegador certifica la ejecución de Zureo ni la salida física de la impresora.

Fuentes: [Resolución DGI 798/2012 con modificativas, numeral 14](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012), [Formato CFE 25.2](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=) y [documentación funcional DGI sobre indicadores no facturables](https://www.efactura.dgi.gub.uy/frontend/afiledownload?3%2C1%2C110%2CO%2CS%2C0%2C24316%3BS%3B33%3B2733%2C=).

## Verificación

- 494 pruebas unitarias aprobadas en ChromeHeadless. Se agregaron 19 casos de representación, formatos, moneda, signos, ítems y tributos, identidades ambiguas, hojas, tickets, multipágina y compatibilidad histórica.
- Compilación de producción correcta, con los avisos CommonJS existentes de qrcode y jsbarcode.
- Regresión fiscal de navegador aprobada: guardado y recarga, bloqueo según contexto, superposición y recorte, escenarios JSON, Zureo y PDF multipágina.
- `git diff --check` correcto.

La primera ejecución de la regresión se interrumpió por disco lleno al guardar una captura. Se eliminó únicamente la caché regenerable `.angular/cache` del proyecto y la repetición finalizó correctamente.
