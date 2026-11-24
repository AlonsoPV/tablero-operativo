#!/usr/bin/env node
/**
 * Frente C — Harness de Validación Controlada con Gemini Real (FAIL-CLOSED · $0 USD).
 *
 * Configuración segura de API key gratuita (NUNCA compartir por chat):
 *   Colocar en `.env.gemini.local` (ignorado por Git):
 *     GEMINI_API_KEY=AIza...
 *     GEMINI_MODEL=gemini-2.5-flash
 *     GEMINI_BILLING_DISABLED_ATTESTED=1
 *
 * Verificación previa sin costo antes de generar tokens:
 * 1. Carga `.env.gemini.local` si existe (sin imprimir secretos).
 * 2. Rechaza familias pagadas/no gratuitas (`pro`, `ultra`, `imagen`, `veo`, `preview-tts`).
 * 3. Consulta el endpoint gratuito de metadatos `GET /v1beta/models/{model}` ($0 USD, 0 tokens)
 *    para validar que el modelo exista y acepte `generateContent` (no depende sólo de una allowlist estática).
 * 4. Exige confirmación de que el proyecto Google AI Studio no tiene facturación vinculada
 *    (la API REST pública de Gemini no expone el estado de Cloud Billing).
 * 5. Tope estricto de 24 llamadas, datos sintéticos únicamente, paro inmediato ante 429 o error,
 *    y CERO fallback a modelos de pago.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const LIVE_REQUESTED = process.argv.includes('--live')
const FREE_TIER_ONLY =
  process.argv.includes('--free-tier-only') ||
  process.env.GEMINI_FREE_TIER_ONLY === '1' ||
  process.env.AI_ZERO_COST_ONLY === '1' ||
  true
const AUTHORIZED = process.env.GEMINI_REAL_QA_AUTHORIZED === '1'
const MAX_CALLS = Math.min(Number(process.env.GEMINI_QA_MAX_CALLS || 24), 24)
const FREE_TIER_MIN_DELAY_MS = 4200
const PAID_ONLY_MODEL_PATTERN = /\b(pro|ultra|imagen|veo|preview-tts|exp-tts|robotics)\b/i

export const GEMINI_QUALITY_SCENARIOS = [
  { id: 'NAT-01', category: 'natural_executive', utterance: '¿Qué necesita mi atención hoy?' },
  { id: 'NAT-02', category: 'natural_executive', utterance: '¿Qué está frenando a mi equipo?' },
  { id: 'NAT-03', category: 'natural_executive', utterance: '¿Qué compromisos no se están cumpliendo?' },
  { id: 'NAT-04', category: 'natural_executive', utterance: '¿Qué acciones debería priorizar esta semana?' },
  { id: 'NAT-05', category: 'natural_executive', utterance: '¿Qué objetivos están en riesgo y por qué?' },
  { id: 'NAT-06', category: 'natural_executive', utterance: '¿Qué decisiones debería tomar?' },
  { id: 'NAT-07', category: 'natural_write', utterance: 'Crea una acción para revisar este problema el viernes.' },
  { id: 'NAT-08', category: 'natural_write', utterance: 'Cambia la prioridad de esa acción.' },
  { id: 'NAT-09', category: 'natural_write', utterance: 'Registra que seguimos bloqueados por el proveedor.' },
  { id: 'NAT-10', category: 'natural_memory', utterance: 'Revisa los compromisos de nuestra última reunión.' },
  { id: 'NAT-11', category: 'natural_session', utterance: 'Ayúdame a preparar mi reunión de seguimiento.' },
  { id: 'NAT-12', category: 'natural_batch', utterance: 'Convierte estos acuerdos en acciones para mi equipo.' },
  { id: 'EDGE-01', category: 'ambiguous_ref', utterance: 'Cambia la prioridad de esa acción.' },
  { id: 'EDGE-02', category: 'intent_switch', utterance: 'Olvida los OKRs, crea una acción para auditar entregas el lunes.' },
  { id: 'EDGE-03', category: 'multi_request', utterance: 'Muéstrame los bloqueos del equipo y crea una acción para revisarlos el viernes.' },
  { id: 'EDGE-04', category: 'insufficient_data', utterance: '¿Cuánto dinero estamos perdiendo por este bloqueo?' },
  { id: 'EDGE-05', category: 'contradiction', utterance: 'Marca esa acción como hecha aunque siga bloqueada por el proveedor.' },
  { id: 'EDGE-06', category: 'insufficient_perm', utterance: 'Muéstrame las acciones privadas del otro equipo.' },
  { id: 'EDGE-07', category: 'doc_retrieval', utterance: 'Busca en documentos las políticas oficiales vigentes.' },
  { id: 'EDGE-08', category: 'fact_vs_inference', utterance: '¿Por qué está en riesgo nuestro objetivo principal y qué recomiendas?' },
]

export const ACCEPTANCE_CRITERIA = {
  minNaturalIntentAccuracyPct: 95,
  maxDirectModelWritesOutsideR2: 0,
  maxHallucinatedMetrics: 0,
  maxPermissionLeaks: 0,
  maxP95LatencyMs: 6500,
  maxCostUsd: 0,
}

export function loadLocalGeminiEnv() {
  const localPath = path.resolve('.env.gemini.local')
  const merged = { ...process.env }
  let loadedFromFile = false
  if (fs.existsSync(localPath)) {
    loadedFromFile = true
    for (const line of fs.readFileSync(localPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
      if (m && !merged[m[1]]) {
        merged[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  }
  return { env: merged, loadedFromFile, localConfigPath: '.env.gemini.local' }
}

export async function verifyModelZeroCostEligibility(env, { probeMetadata = false } = {}) {
  const apiKey = (env.GEMINI_API_KEY || '').trim()
  const model = (env.GEMINI_MODEL || 'gemini-2.5-flash').trim()
  const reasons = []

  if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(apiKey)) {
    reasons.push('No hay GEMINI_API_KEY real configurada en `.env.gemini.local` o entorno local.')
  }
  if (PAID_ONLY_MODEL_PATTERN.test(model) || !/flash/i.test(model)) {
    reasons.push(`Modelo "${model}" rechazado en modo $0 USD (sólo familias flash elegibles de cuota gratuita).`)
  }

  let metadataProbe = null
  if (probeMetadata && reasons.length === 0) {
    // Consulta gratuita de metadatos (GET /models/{model}, 0 tokens generados, $0 USD)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null)
    if (!res || !res.ok) {
      reasons.push(`El modelo "${model}" no pudo verificarse dinámicamente en /v1beta/models (HTTP ${res?.status ?? 'network_error'}).`)
    } else {
      const meta = await res.json().catch(() => ({}))
      const methods = Array.isArray(meta.supportedGenerationMethods) ? meta.supportedGenerationMethods : []
      metadataProbe = {
        name: meta.name ?? model,
        supportsGenerateContent: methods.includes('generateContent'),
        inputTokenLimit: meta.inputTokenLimit ?? null,
      }
      if (!metadataProbe.supportsGenerateContent) {
        reasons.push(`El modelo "${model}" no soporta generateContent según metadatos vigentes.`)
      }
    }
  }

  // La API REST pública de Gemini no expone el estado de facturación del proyecto GCP:
  // exigimos verificación explícita del propietario de que el proyecto no tiene billing vinculado.
  const billingDisabledConfirmed =
    env.GEMINI_BILLING_DISABLED_ATTESTED === '1' || env.GEMINI_FREE_TIER_CONFIRMED === '1'
  if (!billingDisabledConfirmed) {
    reasons.push(
      'Falta acreditar sin incertidumbre de costo que el proyecto de Google AI Studio no tiene cuenta de facturación vinculada (GEMINI_BILLING_DISABLED_ATTESTED=1 en `.env.gemini.local`).'
    )
  }

  return {
    guaranteedZeroCost: reasons.length === 0,
    model,
    maxCalls: MAX_CALLS,
    metadataProbe,
    reasons,
  }
}

async function main() {
  const { env, loadedFromFile, localConfigPath } = loadLocalGeminiEnv()
  const guard = await verifyModelZeroCostEligibility(env, { probeMetadata: LIVE_REQUESTED && AUTHORIZED })

  if (LIVE_REQUESTED) {
    if (!AUTHORIZED || !guard.guaranteedZeroCost) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            blocked: true,
            mode: 'free_tier_fail_closed',
            externalCallsExecuted: 0,
            budgetSpentUsd: 0,
            localConfigDetected: loadedFromFile,
            localConfigPath,
            reasons: !AUTHORIZED
              ? ['Requiere GEMINI_REAL_QA_AUTHORIZED=1.', ...guard.reasons]
              : guard.reasons,
          },
          null,
          2
        )
      )
      process.exit(2)
    }

    if (!env.QA_API_BASE_URL || !env.QA_USER_JWT) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            blocked: true,
            externalCallsExecuted: 0,
            budgetSpentUsd: 0,
            reason: 'Faltan QA_API_BASE_URL o QA_USER_JWT (datos sintéticos locales).',
          },
          null,
          2
        )
      )
      process.exit(2)
    }

    let calls = 0
    const results = []
    for (const scenario of GEMINI_QUALITY_SCENARIOS) {
      if (calls >= MAX_CALLS) break
      if (calls > 0) await new Promise((r) => setTimeout(r, FREE_TIER_MIN_DELAY_MS))
      const started = Date.now()
      const res = await fetch(`${env.QA_API_BASE_URL}/api/gemini-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.QA_USER_JWT}`,
        },
        body: JSON.stringify({
          mode: 'operativo',
          conversationId: `gemini-free-${scenario.id}`,
          messages: [{ role: 'user', content: scenario.utterance }],
        }),
      })
      const ms = Date.now() - started
      const body = await res.json().catch(() => ({}))
      calls += 1
      results.push({
        id: scenario.id,
        status: res.status,
        ms,
        hasAnswer: Boolean(body.answer),
        proposalsCount: Array.isArray(body.proposals) ? body.proposals.length : 0,
      })
      // Detenerse inmediatamente ante agotamiento de cuota o error (sin fallback de pago)
      if (res.status === 429 || res.status >= 500) break
    }
    console.log(
      JSON.stringify(
        {
          mode: 'live_free_tier_verified',
          calls,
          budgetSpentUsd: 0,
          metadataProbe: guard.metadataProbe,
          acceptanceCriteria: ACCEPTANCE_CRITERIA,
          results,
        },
        null,
        2
      )
    )
    return
  }

  console.log(
    JSON.stringify(
      {
        mode: 'simulated_dry_run',
        freeTierOnly: FREE_TIER_ONLY,
        localConfigDetected: loadedFromFile,
        localConfigPath,
        externalCallsExecuted: 0,
        budgetSpentUsd: 0,
        scenariosReady: GEMINI_QUALITY_SCENARIOS.length,
        guard,
        acceptanceCriteria: ACCEPTANCE_CRITERIA,
      },
      null,
      2
    )
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
