# Report Designer

Aplicación para diseñar plantillas de impresión de reportes, comprobantes y etiquetas de productos. Permite editar elementos visualmente, previsualizar el resultado con datos de ejemplo y exportar las plantillas.

## Funcionalidades

### Diseñador de reportes

- Plantillas para documentos de hoja completa y tickets.
- Elementos de texto, campos de datos, imágenes, formas, códigos de barras y QR.
- Paneles de herramientas y propiedades, selección múltiple y ayudas de alineación.
- Vista previa y exportación de HTML y JSON.

### Diseñador de etiquetas

- Interfaz consistente con el diseñador de reportes y paneles laterales plegables.
- Configuración de tamaño, márgenes, filas, columnas y separaciones en milímetros.
- Texto, precios, imágenes y códigos de barras reales en el lienzo.
- Propiedades organizadas en General, Estilo y Datos.
- Deshacer y rehacer, con un paso por arrastre o redimensionado.
- Reglas, grilla y ajuste a bordes y centros de otros elementos.
- Validación de dimensiones, paginación y copias por artículo.
- Protección de cambios pendientes y conservación de ediciones durante el guardado.
- Impresión desde la vista previa y exportación de HTML y JSON.

Las vistas previas utilizan datos de ejemplo. La aplicación requiere una API configurada y una sesión autenticada para acceder a los diseñadores y guardar plantillas; no ofrece persistencia alternativa en localStorage.

## Tecnologías

| Área | Tecnologías |
|---|---|
| Interfaz | Angular, TypeScript y RxJS |
| Backend predeterminado | ASP.NET Core, Entity Framework Core y Npgsql |
| Backend alternativo | NestJS y TypeORM |
| Base de datos | PostgreSQL |
| Códigos gráficos | JsBarcode y QRCode |
| Pruebas | Playwright, Karma/Jasmine y Jest/Supertest |

El arrastre y el redimensionado utilizan eventos nativos del mouse (`mousedown`, `mousemove` y `mouseup`). RxJS se utiliza para distribuir los cambios de estado entre componentes y gestionar las respuestas HTTP.

## Requisitos de desarrollo

- Node.js 22 y npm.
- .NET SDK 10 para el backend predeterminado.
- PostgreSQL configurado para desarrollo; las pruebas de integración utilizan PostgreSQL 16.
- Google Chrome para las regresiones del diseñador de etiquetas. También se puede indicar un navegador Chromium mediante `CHROME_BIN`.
- Docker y Linux o WSL para las suites de integración que los requieren.

## Instalación y ejecución local

Desde la carpeta del repositorio, instalar las dependencias del frontend:

```sh
npm ci
```

Restaurar las dependencias del backend predeterminado:

```sh
dotnet restore backend-dotnet/ReportDesigner.slnx --locked-mode
```

Configurar la conexión a una base de desarrollo mediante variables de entorno o el almacén local de secretos del backend. ASP.NET Core utiliza `ConnectionStrings__Postgres`. Los valores dependen del entorno y no deben incorporarse al repositorio.

Preparar el esquema y una cuenta de acceso según la [guía del backend](backend-dotnet/README.md). No hay credenciales de acceso predeterminadas. Utilizar una base de desarrollo independiente para los datos de ejemplo y las pruebas.

Iniciar la API y el frontend en terminales separadas:

```sh
# Terminal 1: API
npm run server
```

```sh
# Terminal 2: frontend
npm start
```

Abrir la dirección local que indique Angular e iniciar sesión con la cuenta configurada.

Para trabajar con el backend alternativo, instalar sus dependencias con `npm ci --prefix server`, configurar su entorno local e iniciar `npm run server:nestjs` y `npm run start:nestjs` en terminales separadas. Reiniciar el frontend al cambiar de perfil.

## Verificación

| Comando | Alcance |
|---|---|
| `npm run build` | Compilación del frontend |
| `npm test` | Pruebas unitarias del frontend |
| `npm run test:price-labels` | Compilación y regresiones de etiquetas en navegador |
| `npm run test:backend` | Pruebas del backend alternativo; requiere su entorno de pruebas |
| `npm run test:security` | Integración autenticada en un entorno aislado; requiere Docker y Linux/WSL |

Las regresiones de etiquetas sirven la aplicación compilada desde archivos locales y simulan la API en memoria. Verifican edición, historial, atajos, alineación, guardado, códigos de barras y paginación PDF. No requieren credenciales ni conexión a una base de datos y no sustituyen las pruebas con una impresora física o un backend real.

Ver [instrucciones de las pruebas de etiquetas](e2e/price-labels/README.md).

## Atajos del diseñador de etiquetas

| Acción | Atajo |
|---|---|
| Deshacer | Ctrl/Cmd + Z |
| Rehacer | Ctrl/Cmd + Y o Ctrl/Cmd + Shift + Z |
| Guardar | Ctrl/Cmd + S |
| Duplicar el elemento seleccionado | Ctrl/Cmd + D |
| Eliminar el elemento seleccionado | Supr o Backspace |
| Mover el elemento seleccionado | Flechas: 0,1 mm; Shift + flechas: 1 mm |
| Cancelar un arrastre o deseleccionar | Escape |
| Cambiar el zoom | Ctrl/Cmd + rueda |

Al escribir en un campo se conservan sus atajos de edición. El historial se mantiene durante la sesión del documento y se reinicia al crear o abrir otra plantilla. Grilla, ajuste a grilla y ajuste a elementos se pueden activar de forma independiente.

## Organización del código

- `src/app/features/template-designer/`: diseñador de reportes.
- `src/app/features/price-label-designer/`: diseñador de etiquetas.
- `src/app/shared/`: recursos visuales compartidos.
- `src/app/core/`: modelos y autenticación.
- `backend-dotnet/`: backend predeterminado.
- `server/`: backend alternativo.
- `database/`: scripts de esquema y datos de ejemplo.
- `e2e/`: pruebas de navegador e integración.

Consultar [ARCHITECTURE.md](ARCHITECTURE.md) para navegar por los componentes y servicios.

## Configuración y datos

Mantener contraseñas, tokens, certificados, archivos de entorno y copias de bases de datos fuera del control de versiones. Usar datos ficticios en ejemplos, pruebas y capturas compartidas.

La configuración de despliegue y la evaluación de seguridad corresponden a cada entorno. Este README describe el uso y desarrollo del proyecto; no acredita que una instalación esté preparada para producción.
