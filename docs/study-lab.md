# Laboratorio local .NET / MySQL

Solo datos sintéticos. No utiliza los despliegues existentes ni PostgreSQL.
Requisitos: Node 22, SDK .NET 10, VS Code con C#, Docker/Compose en WSL
(Ubuntu predeterminada en Windows). Ejecutar desde la raíz del repositorio.

## Preparación y uso cotidiano

0. En Windows, abrir una terminal y ejecutar `npm run study:hold`. Mantenerla
   abierta durante la sesión. En este equipo WSL se apaga al quedarse sin procesos
   de usuario, aunque Docker sea un servicio systemd; esto apaga MySQL y causa 503.
   El hold evita ese cierre sin cambiar configuraciones globales de Windows/WSL.
1. En otra terminal, primera vez: `npm run study:setup`. Crea recursos nuevos, aplica 001 y 002,
   carga 003-study-seed y usa ProvisionMySqlUser. Repetir setup conserva datos
   y no reprovisiona un usuario ya creado. Una inicialización parcial se inspecciona;
   el script no borra tablas ni volúmenes para resolverla.
2. Días siguientes: `npm run study:up` y `npm run study:status`.
3. En VS Code, abrir la carpeta raíz, seleccionar **Estudio .NET + MySQL**
   en Ejecutar y depurar, pulsar **F5**. Esperar el mensaje de escucha en 5080.
   Alternativa sin depurador: `npm run study:api`. No ejecutar ambas simultáneamente.
4. Consultar `http://127.0.0.1:5080/health/ready`: debe responder 200.
5. Al terminar: **Shift+F5** (o Ctrl+C en el arranque por consola), después
   `npm run study:stop`. Después Ctrl+C en la terminal study:hold. El volumen conserva datos y certificados.
6. Volver a levantar con el paso 2. No ejecutar `db:reset`, `down -v` ni prune.

El perfil lee `.local/study/api.env`; no cambia appsettings ni User Secrets globales.
Las credenciales generadas están en `.local/study/credentials.txt`. Toda esa carpeta
es privada, está ignorada por Git y excluida del contexto Docker. No compartirla.
El volumen es `report-designer-study_mysql-data`; puerto 127.0.0.1:3307.
No borrar la carpeta privada: contiene el marcador de propiedad y las credenciales.

## Postman

Importar `docs/study.postman_collection.json` y el entorno privado generado
`.local/study/postman.environment.json`. Usar un espacio local sin sincronización.
La plantilla pública `docs/study.postman_environment.json` tiene contraseña vacía.
Seleccionar el entorno **Report Designer — estudio LOCAL**. Mantener cookies
habilitadas; usar siempre 127.0.0.1, sin alternarlo con localhost.

Enviar solicitudes en orden. Login envía `X-CSRF-Token: login`, conserva la cookie
HttpOnly `rd_session` y guarda el CSRF. Los scripts actualizan ID, revisión y CSRF.
Las escrituras siguientes envían `X-CSRF-Token` y, donde corresponde, `If-Match`
con la revisión entre comillas. El cambio de empresa rota cookie y CSRF.

Para estudiar, enviar individualmente: crear → consultar SQL → modificar → consultar
SQL → eliminar → comprobar ausencia. El runner completo crea y elimina sus moldes.
Las respuestas 401, 403, 404 y 409 de los casos negativos son esperadas.
No exportar a Git entornos con contraseña, cookies o tokens.

## Breakpoints y recorrido

- `TemplatesController.Create`: colocar breakpoint en la construcción de `command`.
- `MySqlTemplateCommands.CreateAsync`: detener antes del INSERT y antes de CommitAsync.
- Inspeccionar body, command, CompanyId, id y result; F10 avanza, F11 entra,
  Shift+F11 sale, F5 continúa. SQL externo ve la fila después del commit.
- Para comprobantes: detener en `MySqlInvoiceDataSource.LoadAsync` y
  `InvoiceDataBuilder.Build`; enviar solicitud 15. Comprobante sintético: total 122,
  una línea, IVA 22. Las lecturas se realizan antes de entrar al builder.
- Application define contratos para moldes; no hay un servicio intermedio ejecutable.
- Para estudiar errores, habilitar una excepción concreta en Breakpoints. Deshabilitar
  pausas por excepciones esperadas durante el runner completo.

El perfil usa Debug y PDB, con logging de comandos EF sin datos sensibles.
No dejar una transacción pausada mientras otra solicitud intenta modificar la fila.
Para pausas prolongadas, desactivar el timeout de la solicitud en Postman.

## Workbench / DBeaver y SQL

Conexión MySQL: host **127.0.0.1**, puerto **3307**, base **report_designer_study**,
usuario **study_reader**, contraseña de credentials.txt. SSL: **Verify CA**
(DBeaver: propiedad del driver `sslMode=VERIFY_CA`), CA `.local/study/ca.pem`.
No usar SSL deshabilitado ni confianza indiscriminada. Esta CA local verifica
confianza; no se afirma validación de hostname como en VerifyFull.
La cuenta permite SELECT en tablas de negocio, no escritura ni lectura de hashes.

```sql
SELECT DATABASE(), @@global.time_zone;
SHOW SESSION STATUS LIKE 'Ssl_cipher';
SHOW TABLES;
SELECT id, nombre, version, updated_at FROM report_templates ORDER BY updated_at DESC;
-- Copiar el UUID recibido en Postman:
SELECT id, nombre, version, template_json FROM report_templates WHERE id = 'UUID';
SELECT id, numero, subtotal, total FROM invoices;
SELECT * FROM invoice_lines WHERE invoice_id = 'f1000000-0000-0000-0000-000000000001';
```

Alternativa sin instalar cliente: `npm run study:sql`, o
`npm run study:sql -- "SELECT id,numero,total FROM invoices;"`.
Se ejecuta con la cuenta de lectura y TLS verificado dentro del contenedor.
Usar autocommit/refrescar la consulta para ver commits nuevos.

## Verificación y diagnóstico

Con la API iniciada y sin breakpoints activos: `node scripts/study-verify.mjs`.
Solo crea/elimina su propio molde. Detiene/inicia y recrea el contenedor propio
conservando el volumen; verifica CRUD, revisiones, roles, sesiones y comprobantes.
Resultado sin secretos: `.local/study/verification.json`.

- 503 ready: comprobar `study:status`, CA y conexión; live=200 solo indica proceso activo.
- 401: volver a login; 403: comprobar CSRF, empresa y rol.
- 409: GET para recuperar versión vigente; no reenviar una revisión obsoleta.
- Breakpoint vacío: revisar perfil seleccionado y build Debug, detener otras APIs.
- Puerto ocupado o propietario distinto: el script aborta; no eliminar recursos ajenos.
- La contraseña de la API no es la del login ni la del cliente SQL.
