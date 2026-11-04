# Etapa 0: referencia de compatibilidad

Esta suite ejecuta el backend NestJS y Angular existentes sobre PostgreSQL real y descartable. Congela los contratos y comprueba guardar, recargar desde un navegador nuevo y renderizar antes de migrar el servidor.

## Ejecutar

Desde la raíz, con Node.js 22 y npm:

```sh
npm ci
npm ci --prefix server
npx playwright install chromium
npm run test:migration
```

No hace falta instalar PostgreSQL ni configurar `.env`. `embedded-postgres`, fijado como dependencia de desarrollo, contiene binarios nativos PostgreSQL 16.15. El paquete tiene versión beta; se usa exclusivamente en pruebas. Esta ejecución se valida en Windows x64. En Linux no debe ejecutarse como root. La instalación inicial necesita acceso al registro npm y a la descarga de Chromium.

El runner compila Nest, crea un clúster en `tmp/stage0-<uuid>`, asigna puertos libres en loopback y carga los tres SQL originales. Angular usa el perfil real nestjs; la variante con .NET usa además el perfil predeterminado dotnet, con destinos de API asignados por variables de entorno para aislar los puertos. Usa un usuario de aplicación sin privilegios para crear bases. Sobrescribe explícitamente las variables de conexión y verifica un marcador SQL y un registro de prueba leído por HTTP antes de escribir mediante la API. Las pruebas rechazan conexiones que no tengan ese marcador.

Al terminar detiene sus procesos y borra únicamente el directorio verificado de esa ejecución. Los logs, la versión de PostgreSQL y el resultado JSON quedan en `e2e/test-results/stage0-<uuid>/`. En fallos de navegador conserva captura y trace. Estos archivos están ignorados por Git. Ejecutar una suite por checkout: la compilación comparte `server/dist`.

## Cobertura

| Área | Evidencia |
|---|---|
| Nueve operaciones HTTP | `contracts/openapi.json`; estados, cuerpos, casing, tipos y respuestas de error contrastados con AJV |
| Reporte A4, ticket 80 mm y etiqueta | Fixtures JSON completos; CRUD, diseño, duplicación y lectura SQL de JSONB |
| Persistencia | Versión de fila, actualización parcial, valores omitidos/null/vacíos, decimales, Unicode y extensiones desconocidas |
| Facturas | Dos empresas, cinco facturas del seed, orden y JSON completo; factura adicional sin líneas, contacto, sucursal ni impuestos |
| Editor de reportes | Editar texto, guardar por HTTP, comprobar SQL, abrir navegador nuevo, recargar, renderizar uno/cinco artículos y exportar JSON/HTML z-code |
| Etiquetas | Editar texto, guardar/recargar, precio y código de barras, cuatro artículos y ocho copias renderizadas, exportar JSON |
| Listados | Separación de reportes y etiquetas aunque compartan tabla y API |

Hay 21 casos HTTP y cuatro casos de navegador. Después se ejecutan los 18 casos preexistentes del backend sobre el mismo clúster aislado. Las aserciones de la suite nueva son obligatorias; no omiten validaciones cuando faltan filas o elementos.

Verificación del 3 de noviembre de 2026: Windows x64, Node 22.17, PostgreSQL 16.15 y Chromium de Playwright 1.59.1; 25/25 casos nuevos y 18/18 casos existentes aprobados en una ejecución normal posterior al registro de referencias. También pasó `tsc -p e2e/tsconfig.stage0.json`. Se alineó `@nestjs/testing` con NestJS 10.4.22 para resolver el conflicto de instalación con la versión 11 que tenía el proyecto.

Los fixtures se basan en `createDefaultTemplate`, `createElement` y `createDefaultPriceLabelTemplate`, con identidades y fechas internas fijas. A4 contiene los ocho tipos de elementos. Ticket conserva el formato de ancho 80 y altura dinámica. La etiqueta conserva unidades, grilla, imagen, texto, precio y barcode. No contienen información de producción.

Los snapshots JSON comparan documentos y respuestas completos. Solo se normalizan UUID y fechas de la fila generados por el servidor; el documento anidado conserva sus valores. Al recargar una etiqueta, Angular reemplaza su id/nombre internos por los de la fila; esa transformación también se comprueba. Los snapshots HTML incluyen geometría, CSS de impresión y SVG generados. No son comparaciones de píxeles ni una certificación de impresión física o PDF.

## Actualizar referencias

```sh
npm run test:migration:record
git diff -- e2e/stage0/snapshots
npm run test:migration
```

El modo normal falla ante referencias ausentes o diferentes. El modo `record` es explícito: revisar el diff junto con el cambio de contrato antes de aceptar una referencia nueva. No usarlo para ocultar una regresión. La suite TypeScript puede verificarse con `npx tsc -p e2e/tsconfig.stage0.json`.

## Comportamientos existentes que requieren una decisión posterior

- Un UUID o empresa mal formado y ciertos cuerpos inválidos producen 500 genérico. Se caracteriza el comportamiento; una validación 400 futura necesita un cambio de contrato deliberado.
- Las consultas individuales no aplican aislamiento de empresa y PUT permite asignar `company_id`, `autor` y `tags`. El caso `known-debt` registra esa carencia; no prescribe conservarla como requisito de seguridad.
- PUT es parcial, incluso `{}` incrementa versión; DELETE responde 200 con cuerpo vacío; duplicar reinicia versión y conserva el JSON interno. Los totales del listado de facturas son strings, mientras `build_invoice_data` entrega números.
- La entrada directa a `/designer/:id` tiene una carrera de carga existente. La prueba entra por el listado y abre el editor, también en el navegador nuevo. No cubre ese acceso directo.
- La vista previa actual de reportes usa `SAMPLE_INVOICE_DATA`/su variante multilínea y etiquetas usa artículos de muestra. La persistencia de la plantilla sí pasa por PostgreSQL y los endpoints de facturas se verifican por separado; esta etapa no conecta la vista previa con una factura del servidor.

`npm run test:migration` sigue verificando NestJS mediante su perfil explícito de Angular. `npm run test:dotnet` y su alias `npm run test:cutover` comparan las nueve operaciones entre ambos backends y ejecutan los 25 casos completos de API/editor con cada perfil real. Las 18 pruebas existentes también verifican NestJS. Desde etapa 5 se comprueba además el destino efectivo de cada proxy y el retorno .NET → NestJS → .NET con datos persistidos. El tráfico habitual de `npm start` ahora va a .NET; `npm run start:nestjs` permite volver a NestJS. Los contratos HTTP, fixtures y snapshots se conservan; ver `backend-dotnet/README.md` para configuración y alcance.
