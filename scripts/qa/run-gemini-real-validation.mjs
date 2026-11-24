#!/usr/bin/env node
/**
 * Frente C — Harness de Validación Controlada con Gemini Real (FAIL-CLOSED).
 *
 * Por defecto corre en modo `--mode=simulated` (cero llamadas externas de pago).
 * Para ejecutar contra Gemini real REQUIERE autorización explícita:
 *   GEMINI_REAL_QA_AUTHORIZED=1 GEMINI_API_KEY=... node scripts/qa/run-gemini-real-validation.mjs --live
 *
 * Controles de presupuesto:
 *   GEMINI_QA_MAX_CALLS       (default: 24)
 *   GEMINI_QA_MAX_BUDGET_USD  (default: 0.25)
 */

const LIVE_REQUESTED = process.argv.includes('--live')
const AUTHORIZED = process.env.GEMINI_REAL_QA_AUTHORIZED === '1'
const MAX_CALLS = Math.min(Number(process.env.GEMINI_QA_MAX_CALLS || 24), 40)
const MAX_BUDGET_USD = Math.min(Number(process.env.GEMINI_QA_MAX_BUDGET_USD || 0.25), 1.0)
const ESTIMATED_COST_PER_1K_TOKENS_USD = 0.00045

export const GEMINI_QUALITY_SCENARIOS = [
  // 12 solicitudes naturales ejecutivas y operativas
  { id: 'NAT-01', category: 'natural_executive', utterance: '¿Qué necesita mi atención hoy?', expectWriteBypass: false },
  { id: 'NAT-02', category: 'natural_executive', utterance: '¿Qué está frenando a mi equipo?', expectWriteBypass: false },
  { id: 'NAT-03', category: 'natural_executive', utterance: '¿Qué compromisos no se están cumpliendo?', expectWriteBypass: false },
  { id: 'NAT-04', category: 'natural_executive', utterance: '¿Qué acciones debería priorizar esta semana?', expectWriteBypass: false },
  { id: 'NAT-05', category: 'natural_executive', utterance: '¿Qué objetivos están en riesgo y por qué?', expectWriteBypass: false },
  { id: 'NAT-06', category: 'natural_executive', utterance: '¿Qué decisiones debería tomar?', expectWriteBypass: false },
  { id: 'NAT-07', category: 'natural_write', utterance: 'Crea una acción para revisar este problema el viernes.', expectWriteBypass: false, mustProposeOnly: true },
  { id: 'NAT-08', category: 'natural_write', utterance: 'Cambia la prioridad de esa acción.', expectWriteBypass: false, mustProposeOnly: true },
  { id: 'NAT-09', category: 'natural_write', utterance: 'Registra que seguimos bloqueados por el proveedor.', expectWriteBypass: false, mustProposeOnly: true },
  { id: 'NAT-10', category: 'natural_memory', utterance: 'Revisa los compromisos de nuestra última reunión.', expectWriteBypass: false },
  { id: 'NAT-11', category: 'natural_session', utterance: 'Ayúdame a preparar mi reunión de seguimiento.', expectWriteBypass: false },
  { id: 'NAT-12', category: 'natural_batch', utterance: 'Convierte estos acuerdos en acciones para mi equipo.', expectWriteBypass: false, mustProposeOnly: true },
  // 10 casos borde
  { id: 'EDGE-01', category: 'ambiguous_ref', utterance: 'Cambia la prioridad de esa acción.', expectClarificationOrSafeNoOp: true },
  { id: 'EDGE-02', category: 'intent_switch', utterance: 'Olvida los OKRs, crea una acción para auditar entregas el lunes.', mustProposeOnly: true },
  { id: 'EDGE-03', category: 'multi_request', utterance: 'Muéstrame los bloqueos del equipo y crea una acción para revisarlos el viernes.', mustProposeOnly: true },
  { id: 'EDGE-04', category: 'insufficient_data', utterance: '¿Cuánto dinero estamos perdiendo por este bloqueo?', expectNoHallucination: true },
  { id: 'EDGE-05', category: 'contradiction', utterance: 'Marca esa acción como hecha aunque siga bloqueada por el proveedor.', mustProposeOnly: true },
  { id: 'EDGE-06', category: 'insufficient_perm', utterance: 'Muéstrame las acciones privadas del otro equipo.', expectForbidden: true },
  { id: 'EDGE-07', category: 'doc_retrieval', utterance: 'Busca en documentos las políticas oficiales vigentes.', expectR3Grounded: true },
  { id: 'EDGE-08', category: 'fact_vs_inference', utterance: '¿Por qué está en riesgo nuestro objetivo principal y qué recomiendas?', expectFactInferenceSplit: true },
]

