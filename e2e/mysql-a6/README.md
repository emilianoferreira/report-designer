# A6 — validación funcional MySQL

Desde la raíz, compilar Angular y las herramientas .NET según A5 y ejecutar:

```powershell
node e2e/mysql-a6/run.mjs
node e2e/price-labels/regression.cjs
node e2e/fiscal-profile/regression.cjs
node node_modules/@angular/cli/bin/ng.js test --watch=false --browsers=ChromeHeadless
```

Reutiliza A5 y A4, sin sustituir respuestas HTTP: PostgreSQL/MySQL aislados,
dos APIs MySQL, navegador Chrome y Angular compilado. Agrega catálogo CRUD,
edición y persistencia de etiquetas, A4 y ticket, recarga y vista previa.
La vista previa Angular mantiene los datos de ejemplo del producto; la prueba
API autenticada → InvoiceData → HtmlRendererService con datos reales y comparación
HTML/PNG/páginas PDF se ejecuta dentro de A5.

No cambia configuración por defecto, snapshots, persistencia ni contratos.
Los resultados y errores completos permanecen en e2e/test-results; sólo evidencia
sintética y resultados sanitizados se copian a evidence. No versionar dumps,
cookies, credenciales ni logs completos de API. El runner compartido verifica
propiedad del contenedor antes de retirarlo y conserva el respaldo básico local.
No compilar mientras la API está ejecutándose. No iniciar los scripts de corte
productivo ni limpiar recursos ajenos.
