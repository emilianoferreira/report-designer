# Etapa 2: reglas estáticas y resultados

El diseñador incorpora la pestaña **Análisis fiscal**. El resultado se recalcula
al modificar el molde y no se persiste. Puede filtrarse por Cumple, Incumple,
Pendiente o No aplica. Cada resultado incluye identificación del catálogo,
explicación, próximo paso y fuente. Los diagnósticos técnicos se identifican aparte.
Los hallazgos con un elemento asociado permiten volver al diseño y seleccionarlo.

El motor es una función TypeScript pura (`evaluateStaticFiscalRules`). Recibe
el molde y el contexto de etapa 1; devuelve un informe versionado con alcance
`static-browser` y catálogo `stage-0.2`. No ejecuta expresiones del molde ni carga
recursos externos. La interfaz analiza el diseño sin aportar un comprobante de
ejemplo: el perfil es el contexto declarado para las dimensiones del soporte.

## Decisiones automáticas disponibles

- PAP-01: hoja entre 150 × 57 y 356 × 216 mm, en ambas orientaciones.
- PAP-02: ancho de rollo mínimo de 57 mm, sin límite de longitud inventado.
- Datos contradictorios, perfil ausente o incompatible, soporte desconocido y
  dimensiones inválidas impiden decidir esos requisitos: quedan pendientes.
- Identificadores ausentes o duplicados generan problemas técnicos localizables.
- La consistencia del contexto se informa sin convertir los datos ausentes en hechos.

La evaluación geométrica compara las dimensiones declaradas; no certifica la
medida física final. El soporte que no corresponde al perfil queda en No aplica.
Los hallazgos confirmados tienen precedencia sobre la cobertura incompleta en
el resumen. No se usa porcentaje ni se presenta una certificación global.

## Cobertura pendiente explícita

El registro incluye LEG, DIS, ID, REC, REG, CON, REF, QR, PIE, ADE, EXC, EXT y
los diagnósticos TEC/COB del catálogo. CON-05 contiene sus once subreglas y REF-03
sus ocho subreglas, con las condiciones y abstenciones acordadas. Permanecen
pendientes cuando necesitan datos de operación, evidencia impresa o revisión manual.

No se deduce una omisión por ausencia de roles: el renderer también genera
contenido automático y un elemento puede contener varios datos. Tampoco se
acepta un rol como prueba de contenido correcto. Altura real de caracteres,
interlineado, un quinto del logo y las agregaciones ambiguas mantienen la
revisión manual acordada. No se interpola el margen del QR.

Esta etapa no inspecciona HTML/DOM, recursos resueltos, paginación ni salida
impresa; no agrega bloqueo de impresión ni cambia guardar/exportar. No agrega
reglas desde texto generado por IA ni nuevas interpretaciones legales.

## Verificación

Las pruebas cubren límites exactos de hoja/rollo, rotación, contexto incompleto,
valores inválidos, conservación del molde, subreglas presentes, abstenciones,
distinción técnica/normativa y edición/filtros/navegación del panel.

```powershell
npm run build
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless --reporters=dots
node e2e/fiscal-profile/regression.cjs
```
