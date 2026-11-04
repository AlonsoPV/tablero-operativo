# SECURITY_AUDIT — Tablero Operativo / Scrumban

Fecha: 2026-11-03  
Alcance: reconocimiento de código + Fase A y Fase B de remediación (aprobadas).  
Entornos de DB en vivo y Storage Dashboard: **NO VERIFICADO** salvo donde se indique.

## 1. Resumen ejecutivo

La aplicación combina SPA (Vite) + Vercel Serverless (`/api/*`) + Supabase (Auth, Postgres/RLS, Edge Functions) + WhatsApp Cloud API + Gemini.

**Riesgos principales antes de remediación:** webhook WhatsApp sin HMAC, dispatcher sin secret obligatorio, TTS ElevenLabs sin JWT, tampering de `assistant_pending_ops.payload`, invite con password fijo, CORS `*`, Edge AI O2C sin gate OKRS, mailer sin authz/rate limit.

**Fase A (repo):** HMAC Meta, dispatcher fail-closed, TTS JWT+rate, trigger pending ops.  
**Fase B (repo):** invite password aleatorio + `must_reset_password`, RLS comentarios autor/admin, authz+rate en mailer, CORS allowlist compartida, gate `can_use_ai_whatsapp` en Edge AI, headers Vercel, rate limits gemini-chat / demo-request.

Migraciones relevantes: `20261103220000_*` (OKRS), `20261103230000_*` (pending ops), `20261103240000_*` (comentarios RLS). Apply **NO VERIFICADO** en proyectos vivos.

## 2. Inventario auditado

| Área | Componentes |
| --- | --- |
| Frontend | React/Vite, rutas AI/WhatsApp gated por área OKRS + Super Admin |
| Vercel API | `gemini-chat`, `assistant-*`, `guide-*`, `elevenlabs-tts`, `demo-request` |
| Edge | WhatsApp send/inbox/webhook/dispatcher + admin/invite/AI O2C |
| DB | RLS en tablas WA/assistant; `can_use_ai_whatsapp()` |
| Secrets | Sin `VITE_` para Meta/Gemini/service_role (diseño OK) |

## 3. Hallazgos priorizados

| ID | Severidad | Estado | Evidencia | Corrección |
| --- | --- | --- | --- | --- |
| S-WA-HMAC | Alta | **Mitigado en repo** | `whatsapp-webhook/index.ts` | Firma Meta; 401 si falla |
| S-DISP-SECRET | Alta | **Mitigado en repo** | `whatsapp-followup-dispatcher` | Secret siempre requerido |
| S-TTS-AUTH | Alta | **Mitigado en repo** | `api/elevenlabs-tts.ts` | `requireAssistantAuth` + rate limit |
| S-PENDING-TAMPER | Alta | **Mitigado en repo** | `20261103230000_*` | Trigger bloquea cambios a payload/tool |
| S-INVITE-PWD | Alta | **Mitigado en repo** | `invite-user` | Password aleatorio + `must_reset_password` |
| S-COMMENT-RLS | Media–Alta | **Mitigado en repo** | `20261103240000_*` | UPDATE/DELETE autor o `can_manage_catalogs()` |
| S-EMAIL-ANY | Media | **Mitigado en repo** | `send-notification-email` | Privileged vs rate; no-admin exige accion/ticket o self |
| S-CORS-STAR | Media | **Mitigado en repo** | `_shared/cors.ts` | Allowlist + `CORS_ALLOWED_ORIGINS` / `APP_BASE_URL` |
| S-HEADERS | Media | **Mitigado en repo** | `vercel.json` | CSP baseline, HSTS, XFO, nosniff, Referrer, Permissions-Policy |
| S-RATE-IA | Media | **Mitigado en repo** | `api/gemini-chat.ts` | 40 req / 60s por usuario |
| S-DEMO-ABUSE | Media | **Mitigado en repo** | `api/demo-request.ts` | 5 req / 15 min por IP |
| S-EDGE-AI-SCOPE | Media | **Mitigado en repo** | Edge `ai-chat*` / Lovable | `requireAiWhatsappAccess` |
| S-EDGE-JWT-OFF | Media | Abierto | `supabase/config.toml` verify_jwt=false | Checklist + JWT donde aplique |
| S-PII-LLM | Media | Residual | contextos a Gemini | Minimizar campos / telemetría |
| S-OKRS-MIG | Media ops | **Apply NO VERIFICADO** | migraciones 0322–0324 | `db push` por entorno |
| S-DEPS | Media | Parcial | `npm audit` | Triage / bumps selectivos |
| S-DOCS-DRIFT | Baja | Abierto | `AUDITORIA_IA_WHATSAPP.md` | Sync docs |

