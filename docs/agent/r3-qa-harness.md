# Harness QA R3 — Preflight, Suite Integrada y Rollback OFF

Documentación operativa mínima para ejecutar el harness local e integrado de **R3 (`AGENT_MEMORY_R3`)** contra entornos autorizados de **Preview + Supabase DEV (`tgiuevzlyptzlfgxsfhj`)**.

## Guardrails anti-Production (fail-closed)

[`scripts/qa/r3DevGuard.mjs`](../../scripts/qa/r3DevGuard.mjs) bloquea la ejecución antes de emitir cualquier solicitud si detecta:

- Referencia de Supabase Production: `xhpasmjzuwifmjhrsumb`.
- Hosts de Production: `scrumbanemx.vercel.app`, `tablero-operativo.vercel.app`.
- Entornos de ejecución: `NODE_ENV=production` o `VERCEL_ENV=production`.
- Referencia de proyecto fuera de `R3_ALLOWED_DEV_REFS` (por defecto únicamente `tgiuevzlyptzlfgxsfhj`).
- Carga del archivo `.env` raíz (exige `R3_ENV_FILE` dedicado, ej. `.env.r3.dev.local`, ignorado en `.gitignore`).
- Ejecución integrada sin `R3_INTEGRATED_AUTH=AUTH-R3-INTEGRATED` ni flag `--execute`.
- Rollback remoto sin `R3_ROLLBACK_AUTH=AUTH-R3-ROLLBACK-OFF` ni flag `--apply`.

## 1. Validación local (sin red ni secretos)

```bash
npm run qa:r3:test
```

Ejecuta `vitest run --config vitest.r3.config.mjs`:
- `api/_shared/memory/memory.test.ts` (contrato de memoria R3 y flag `AGENT_MEMORY_R3`).
- `scripts/qa/r3Integrated.test.mjs` (bloqueo de Production, redactado de secretos, allowlist DEV, autorización obligatoria, cleanup tracking y rollback).

## 2. Preflight (solo lectura, 9 controles)

Requiere archivo local no versionado (`.env.r3.dev.local`) con configuración DEV y `R3_PREVIEW_URL`.

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
$env:R3_ENV_FILE = ".env.r3.dev.local"
$env:R3_EXPECTED_WINDOW = "OFF"   # o "ON" durante ventana activa
npm run qa:r3:preflight
```

Salida esperada: `"status": "READY"`, 9/9 checks en `PASS`, `"writesPerformed": 0`. Reporte local en `.qa/r3-integrated-preflight.json` (gitignored).

## 3. Suite Integrada `R3-I0..R3-I7` (solo ventana autorizada ON)

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
$env:R3_ENV_FILE = ".env.r3.dev.local"
$env:R3_EXPECTED_WINDOW = "ON"
$env:R3_INTEGRATED_AUTH = "AUTH-R3-INTEGRATED"
npm run qa:r3:integrated -- --execute
```

- Crea únicamente fixtures trazables con prefijo `r3-int-<runId>-`.
- Detiene la ejecución ante fallo crítico (`R3-I1`, `R3-I2`, `R3-I3`).
- Limpia automáticamente los IDs registrados y valida `remainingMemory: 0` y `remainingDocuments: 0`.
- Nunca muta flags ni dispara deployments.

## 4. Rollback OFF independiente (Preview `gitBranch=preview`)

Dry-run (solo lectura):

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
$env:R3_ENV_FILE = ".env.r3.dev.local"
npm run qa:r3:rollback
```

Aplicación autorizada (parchea `AGENT_ORCHESTRATOR_R1=0` y `AGENT_MEMORY_R3=0` en `target=["preview"]`, `gitBranch="preview"`, y dispara redeploy OFF del SHA validado):

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
$env:R3_ENV_FILE = ".env.r3.dev.local"
$env:R3_ROLLBACK_AUTH = "AUTH-R3-ROLLBACK-OFF"
npm run qa:r3:rollback -- --apply
```

Tras alcanzar `READY`, actualizar `R3_PREVIEW_URL` y revalidar con `npm run qa:r3:preflight` en `R3_EXPECTED_WINDOW="OFF"`.
