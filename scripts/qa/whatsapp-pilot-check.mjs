#!/usr/bin/env node
/**
 * SCRUMBAN — Preflight de Piloto Real WhatsApp con Único Número Autorizado ($0 USD).
 *
 * Verifica requisitos técnicos y salvaguardas sin enviar ningún mensaje real ni activar dispatchers.
 * Uso: node scripts/qa/whatsapp-pilot-check.mjs
 */
import fs from 'node:fs'

const env = process.env

const checks = [
  {
    id: 'dispatcher_disabled',
    ok: (env.WHATSAPP_DISPATCHER_ENABLED || '0') !== '1',
    detail: 'WHATSAPP_DISPATCHER_ENABLED debe permanecer en 0 hasta superar gates del piloto.',
  },
  {
    id: 'meta_test_phone_declared',
    ok: Boolean((env.WHATSAPP_PILOT_TEST_NUMBER || '').trim()),
    detail: 'Definir WHATSAPP_PILOT_TEST_NUMBER (único número en lista blanca de Meta Test Number).',
  },
  {
    id: 'meta_billing_zero_cost_verified',
    ok: env.WHATSAPP_ZERO_COST_CONFIRMED === '1',
    detail: 'Confirmar tarifas vigentes en Meta Business Manager antes de enviar (WHATSAPP_ZERO_COST_CONFIRMED=1).',
  },
  {
    id: 'server_stt_provider_ready',
    ok: Boolean(
      (env.LOCAL_STT_URL || '').trim() ||
        ((env.WHATSAPP_STT_URL || '').trim() && (env.WHATSAPP_STT_API_KEY || '').trim()) ||
        (env.GEMINI_API_KEY && !/disabled|placeholder/i.test(env.GEMINI_API_KEY))
    ),
    detail:
      'Configurar STT server-side para OGG/Opus: WHATSAPP_STT_URL + WHATSAPP_STT_API_KEY (p. ej. Whisper HTTP) o GEMINI_API_KEY autorizada.',
  },
  {
    id: 'r0_migration_present',
    ok: fs.existsSync('supabase/migrations/20261124120000_whatsapp_r0_checkpoint_p0001_and_reconciliation.sql'),
    detail: 'Migración R0 P0001 y reconciliación CAS presente en el repositorio.',
  },
]

const readyForAuthorizedLivePilot = checks.every((c) => c.ok)

console.log(
  JSON.stringify(
    {
      pilotMode: 'preflight_dry_run_only',
      externalMessagesSent: 0,
      externalPaidCalls: 0,
      readyForAuthorizedLivePilot,
      checks,
      testMatrix: [
        '1. Consulta texto natural + continuidad conversacional',
        '2. Nota de voz OGG/Opus -> descarga autorizada -> STT server-side -> respuesta',
        '3. Propuesta R2 con botones interactivos Confirmar / Editar / Cancelar',
        '4. Edición inline (invalidando versión previa) + confirmación vinculada',
        '5. Escritura real en QA y verificación de idempotencia ante reintento/duplicado',
        '6. Rechazo ante confirmación ambigua ("sí" suelto) y ante rol sin permiso',
      ],
    },
    null,
    2
  )
)
