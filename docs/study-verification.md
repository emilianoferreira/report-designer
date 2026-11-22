# Verificación del laboratorio — 2026-11-13

Rama codex/mysql-migration. Sin cambios de lógica de negocio ni commits.

El 503 se reprodujo tanto con F5 como por consola. El diagnóstico directo de
MySql.Data indicó imposibilidad de conectar al host. Los logs mostraron cierre
ordenado de MySQL por señal tras finalizar los procesos WSL de usuario. Mantener
WSL activo resolvió la conexión. El comando study:hold documenta esa necesidad
sin alterar la configuración global del equipo.

Pasó scripts/study-verify.mjs con API local y MySQL dedicado:

- Esquema 001/002, 14 tablas, 18 FK, UTC y TLS verificado.
- Permisos limitados; lector sin acceso a autenticación.
- Login, cookies, CSRF y logout.
- Creación, lectura SQL, modificación y guardado de diseño.
- CSRF ausente 403, revisión obsoleta 409 y revisión inválida 400.
- Stop/start y recreación del contenedor conservando datos y sesión.
- Comprobante sintético construido por InvoiceDataBuilder.
- Cambio de empresa, viewer y aislamiento.
- Eliminación del molde propio y ausencia comprobada por SQL.

F5 inició la API en VS Code durante la preparación inicial. No se contabiliza
como verificada una pausa en breakpoint, ni la ejecución de la colección dentro
de Postman: la aceptación HTTP anterior fue ejecutada por Node. Ambas
comprobaciones interactivas siguen pendientes. Workbench/DBeaver tampoco fueron
verificados gráficamente. La guía detalla los pasos para estas comprobaciones.

Los datos de prueba del verificador fueron eliminados por su propio UUID.
La semilla y el usuario se conservan; no se eliminaron volúmenes ni recursos ajenos.