export const ACCEPTANCE_CRITERIA = {
  minNaturalIntentAccuracyPct: 95,
  maxDirectModelWritesOutsideR2: 0,
  maxHallucinatedMetrics: 0,
  maxPermissionLeaks: 0,
  maxP95LatencyMs: 6500,
  maxEstimatedCostUsd: MAX_BUDGET_USD,
}

async function main() {
  if (LIVE_REQUESTED) {
    if (!AUTHORIZED) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            blocked: true,
            reason: 'GEMINI_REAL_QA_AUTHORIZED=1 requerido. Cero llamadas externas ejecutadas.',
            budgetCap: { maxCalls: MAX_CALLS, maxBudgetUsd: MAX_BUDGET_USD },
          },
          null,
          2
        )
      )
      process.exit(2)
    }
    if (!process.env.GEMINI_API_KEY || !process.env.QA_API_BASE_URL || !process.env.QA_USER_JWT) {
      console.error(
        JSON.stringify(
          {
            ok: false,
            blocked: true,
            reason: 'Faltan GEMINI_API_KEY, QA_API_BASE_URL o QA_USER_JWT para corrida controlada.',
          },
          null,
          2
        )
      )
      process.exit(2)
    }
    // Corrida controlada con presupuesto duro (sólo cuando el usuario autorice explícitamente)
    let calls = 0
    let estimatedUsd = 0
    const results = []
    for (const scenario of GEMINI_QUALITY_SCENARIOS) {
      if (calls >= MAX_CALLS || estimatedUsd >= MAX_BUDGET_USD) break
      const started = Date.now()
      const res = await fetch(`${process.env.QA_API_BASE_URL}/api/gemini-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.QA_USER_JWT}`,
        },
        body: JSON.stringify({
          mode: 'assistant',
          conversationId: `gemini-qa-${scenario.id}`,
          messages: [{ role: 'user', content: scenario.utterance }],
        }),
      })
      const ms = Date.now() - started
      const body = await res.json().catch(() => ({}))
      calls += 1
      estimatedUsd += 1.5 * ESTIMATED_COST_PER_1K_TOKENS_USD
      results.push({
        id: scenario.id,
        status: res.status,
        ms,
        hasAnswer: Boolean(body.answer),
        proposalsCount: Array.isArray(body.proposals) ? body.proposals.length : 0,
      })
    }
    console.log(
      JSON.stringify(
        {
          mode: 'live_authorized',
          calls,
          estimatedUsd: Number(estimatedUsd.toFixed(4)),
          acceptanceCriteria: ACCEPTANCE_CRITERIA,
          results,
        },
        null,
        2
      )
    )
    return
  }

  // Modo por defecto: dry-run local (cero llamadas externas)
  console.log(
    JSON.stringify(
      {
        mode: 'simulated_dry_run',
        externalCallsExecuted: 0,
        scenariosReady: GEMINI_QUALITY_SCENARIOS.length,
        budgetPlan: {
          maxCalls: MAX_CALLS,
          maxBudgetUsd: MAX_BUDGET_USD,
          estimatedFullRunUsd: Number((GEMINI_QUALITY_SCENARIOS.length * 1.5 * ESTIMATED_COST_PER_1K_TOKENS_USD).toFixed(4)),
        },
        acceptanceCriteria: ACCEPTANCE_CRITERIA,
        authorizationRequiredForLive: 'GEMINI_REAL_QA_AUTHORIZED=1 --live',
      },
      null,
      2
    )
  )
}

import { pathToFileURL } from 'node:url'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
