# Etapas 5 y 6: feedback, escenarios y ubicación

Estado histórico de estas etapas: la preparación compartida y la ampliación del bloqueo posterior están documentadas en `fiscal-stage-7.md`.

## Cómo usarlo

En Diseño, debajo de las herramientas, **Validaciones del diseño** permite elegir ejemplos históricos, ejemplos CFE ficticios o importar un archivo JSON con la estructura `InvoiceData`: objetos `invoice`, `company`, lista `invoiceLines` y datos fiscales opcionales en `fiscal`. El límite es 2 MB. Los datos se conservan únicamente en memoria durante la sesión y se comparten con Vista Previa. Cambiar escenario no modifica el molde, no crea historial ni activa Guardar.

Al modificar el molde se retiran inmediatamente los resultados anteriores. El análisis del diseño confirmado se prepara tras 300 ms sin cambios. Se usa un iframe medible fuera de pantalla, con recursos y paginación, y se descartan renders obsoletos. Durante arrastres y redimensionados se retiran los resultados y se suspende la inspección costosa: el análisis se reanuda al confirmar el movimiento, incluso si finalmente no cambia el molde.

Los elementos asociados a fallos aparecen con contorno rojo; las advertencias localizadas usan contorno discontinuo. Seleccionar desde el informe activa el elemento y lo desplaza a la vista. Para contenido automático se puede abrir su página en Vista Previa sin fabricar un ID editable. Los controles pendientes siguen accesibles en el desplegable del panel. Los contornos pertenecen exclusivamente al lienzo y no alteran el molde ni su impresión.

## Recorrido del código

- `ValidationSessionService`, provisto por la página del diseñador, coordina escenario, invalidación, preparación y resultados. Se destruye junto a la página y limpia su iframe y sus suscripciones.
- `DesignValidationComponent` presenta los resultados y carga archivos. `ElementRendererComponent` consume el informe para mostrar los contornos. La selección reutiliza `SelectionService`.
- `PreviewComponent` consulta los mismos datos; la evidencia y los bloqueos se calculan otra vez sobre su propio documento vigente. No se imprime usando un informe del iframe oculto.
- `evaluateFiscalPlacement` consume contexto, manifiesto geométrico y documento final. Sus hallazgos son independientes por página. El catálogo existente sigue mostrando pendientes las obligaciones no demostradas.

## Reglas de ubicación y límites

Se verifica que un código visible e identificado coincida con los seis caracteres del hash conocido y se encuentre debajo del QR medido. Un código incorrectamente posicionado solo genera incumplimiento si la evidencia es inequívoca. Roles ausentes, recursos no resueltos, superposiciones, ambigüedad entre varias instancias o datos contradictorios impiden esa conclusión.

El orden interno de identificación del emisor y del comprobante detecta inversiones verticales completas entre campos únicos cuyos roles y valores específicos fueron verificados. No decide por cajas ambiguas, elementos compuestos, campos desconocidos ni valores impresos idénticos; tampoco impone una sección física ni porcentajes de ubicación.

En el perfil fiscal se pueden declarar distribución convencional/secuencial y adenda en hoja separada, después del CFE o dentro del cuerpo. Son propiedades opcionales; abrir un molde antiguo no las crea. La declaración no demuestra que las condiciones normativas de una alternativa se cumplan. Una discrepancia que pudiera admitir otra alternativa permanece pendiente.

La separación de 5 mm de una adenda dentro del cuerpo se confirma únicamente con un recuadro rectangular con borde visible identificado por `adenda.boundary`, rótulo ADENDA verificado, contenido de adenda contenido en el recuadro y datos fiscales cuyo texto coincide con hechos conocidos. Se requiere además pie fiscal verificado por debajo, para excluir las otras ubicaciones. La medida usa tinta en las bandas horizontal/vertical; casos diagonales o no identificados no se declaran incumplimientos.

No se inventan porcentajes para ángulos superior/inferior ni se exige una sección física a cada zona lógica. Rango de CAE, distribución general, delimitación completa, alturas de caracteres, excepciones y preimpresión conservan controles pendientes cuando no hay evidencia suficiente. Las fuentes son Formato CFE 25.2, pp. 79–84, enlazadas en cada hallazgo normativo.

Multipágina produce un control por hoja de identificación, numeración y sello. Una falta de roles no equivale a omisión fiscal. La aprobación integral requiere todavía comprobar todos los valores y excepciones; se informa pendiente. Un único QR de pie ahora se repite junto con los elementos declarados `security.code`; no se deduce ese rol por texto. Grupos, secciones repetidas no soportadas y filas que no caben mantienen el motivo de paginación pendiente.

## Compatibilidad y pruebas

No hay endpoints ni migraciones. Los escenarios no se guardan. Las nuevas declaraciones del perfil usan el guardado y deshacer/rehacer existentes. No se cambia Zureo, no se amplía la política de bloqueo de impresión de la etapa 7 y no hay correcciones automáticas con IA.

Pruebas unitarias: contratos JSON, invalidación inmediata, debounce y descarte de resultados obsoletos; código QR con ubicación válida/inválida; hechos contradictorios; hallazgos individuales por página; margen de adenda solo con evidencia suficiente; repetición de QR y código sin modificar el molde. La regresión de navegador recorre resaltado, selección, JSON inválido/válido, escenario compartido y conservación del estado Guardar, además de la impresión y el PDF multipágina existentes.
