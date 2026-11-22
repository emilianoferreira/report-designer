# Validaciones de referencias individuales y globales

La etapa 12 comprueba la representación impresa de cada referencia conservando su instancia, sus campos y su página. Se integra al informe compartido del diseñador y de impresión; los pendientes y los problemas del origen conservan su tratamiento independiente. Las reglas no hacen cálculos fiscales ni consultas a DGI.

## Contratos y organización

`referenceRequirements` describe las condiciones y los diagnósticos del origen. `evaluateReferencePrint` comprueba valores visibles mediante `observePrintedFields`, compartido también por importes. Este observador exige binding individual, identidad única y todos los fragmentos de texto medidos sin recortes ni conflictos. No asigna significados por coincidencias de texto.

Las rutas `references.0.*` y `references.1.*` son instancias distintas aunque sus textos o números coincidan. No se reconcilian colecciones contradictorias, se eliminan duplicados ni se vinculan filas históricas por posición. Una lista ausente, una lista vacía y una lista sin declaración de completitud conservan significados diferentes.

Los contratos agregan propiedades opcionales: `FiscalData.referencesComplete` registra la declaración de completitud del origen, y `FiscalReference.cfeTypeName` permite suministrar un nombre imprimible sin cambiar el renderer. El nombre se contrasta con el código soportado antes de utilizarlo. El rol `reference.description` identifica contenido suministrado para documentos sin codificación; no demuestra que su descripción sea normativamente suficiente.

## Obligatoriedad y modalidades

Se identifica necesidad de referencias en las notas soportadas, cobranza propia declarada y ajustes de remitos o resguardos con indicadores explícitos. Los demás supuestos conservan revisión por operación. Una lista vacía en el origen no demuestra que el molde haya omitido información.

La modalidad individual requiere tipo en palabras, serie y número asociados. La global comprueba la razón y excluye identificación individual y fecha. Modalidad ausente, identidad de origen duplicada, nombre contrario al código o indicador global con datos individuales conservan pendientes por contradicción. No se utiliza el indicador global como solución a exceder el límite de referencias.

Se diagnostica el límite de 40 sobre la colección recibida del origen, nunca sobre la cantidad de repeticiones que aparecen en varias páginas. Más de 40, referencias duplicadas o incompletitud son diagnósticos técnicos de datos y no se convierten en bloqueos por impresión. La suficiencia y elegibilidad de una referencia global requieren evidencia adicional.

## Comparación y asociación

Cada campo recibe hallazgos individuales. Razón, serie, número, fecha, importe, moneda y descripción se comparan exclusivamente con su propia referencia. Los campos opcionales no informados en una colección completa no se exigen por ausencia. Un número con ceros iniciales se admite como la misma numeración digital cuando ambos valores son únicamente dígitos.

Los nombres de los ocho tipos soportados se contrastan como texto. Un código numérico solo no acredita el requisito de tipo en palabras. Tipos fuera de ese mapa, incluidos códigos de contingencia sin traducción documentada, quedan pendientes. Las diferencias inequívocas entre nombres de tipos soportados pueden confirmarse como discrepancias; abreviaturas y nombres no interpretables requieren revisión.

Las fechas se comparan con formato explícito ISO o día/mes/año. Las diferencias con un origen que incluye hora quedan pendientes si pueden depender de zona horaria. Los importes utilizan el comparador decimal de representación: cero es un valor y no se exige que un importe parcial sea igual al total del documento original. La moneda es la de la referencia, no la del CFE actual. No se convierten importes ni se aplican tipos de cambio.

La asociación individual se confirma en el subconjunto donde tipo, serie y número coinciden con el origen, están medidos en un mismo renglón y no aparecen otras referencias intercaladas. Composiciones verticales o repartidas entre páginas conservan pendientes de asociación, sin rechazarse por su disposición. La razón global se acredita como texto íntegro asociado, conservando pendiente su suficiencia normativa.

El antiguo control de razón única basado en texto coincidente conserva su identificador pero permanece pendiente de cobertura integral. Las nuevas comprobaciones por instancia se informan en `REF-FIELD`; encontrar el mismo texto sin vínculo al campo no produce una aprobación.

## Compatibilidad y límites

La evidencia agrega `dateFormat` para los dos formatos de fecha interpretados, sin cambiar posiciones, estilos, valores ni formato visual de los moldes. Preview y exportación Zureo conservan su comportamiento. Las discrepancias confirmadas sobre campos explícitos participan de la política vigente de impresión; los diagnósticos técnicos del origen no bloquean.

Permanecen pendientes la existencia y aceptación del documento referenciado en DGI, la concordancia con sus datos registrales reales, la elegibilidad de referencias globales, la suficiencia de documentos sin codificación, formatos compuestos o abreviados, agrupaciones alternativas, omisiones sin cobertura semántica completa y certificación integral de la colección impresa. El resultado del navegador no certifica Zureo.

Fuentes: [Formato CFE 25.2](https://www.efactura.dgi.gub.uy/files/formato_cfe_v25-2-pdf?es=), zona F y representación impresa; [Preguntas frecuentes DGI, apartado 4.8](https://www.efactura.dgi.gub.uy/frontend/afiledownload?3%2C1%2C110%2CO%2CS%2C0%2C24316%3BS%3B49%3B2733%2C=); [Resolución DGI 798/2012 con modificativas](https://www.impo.com.uy/bases/resoluciones-dgi-interes-general/798-2012).

## Verificación

- 518 pruebas unitarias aprobadas en ChromeHeadless, incluidas 24 nuevas de referencias: modalidad, necesidad, límite 40/41, datos vacíos o contradictorios, textos idénticos, asociaciones intercaladas, fechas, importes, moneda original, contenido generado, documentos sin codificación, hojas, tickets, multipágina e impresión.
- Compilación de producción correcta; permanecen los avisos CommonJS existentes de qrcode y jsbarcode.
- Regresión fiscal de navegador aprobada: guardado y recarga, bloqueo según contexto, superposición y recorte, escenarios JSON, exportación Zureo y PDF multipágina.
- `git diff --check` correcto.
