# Contratos de impresión y proveedor de demostración

Segundo incremento. Agrega contratos propios de Report Designer; no documenta ni
supone endpoints, tablas o reglas de Zureo. No introduce DDL, migraciones, escrituras
sobre artículos ni persistencia de lotes. El frontend de preparación ya consume esta API mediante el tercer incremento.
Los ejemplos locales se conservan únicamente en el diseñador y las pruebas.

## Configuración

La configuración appsettings.Development.json habilita Demo para el entorno local.
Los arranques habituales (npm run server, npm run study:api y el perfil de VS Code
Estudio .NET + MySQL) cargan esa configuración. Reiniciar el backend después de actualizar.
Se siguen necesitando la base habitual para sesiones/moldes y un usuario autenticado;
el catálogo ficticio no necesita tablas, seeds ni credenciales de Zureo.

Para deshabilitarlo explícitamente, la variable de entorno tiene prioridad:

```powershell
$env:LabelPrinting__Provider = 'Disabled'
```

Sin configuración, el registro conserva Disabled. En ese modo context responde
available=false, mode=disabled y company=null; las consultas responden 503.
Demo solo se acepta en Development/Testing; una activación explícita en Production
 o Staging impide arrancar. No existe fallback automático tras un error de catálogo.

## Probar desde la interfaz

1. Iniciar el backend local con la configuración habitual y Angular con npm start.
2. Iniciar sesión; crear o abrir un molde de etiquetas y guardarlo.
3. Abrir Preparar impresión, elegir ese molde y la lista Principal.
4. Buscar DEMO- para ver los primeros 25 artículos; Más resultados muestra los 5 restantes.
5. Agregar artículos, asignar cantidades y cambiar a Mayorista. El orden y las
   cantidades se conservan mientras se actualizan los precios.
6. Revisar el lote y usar Imprimir o Exportar HTML. El logo del molde predeterminado
   se resuelve con el logo ficticio incluido en la respuesta.

## HTTP

Contrato: [openapi.label-print.json](../contracts/openapi.label-print.json).
La referencia histórica /reference/openapi.json permanece intacta.

- GET /api/label-print/context: modo, disponibilidad y datos de empresa.
- GET /api/label-print/price-lists: items y nextCursor.
- GET /api/label-print/articles: query, priceListId, cursor y pageSize; artículos
  activos con precios indicativos. Código por prefijo, barras por coincidencia
  exacta, sin conversiones numéricas. Consulta vacía devuelve cero artículos.
- POST /api/label-print/resolve: priceListId y articleIds; devuelve la instantánea
  completa, en orden de solicitud, con resolvedAt UTC y revisión si existe.

Todas requieren sesión editor o viewer. POST requiere X-CSRF-Token incluso siendo
una consulta. La empresa procede de ICompanyContext, nunca de campos del cliente.
La API mantiene Cache-Control: no-store. Una lista ajena/inexistente devuelve 404;
un artículo ajeno, ausente o inactivo devuelve unavailable sin datos del catálogo.

Páginas: 25 por defecto, máximo 100. Resolución: entre 1 y 100 IDs únicos, hasta
200 caracteres por ID, cuerpo máximo 32768 bytes. Consulta hasta 100 caracteres.
Cursor opaco, vinculado a empresa, lista y búsqueda; cambiar estos parámetros
requiere iniciar una nueva paginación. No es una credencial ni una garantía de
instantánea transaccional. La demo es determinista e inmutable.

Importes como texto decimal, ausencia como null, cero como 0.00. Estados de precio:
available/missing/invalid. Tratamiento tributario: included/excluded/exempt/unknown.
No se calculan impuestos, convierten monedas ni sustituyen precios entre listas.
Errores de aplicación: statusCode/code/message; errores de binding JSON/parámetros
usan el ProblemDetails de ASP.NET, sin cambiar el comportamiento de otras APIs.

## Datos sintéticos

Cada empresa tiene IDs separados y dos listas: Principal y Mayorista. El catálogo
habitual contiene 30 artículos activos, de DEMO-001 a DEMO-030, con precios fijos
positivos en ambas listas. Los primeros seis son arroz (65/52), azúcar (58/46),
aceite (115/95), yerba (210/175), fideos (49/39) y café (185/155), en UYU.

Los importes simulados declaran impuestos incluidos; no representan tasas ni precios
reales de mercado. Los códigos EAN-13 sintéticos usan prefijo 200 y dígito verificador
correcto; son compatibles con CODE128 y no acreditan identificadores comerciales asignados.

La empresa Almacén Demo — empresa ficticia incluye un logo SVG embebido con el texto
DATOS FICTICIOS, sin solicitudes a servidores de imágenes. Las imágenes de producto
siguen siendo null. El contexto y las instantáneas conservan mode=demo.

Precio cero, precio faltante, artículo inactivo y tratamiento desconocido están en
un catálogo inyectado exclusivamente por las pruebas .NET, fuera del catálogo habitual.
Los contratos HTTP y el JSON persistido de los moldes permanecen iguales.

## Pruebas

Proyecto ejecutable de comprobaciones, sin paquetes de testing adicionales:

```powershell
dotnet run --project backend-dotnet/tests/LabelPrinting/LabelPrinting.csproj
```

Verifica reglas de entrada, cancelación, precios, paginación, aislamiento y registros
Demo/Disabled. Está incluido en la solución; se ejecuta con dotnet run, no dotnet test.

Integración HTTP con sesiones reales y PostgreSQL descartable:

```powershell
dotnet build backend-dotnet/src/ReportDesigner.Api/ReportDesigner.Api.csproj -m:1
npm --prefix server run build
npm run build
node e2e/price-labels/backend-demo.mjs
```

Reutiliza el harness aislado existente, sin consultar bases configuradas por el
usuario. Necesita dependencias de server instaladas, SDK .NET y permisos de conexión
local. Comprueba primero las regresiones de seguridad de ambos backends; luego los
endpoints nuevos de .NET, viewer, CSRF, paginación, empresa ajena y sesión revocada.
También prueba Angular compilado contra esa API: molde con logo, EAN-13, cantidades,
cambio de lista, impresión y exportación HTML.
El adaptador demo no toca MySQL; la integración específica de datos Zureo sigue
pendiente de documentación y de un adaptador real.
