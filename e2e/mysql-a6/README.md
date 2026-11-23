# A6 — validación funcional MySQL

Desde la raíz del checkout de la rama candidata, compilar Angular y las herramientas .NET según A5 y ejecutar:

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
Cada ejecución guarda su resumen `a6-run.json` en el directorio único de A5 bajo
`e2e/test-results`. El runner usa un contenedor MySQL nuevo publicado en loopback
y comprueba su etiqueta de propiedad antes de usarlo y antes de retirarlo.
El respaldo queda en el directorio local de resultados.
No compilar mientras la API está ejecutándose. No iniciar los scripts de corte
productivo ni limpiar recursos ajenos.