## 4. Matriz RLS (diseño en migraciones)

| Tabla | RLS | Nota |
| --- | --- | --- |
| `whatsapp_messages` | ON | SELECT: `can_use_ai_whatsapp()` o propio |
| `whatsapp_followup_settings` | ON | OKRS / Super Admin |
| `whatsapp_followup_jobs` | ON | select own/admin |
| `assistant_pending_ops` | ON + trigger inmutabilidad | UPDATE lifecycle only |
| `accion_comentarios` | ON | UPDATE/DELETE autor o catálogos |
| `assistant_op_log` | ON | own select/insert |
| Storage buckets | — | **NO VERIFICADO** en Dashboard |

## 5. Correcciones aplicadas (detalle)

### 5.1 Fase A
- Webhook Meta HMAC (`WHATSAPP_APP_SECRET`)
- Dispatcher fail-closed (`WHATSAPP_DISPATCHER_SECRET`)
- ElevenLabs JWT + rate
- Pending ops immutability trigger

### 5.2 Fase B
- Invite: `generateTemporaryPassword()` + metadata `must_reset_password`; UI clipboard
- Comentarios: migración `20261103240000_accion_comentarios_author_rls.sql`
- Mailer: rate buckets + contexto accion/ticket para no-admins
- CORS allowlist en `_shared/cors.ts` (`corsHeadersFor`)
- Edge AI: `requireAiWhatsappAccess` en `ai-chat`, `ai-chat-stream`, `ai-insights`, `ai-report`, `lovable-chat-completions`
- Vercel security headers + rate limits gemini/demo

## 6. Evidencias de pruebas

| Prueba | Resultado |
| --- | --- |
| Vitest HMAC Meta | **Aprobada** (Fase A) |
| Vitest permissions / moduleAccess OKRS | **Aprobada** |
| Vitest assistant rate limit | **Aprobada** (suite existente) |
| `tsc -b` post Fase B | **Aprobada** |
| RLS multi-usuario en DB real | **NO EJECUTADO** |
| Webhook Meta live | **NO EJECUTADO** |
| Apply migraciones en Supabase | **NO EJECUTADO** (requiere orden por entorno) |
| CSP en Vercel prod | **NO VERIFICADO** (puede requerir ajuste si rompe embeds) |

## 7. Riesgos residuales

- `verify_jwt=false` en varias Edge Functions (auth app-level).
- Rate limits en memoria: best-effort en serverless (múltiples instancias).
- Prompt injection / tools del copiloto (confirmación humana + permisos).
- Dependencias con advisories pendientes.
- CSP puede necesitar allowlist adicional según integraciones reales.

## 8. Checklist previo a despliegue

- [ ] Set `WHATSAPP_APP_SECRET` en Supabase secrets
- [ ] Set / verificar `WHATSAPP_DISPATCHER_SECRET` + Vault cron
- [ ] Redeploy Edge: webhook, dispatcher, invite-user, send-notification-email, ai-chat*
- [ ] Apply migraciones `20261103220000`, `20261103230000`, `20261103240000`
- [ ] Redeploy Vercel `dev`/prod (headers + gemini/demo rate + TTS)
- [ ] Opcional: `CORS_ALLOWED_ORIGINS` / `APP_BASE_URL` en Edge secrets
- [ ] Smoke: invite + reset password; comentario edit; mailer; asistente OKRS vs no-OKRS; demo form 429

## 9. Plan de rollback

1. Revertir commit(s) de Fase A/B o redesplegar revisión anterior.
2. HMAC: restaurar función previa solo temporalmente si Meta falla por App Secret.
3. Trigger pending ops: `DROP TRIGGER trg_assistant_pending_ops_guard_update` (emergencia).
4. CSP: quitar header CSP de `vercel.json` si bloquea assets críticos.
5. Comentarios RLS: restaurar policies previas solo si ops quedan bloqueados por `created_by` nulo histórico.

## 10. Próximo (post Fase B)

1. `verify_jwt` selectivo / checklist Edge (`S-EDGE-JWT-OFF`).
2. Triage `npm audit` y bumps.
3. Tests RLS en staging; sync `AUDITORIA_IA_WHATSAPP.md`.
4. Aplicar migraciones y secrets por entorno con orden explícito.
