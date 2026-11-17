# Contratos de impresión y proveedor de demostración

Segundo incremento. Agrega contratos propios de Report Designer; no documenta ni
supone endpoints, tablas o reglas de Zureo. No introduce DDL, migraciones, escrituras
sobre artículos ni persistencia de lotes. El frontend de preparación ya consume esta API mediante el tercer incremento.
Los ejemplos locales se conservan únicamente en el diseñador y las pruebas.

## Configuración

El valor predeterminado de LabelPrinting:Provider es Disabled. En ese modo context
responde available=false, mode=disabled y company=null; las consultas de datos
responden 503 con code=provider_unavailable. No existe fallback a datos sintéticos.

Para habilitar explícitamente la demostración en una instancia Development:

```powershell
$env:LabelPrinting__Provider = 'Demo'
```

Reiniciar el backend con su configuración habitual de base y autenticación.
Demo solo se acepta en Development y Testing; en Production/Staging el arranque
falla. Valores desconocidos también fallan. La selección es independiente de
Database:Provider y funciona con las sesiones existentes de MySQL o PostgreSQL.
No se habilita una autenticación de prueba ni se crean usuarios automáticamente.

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

Cada empresa tiene IDs separados con prefijo demo y su propia proyección de dos
listas: General y Mayorista. Hay 60 artículos sintéticos ordenados por código:
59 activos y uno inactivo. DEMO-002 tiene precio cero; DEMO-003 no tiene precio
mayorista; DEMO-004 declara tratamiento tributario unknown. Los demás precios se
generan con decimal en el proveedor exclusivamente para demostración.

No se inventan logos ni imágenes: son null. Un molde que requiere esos datos deberá
advertir su ausencia al integrar el frontend. El campo mode=demo permite identificar
la fuente tanto en contexto como en cada instantánea. Nunca usar estos fixtures
como evidencia de una integración real con Zureo.

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
node e2e/price-labels/backend-demo.mjs
```

Reutiliza el harness aislado existente, sin consultar bases configuradas por el
usuario. Necesita dependencias de server instaladas, SDK .NET y permisos de conexión
local. Comprueba primero las regresiones de seguridad de ambos backends; luego los
endpoints nuevos de .NET, viewer, CSRF, paginación, empresa ajena y sesión revocada.
El adaptador demo no toca MySQL; la integración específica de datos Zureo sigue
pendiente de documentación y de un adaptador real.
