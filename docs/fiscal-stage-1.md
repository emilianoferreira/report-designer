# Etapa 1: perfil, datos y roles fiscales

Implementa los contratos y la edición del contexto acordados al cerrar la etapa 0.
No contiene reglas normativas, resultados de cumplimiento, inspección del documento
renderizado ni bloqueo de impresión.

## Uso en el diseñador

- **Perfil fiscal**: configuración opcional del tipo CFE, régimen, operación,
  soporte y papel preimpreso. Todos comienzan sin definir. El perfil se guarda
  con el botón Guardar habitual y admite deshacer/rehacer.
- **Diseño → seleccionar elemento → Datos → Roles fiscales**: asignación de uno
  o varios roles. Las sugerencias se basan en bindings exactos y requieren una
  acción explícita. No se analiza texto libre ni se ejecutan fórmulas para inferir roles.
- **Vista Previa → Contexto fiscal de los datos de ejemplo**: muestra disponibilidad
  y discrepancias en los datos cuando el molde tiene perfil fiscal. No es un informe
  de cumplimiento. El ejemplo histórico sigue indicando `isCFE: false`; elegir un
  perfil CFE no transforma ese ejemplo en un comprobante fiscal.

## Contratos y compatibilidad

`ReportTemplate.compliance?: FiscalProfile` y `BaseElement.fiscalRoles?: FiscalRole[]`
son extensiones opcionales. `ReportTemplate.schemaVersion` continúa en `1.0`.
Abrir un molde existente no agrega propiedades, modifica el diseño ni asigna roles.
La versión del perfil identifica su contrato de datos, no una versión normativa DGI.

La API existente conserva el JSON completo. No hay cambios en endpoints, backend,
base de datos o migraciones. Las extensiones desconocidas se conservan en la
persistencia existente; un perfil de versión/jurisdicción/salida incompatible se
muestra sin permitir su edición. Los roles desconocidos se muestran con su ID y
no se eliminan al agregar otro rol. Los códigos CFE fuera de los seis del MVP se
conservan y se muestran como fuera del MVP.

Los roles son declaraciones semánticas. No prueban que un campo se imprima, que
contenga un valor correcto o que sea legible. No modifican render, exportación o QR.
La persistencia de roles en elementos tampoco describe los bloques que el renderer
genera automáticamente; su instrumentación corresponde a otra etapa.

## Datos del comprobante

`InvoiceData.fiscal?: FiscalData` es información de ejecución, separada del molde.
Incluye datos del emisor/receptor, contexto de operación, importes, ajustes,
retenciones, líneas, referencias, CAE y seguridad. Los importes usan cadenas
decimales con punto para evitar pérdida de precisión. Las fechas son cadenas ISO.
El contrato admite campos parciales: no declara que todo campo sea obligatorio.

`buildValidationContext(profile, invoiceData, scenario?)` es una función pura:

- Conserva los hechos separados del perfil esperado y no modifica las entradas.
- Cada hecho tiene estado `known`, `unknown` o `conflict`, candidatos y procedencia
  (`invoice`, `legacy`, `scenario`) con la ruta de origen.
- El perfil no completa los datos desconocidos del comprobante. La información
  suplementaria tampoco sobrescribe silenciosamente las fuentes originales.
- Normaliza equivalencias decimales sin aritmética tributaria. Conserva cero,
  `false` y listas vacías; distingue una lista no informada de una lista vacía.
- Verifica formatos de datos, no obligaciones legales. Un dato mal formado no
  queda oculto por otra fuente válida. Las versiones desconocidas generan un diagnóstico.
- Mapea únicamente rutas observadas del contrato actual. No deduce tipo CFE de
  `venta_contado`, del nombre del comprobante ni del tamaño del papel. Tampoco toma
  `Total` como A.124/A.130 sin un contrato explícito ni deriva un hash de seis caracteres.
- Los diagnósticos de origen y diferencias con el perfil no constituyen incumplimientos
  DGI ni bloquean imprimir. Los datos fiscales faltantes siguen desconocidos.

El parámetro `scenario` permite que un consumidor aporte información complementaria
con procedencia explícita; esta etapa no agrega un editor/importador de escenarios
ni selecciona comprobantes reales. La vista previa conserva sus dos ejemplos actuales.
Los campos `fiscal.*` se ofrecen como bindings para las fuentes que aporten el nuevo
contrato; el normalizador no reescribe los datos usados por el renderer.

## Verificación

```powershell
npm run build
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless
node e2e/fiscal-profile/regression.cjs
```

Las pruebas unitarias cubren normalización, procedencia, conflictos, versiones,
decimales, sugerencias, edición, historial y persistencia HTTP simulada. Comparan
el HTML renderizado y la exportación Zureo antes y después de agregar metadatos.
La prueba de navegador usa la aplicación compilada y HTTP simulado: carga un molde
histórico, configura el perfil, asigna roles, guarda/recarga y compara diseño/HTML.
No accede a una base de datos real ni certifica el comportamiento de una impresora.
