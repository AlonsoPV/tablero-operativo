# SCRUMBAN — Existing WhatsApp Production Upgrade (Grupo A Selectivo)

## 1. Flujo real existente en Production (verificado en `origin/main`)

```
Meta Cloud API
  → POST/GET https://xhpasmjzuwifmjhrsumb.supabase.co/functions/v1/whatsapp-webhook
      • Valida hub.verify_token (WHATSAPP_VERIFY_TOKEN en Supabase Edge)
      • Valida X-Hub-Signature-256 (WHATSAPP_APP_SECRET en Supabase Edge)
      • Identifica usuario (wa_id ↔ usuarios.id activo) y deduplica/persiste en public.whatsapp_messages
      • Verifica permiso vía RPC public.can_use_ai_whatsapp_for_usuario(p_usuario_id)
      • Si WHATSAPP_AI_ENABLED está activo: invoca POST ${APP_URL}/api/whatsapp-assistant
        con header x-whatsapp-assistant-secret (WHATSAPP_ASSISTANT_SECRET)
  → Vercel tablero-operativo (/api/whatsapp-assistant)
      • Revalida secreto (timingSafeEqual), rate limit, can_use_ai_whatsapp_for_usuario y usuarios.activo
      • Ejecuta orquestador unificado R1/R3 (o fallback legacy Gemini read-only con GEMINI_API_KEY/GEMINI_MODEL)
      • Devuelve { text } <= 900 chars
  → Supabase Edge envía respuesta vía Meta Graph API (graph.facebook.com/{version}/{phoneNumberId}/messages)
    y persiste outbound en public.whatsapp_messages
```

## 2. Separación estricta en 3 grupos

- **Grupo A (ESTE CANDIDATO — 100% compatible con esquema actual, solo lectura, $0 USD):**
  - Actualiza exclusivamente Vercel (`/api/whatsapp-assistant` + `whatsappPilotGate.ts` + `whatsappFormat.ts` + `channelAdapters.ts` + `intent.ts` + base `a078a4f` Executive MVP + Lean Build `11/12` funciones).
  - **0 migraciones SQL**, **0 cambios en Meta/teléfono/webhook**, **0 cambios en Supabase Edge**, **0 escrituras R2**, **0 dispatcher**, **0 cambios en R4**.
  - Compatibilidad con R3: usa `agent_memory` y `agent_documents` ya existentes en Production respetando `AGENT_MEMORY_R3` (`0` o `1`).
- **Grupo B (desactivado en este candidato — multimedia / notas de voz):**
  - `api/_shared/audioTranscription.ts` ya soporta `audio/ogg; codecs=opus` con el `GEMINI_API_KEY` existente (`gemini-2.5-flash`), sin requerir otra API key salvo restricción de cuota/billing.
  - Permanece desactivado porque `supabase/functions/whatsapp-webhook` en Production actualmente enruta `audio` sólo a `handleEvidence` (requiere deploy selectivo de Edge + verificación de cuota/billing de `GEMINI_API_KEY`). **No bloquea el lanzamiento por texto.**
- **Grupo C (desactivado en este candidato — migraciones R0/R2, escrituras y proactivo):**
  - `20261120120000_agent_apply_action_status.sql` (R2), `20261124120000_whatsapp_r0_checkpoint_p0001_and_reconciliation.sql` (P0001/reconciliación), botones interactivos/confirmación/edición/cancelación R2 y resumen diario proactivo.
  - Quedan en `feature/multichannel-release` hasta validar migraciones y escrituras en aislamiento.

## 3. Activación selectiva por usuario y Rollback (< 10 s)

Variables en Vercel (`tablero-operativo`, `target=["production"]`):
- `WHATSAPP_CONVERSATIONAL_PILOT_ENABLED=1`
- `WHATSAPP_CONVERSATIONAL_PILOT_USERS=<usuario_id_uuid_autorizado>` (1 usuario explícito; rechaza comodines `*`)
- Mantener: `AGENT_ORCHESTRATOR_R1=0` (hasta `2026-11-25T06:02:30Z`), `AGENT_MEMORY_R3=0`, `R2` desactivado, `WHATSAPP_DISPATCHER_ENABLED=0`.

**Rollback inmediato:** Cambiar `WHATSAPP_CONVERSATIONAL_PILOT_ENABLED=0` (o vaciar `WHATSAPP_CONVERSATIONAL_PILOT_USERS`) y redeploy/revertir en Vercel. Todos los demás usuarios nunca dejan el flujo legacy.

## 4. Verificación Supabase sin depender del conector MCP

Desde terminal local (opción CLI):
```bash
npx supabase login
npx supabase migration list --project-ref xhpasmjzuwifmjhrsumb
```

O en **Supabase Dashboard → SQL Editor (`xhpasmjzuwifmjhrsumb`, solo lectura)**:
```sql
-- 1. Confirmar migraciones R1/R3 aplicadas
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20261119120000','20261119135000','20261119136000',
  '20261119140000','20261119150000','20261121150601'
)
ORDER BY version;

-- 2. Confirmar RPC de permisos WhatsApp y estado del usuario piloto (sin exponer teléfonos completos)
SELECT id, rol, activo, public.can_use_ai_whatsapp_for_usuario(id) AS wa_ai_allowed
FROM public.usuarios
WHERE activo = true AND public.can_use_ai_whatsapp_for_usuario(id) = true
ORDER BY rol, id;
```
