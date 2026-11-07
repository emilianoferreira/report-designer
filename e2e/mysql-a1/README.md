# A1 — PostgreSQL baseline and real invoice rendering

Run from `codex/mysql-migration`, with installed repository dependencies, .NET 10 and Chrome:

```powershell
dotnet build backend-dotnet/src/ReportDesigner.Api/ReportDesigner.Api.csproj --no-restore -m:1
npm --prefix server run build
node e2e/mysql-a1/run.mjs
```

`CHROME_BIN` optionally selects an installed Chromium executable. The harness uses the existing embedded PostgreSQL runner: it creates a fresh cluster in an OS temporary directory, with random credentials and free loopback ports. It overrides both APIs' database connections; it never reads the user's database configuration. The database named `postgres` belongs to that new cluster, not a pre-existing server. Both child APIs and PostgreSQL are stopped in the runner's `finally`. The temporary data is retained; there is no global cleanup.

The existing security/concurrency suite runs first, then the callback logs in through the real APIs. It requests seed invoice 2, compares the response to `build_invoice_data()` on the isolated database, and supplies that unchanged response to `HtmlRendererService` bundled from the product source by esbuild. Angular's compiler is included only in this test bundle. No product routes, bundles or HTTP contracts change.

For both NestJS and .NET, the harness uses the existing A4 and ticket fixtures and saves input JSON, HTML, screenshots, renderer evidence and PDFs under `e2e/test-results/mysql-a1-<uuid>`. It checks rendered company, first line and total, browser errors, PDF page presence and cross-backend page-count parity. HTML and text are compared; PDF bytes are not compared. Failed unauthenticated/foreign requests are rejected before rendering; the harness has no sample-data fallback. This is a test-only integration path, not a claim that the product preview currently loads real invoices.

`report.json` records the branch, source reference, server version, request route, input hashes and checks. `inventory.json` records SHA-256 hashes and sizes of interrupted-probe artifacts without deleting them. Security evidence remains in the temporary cluster directory referenced by the report. Generated artifacts are ignored by Git; keep the evidence directory when reviewing an execution.

## Baseline contracts

| Area | Preserve | Validation |
|---|---|---|
| HTTP | Current authenticated OpenAPI shapes, errors and empty DELETE 200 | Existing stage8 API/browser suite |
| Ownership | Active session company; foreign IDs 404; company/identity/timestamps immutable | Existing check-security |
| Authentication | PBKDF2, opaque hashed sessions, CSRF, roles, expiration, revocation and login limits | Existing check-security and auth browser tests |
| Templates | Create/update/design/duplicate/delete; omitted versus null; unknown JSON fields; based_on protection | Existing API/editor regression |
| If-Match | Optional quoted integer; invalid 400, stale 409 with no mutation | Existing real database concurrency tests |
| Legacy writes | Atomic serialization, without protection against stale-client overwrite; legacy version values may be reused | Existing legacy-version case; limitation documented |
| Invoices | Exact public keys/types, decimal strings in summaries versus numbers in data, nullable flags, UTC precision | Existing contracts plus real SQL/API parity in harness |
| Renderer | Actual API company, line and total present in A4/ticket output | New browser harness |
| Fiscal and labels | Existing print gates, presentation, editing and draft-conflict recovery | Existing Angular/label/fiscal suites |

Documented oddities (malformed UUID 500, empty PUT version increment and legacy version rules) are retained for migration. Object-key order and JSON whitespace are not public requirements. Taxes have no guaranteed SQL ordering; lines only have `linea_nro` ordering, without a defined tie-breaker. A1 adds no ordinals or sorting rules. The current fixture comparison is exact within the same database state; it does not establish a future ordering contract.

## Mandatory regression commands

- `npm run test:security`: packaged .NET/NestJS, isolated TLS PostgreSQL, browser snapshots, API contracts and Jest regressions. On this workstation run through WSL with Docker access.
- `npm run test:price-labels`: includes precision, validation, presentation and protected-save/delete regressions.
- `node e2e/fiscal-profile/regression.cjs`: fiscal browser scenarios with the existing mock API boundary.
- `node e2e/stage8/angular-unit.mjs`: Angular unit tests; if the Playwright browser is absent, run Angular CLI with the same Karma config and an explicit installed `CHROME_BIN`.
- `node e2e/mysql-a1/run.mjs`: real database security/concurrency plus real API/renderer integration.

Production recovery/HTTPS operational drills remain outside A1. No MySQL connection or provider adoption is part of this stage. The probe artifacts are historical evidence, not proof that Oracle's provider or its license is approved.
