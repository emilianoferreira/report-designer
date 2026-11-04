# Etapa 10: ensayo de release y recuperación, sin producción

```sh
npm run test:release
```

La revisión de guardas sin Docker ni conexiones se puede repetir con `node e2e/stage10/check-plan.mjs`; también forma parte del entrypoint de esta etapa.

Requisitos Linux/WSL: Docker/Compose locales, Node y dependencias npm de raíz/server, Chromium Linux, OpenSSL, certutil y age/age-keygen. La suite no lee release.env, production.env o las configuraciones privadas del operador. Proyecto stage10-<id>, PostgreSQL 16/TLS y puertos de loopback propios; ninguna base existente se consulta. Revisar espacio libre físico en el host WSL antes de construir imágenes.

## Qué se verifica

Se usa el perfil `compose.yaml` + `production.compose.yaml` con referencias **locales de prueba**, sin registro o imágenes de producción. La configuración a revisar permanece bloqueada por sus campos pendientes. No hay comando de despliegue en el runner ni en el workflow.

1. Crear las tablas originales y de autenticación, usuarios sintéticos y marcador de base descartable. Ejecutar los controles HTTPS de etapa 9 y las 297 peticiones de seguridad. Las 18 pruebas NestJS autenticadas se ejecutan contra este origen aislado.
2. Crear checkpoints A4/ticket/etiqueta, incluida una extensión JSON de 1 MiB. Cerrar escrituras con el modo de mantenimiento del gateway y verificar 503 y ausencia de cambios en todas las tablas.
3. Generar una identidad age temporal y un respaldo custom cifrado por streaming, con un snapshot PostgreSQL compartido por pg_dump y las huellas SQL. No escribir un dump en claro. La identidad, passfile, archivo cifrado y manifiesto permanecen en el temp privado, no en artefactos públicos.
4. Abrir escrituras, crear un documento posterior al backup y editarlo con NestJS; retornar a .NET y comprobar que esas escrituras sobreviven. Esto prueba que un retorno de backend no debe restaurar datos antiguos.
5. Rechazar un archivo corrupto antes de crear un destino y rechazar sobrescribir el origen o una base existente. Restaurar el archivo válido en una base nueva restorecheck_<uuid>, comparar conteos/hashes de todas las tablas y definiciones de esquema/funciones/constraints/índices/extensiones/secuencias. Confirmar que el documento posterior al backup no está en el snapshot restaurado y sigue intacto en el origen.
6. Revocar sesiones de la copia restaurada y aplicar grants explícitos mínimos. Conectar solo los contenedores de prueba a esa copia, exigir nuevo login y verificar por API los tres checkpoints exactamente. Retirar únicamente esos fixtures de la copia para ejecutar el baseline.
7. Sobre la base restaurada, recorrer los 31 casos de contratos/editor/autenticación/HTTPS con .NET → NestJS → .NET (93 ejecuciones), incluidos los 19 snapshots originales. Conservar gateway/sesión y verificar documentos interoperables de 1 MiB y el backend seleccionado sin reintentos.
8. Eliminar y verificar contenedores, red, volumen (ambas bases), certificados, passfiles, dumps cifrados, claves y confianza temporal. Conservar solo imágenes/caché y evidencia sin secretos en e2e/test-results/stage10-<id>/.

La copia restaurada utiliza el mismo clúster **descartable** por economía de recursos; no es un servidor de producción. En un entorno real se debe elegir un destino de recuperación aislado y dimensionado, revisar compatibilidad de versión/locales/extensiones y no trasladar datos reales a CI. Las guardas de Playwright exigen loopback, nombres temporales y un marcador específico, también en la copia restaurada.

## Imágenes locales ya validadas

Cuando no hay espacio para reconstruir y la aplicación no cambió, puede indicarse STAGE10_IMAGES_FILE con el stage9.json de una ejecución local aprobada. Se comprueban los IDs presentes, las fuentes de aplicación frente a ca454e5 y se crean únicamente tags de prueba nuevos. Se reutiliza también el build stage de tests NestJS. No se publican imágenes; el reporte marca reusedImages=true. No usar esta opción si cambió una entrada de construcción. En CI, sin ese archivo, se construyen las imágenes desde el checkout.

La [ficha final](../../deployment/production.review.json) y el [procedimiento de producción](../../deployment/PRODUCTION.md) son la salida para revisar. Las herramientas operativas tienen modo plan por defecto y exigen configuración revisada + --execute para una operación explícita. Ese modo de ejecución **no se usa contra producción** durante esta etapa. El ensayo no acredita todavía un respaldo del proveedor real, almacenamiento externo, sus credenciales o el RPO/RTO definitivo.

## Evidencia de validación

Validado el 4 de noviembre de 2026 en Ubuntu 24.04 WSL2, Docker Engine 29.1.3 y PostgreSQL 16/TLS. El proyecto `stage10-ee39e7af00ff4895` terminó correctamente y verificó su limpieza. Se reutilizaron las tres imágenes de aplicación de etapa 9 después de comprobar sus IDs y la ausencia de cambios en las fuentes de aplicación; el perfil de producción y la plantilla de gateway son los de esta etapa. No se reconstruyó ni publicó la aplicación en este ensayo local. El workflow manual construye desde el checkout cuando se ejecute; no se lanzó remotamente.

- Respaldo cifrado de 51.701 bytes, sin archivo de dump en claro. Restauración nueva con comparación exacta de 15 tablas (14 de aplicación y el marcador de prueba), 89 filas sintéticas, esquema y secuencias. Backup: 1.001 ms; restauración/verificación: 1.230 ms. Estos tiempos no estiman el RTO real.
- Se rechazaron el archivo corrupto, el origen como destino y una base de destino existente. El origen quedó intacto. Se verificaron pausa de escrituras con 503, persistencia de cambios posteriores al backup al volver a NestJS, ausencia de esos cambios en el checkpoint restaurado y revocación de sesiones restauradas.
- Los tres documentos checkpoint se recargaron exactamente por API con los grants explícitos. Sobre la copia restaurada pasaron 93 ejecuciones de contratos/editor/autenticación/HTTPS y los 19 snapshots originales, recorriendo .NET → NestJS → .NET. También pasaron 297 peticiones de seguridad y las 18 pruebas NestJS autenticadas sobre el origen sintético.
- Pasaron TypeScript, sintaxis de los runners, revisión offline y guardas del modo plan. Compose resolvió el perfil sin builds ni puertos públicos de aplicación, cookies Secure, NestJS inicial y mantenimiento cerrado; rechazó una imagen obligatoria ausente. Se verificó la eliminación de contenedores, volúmenes, redes y secretos temporales.

La evidencia local queda en `e2e/test-results/stage10-ee39e7af00ff4895/`: `stage10.json`, `recovery.json`, `https.json`, `security.json` y resultados de Playwright. El archivo cifrado, su manifiesto privado, identidad age y credenciales se eliminaron con el entorno descartable; no son artefactos públicos ni respaldos reales. Los contratos, fixtures, snapshots y código de Angular/NestJS/ASP.NET Core permanecen sin cambios. No se tomó un respaldo ni se desplegó en producción; la ficha sigue `pending-review`.
