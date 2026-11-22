# Validaciones de identificación del receptor

La etapa 10 resuelve condiciones de identificación y comprueba valores efectivamente impresos por el navegador. Mantiene los moldes históricos y la política de bloqueo: solo incumplimientos confirmados sobre el artefacto vigente. Los controles de importes y referencias de las etapas 11 y 12 siguen pendientes.

## Aplicabilidad

`receiverRequirements` distingue contribuyentes identificados por RUC, consumo final, exportación, entidades no residentes sin RUT y e-Resguardos por retenciones o percepciones. Las alternativas exigen hechos explícitos: no se deducen del país, de una leyenda ni del perfil del molde. La identificación de un comprador con RUC no se elimina por declarar exportación. Los e-Resguardos por créditos fiscales no reciben automáticamente las excepciones del retenido.

`receiverSectorException` es un dato opcional del documento. `false` declara que no existe una excepción particular de identificación que requiera revisión; `true` o ausencia conservan pendiente esa revisión. Los adaptadores históricos no reciben valores por defecto. Secreto profesional desconocido conserva pendientes las obligaciones; cuando está declarado, se permite encontrar los valores en cabecera o adenda y se mantiene pendiente la verificación integral de su ubicación.

## Umbrales

`receiverThreshold` compara el neto provisto en UYU con el límite en UI. La comparación usa enteros escalados exactos y es estricta: igualar el límite no lo supera. Distingue 10.000 UI y la transición a 5.000 UI desde el 1 de noviembre de 2022. Exige fecha del comprobante, cotización UI positiva del cierre del año civil anterior y procedencia explícita. Fechas anteriores al período cubierto, netos negativos, monedas diferentes, datos contradictorios y cotizaciones incompletas quedan pendientes. No convierte monedas ni calcula bases imponibles; tampoco consulta cotizaciones externas.

Las retenciones o percepciones conocidas activan la exigencia de documento y país aun si la comparación del umbral permanece pendiente. El resultado positivo de la comparación solo acredita esa comparación; no certifica el cálculo del neto ni la autenticidad de la cotización.

## Evidencia y bloqueo

`evaluateReceiverPrint` emite resultados por campo y página con identidades individuales. Para aprobar correspondencia exige rol, valor conocido coincidente y texto medido sin recortes, conflictos ni fragmentos no verificables del mismo elemento. Texto idéntico sin semántica no acredita identidad.

Una discrepancia se confirma únicamente con un binding fiscal explícito, único, individual y sin formato, un valor de origen conocido, salida medible y ausencia de ambigüedades. `FieldEvidence.presentation` distingue bindings sin formato de los formateados. Máscaras, compuestos, alternativas no interpretadas y falta de cobertura completa producen pendientes. La ausencia de roles o la falta de un valor en el origen nunca demuestran una omisión impresa.

El rol opcional `recipient.boundary` permite asociar un recuadro. El control exige borde rectangular opaco medido, rótulo correcto dentro y documento en renglón siguiente cuando corresponde RUC COMPRADOR. Compara 40 × 10 mm y se abstiene ante múltiples recuadros posibles, incluidos los no etiquetados. La altura física de caracteres sigue pendiente; no se deduce de puntos CSS. Ningún control modifica el molde.

La integración se realiza en `inspectFiscalPrint`, por lo que utiliza el mismo informe para feedback e impresión. Los fallos confirmados de campos y recuadros participan de la política existente; pendientes y diagnósticos de datos no bloquean. La exportación y ejecución de Zureo conservan su alcance independiente.

## Cobertura pendiente

Permanecen pendientes las excepciones sectoriales concretas, códigos de documento sin mapeo normativo documentado, cotejo registral y dígitos verificadores, autenticidad de cotizaciones, conversiones de moneda, períodos históricos no cubiertos, omisiones cuando la salida no tiene cobertura semántica completa, formatos compuestos o enmascarados, alturas físicas y certificación integral de adenda y multipágina. Los campos opcionales no se presentan como incumplimientos por ausencia.

Fuentes: [Resolución DGI 798/2012 con modificativas, numeral 14 y condiciones asociadas](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012) y [Formato CFE 25.2](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=).

## Verificación

- 475 pruebas unitarias aprobadas en ChromeHeadless: umbrales exactos e históricos, retenciones, excepciones, datos desconocidos y contradictorios, máscaras y formatos, recuadros alternativos, moldes sin roles, renderer de hojas y tickets, identidad por página y bloqueo por fallo confirmado.
- Compilación de producción correcta; permanecen avisos CommonJS existentes de qrcode y jsbarcode.
- Regresión fiscal de navegador aprobada: guardado y recarga, política de impresión, superposición y recorte, JSON, Zureo y PDF multipágina.
- `git diff --check` correcto.
