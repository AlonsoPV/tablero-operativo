import { describe, expect, it } from 'vitest'
import { classifyAgentIntent } from './orchestrator/intent.js'
import {
  buildProposalBinding,
  formatWhatsAppProposalPrompt,
  parseWhatsAppApprovalIntent,
  resolveWhatsAppProposalApproval,
} from './whatsappR2Adapter.js'
import {
  evaluateProactiveFollowup,
  planGroupedProactiveDigest,
  PROACTIVE_CATEGORIES,
  type ProactiveCandidate,
  type ProactiveUserPreferences,
} from './whatsappProactive.js'

const BASE_PREFS: ProactiveUserPreferences = {
  usuarioId: 'u-dir-1',
  waId: '5215511112222',
  active: true,
  consent: true,
  timezone: 'America/Mexico_City',
  windowStartHour: 8,
  windowEndHour: 19,
  allowedWeekdays: [1, 2, 3, 4, 5],
  enabledCategories: new Set(PROACTIVE_CATEGORIES),
  maxPerDay: 5,
  minIntervalMinutes: 30,
}

describe('WhatsApp First — B1 conversational intents', () => {
  const cases: Array<[string, string]> = [
    ['¿Qué tengo pendiente hoy?', 'query_actions'],
    ['¿Qué está bloqueando a mi equipo?', 'query_actions'],
    ['¿Quién tiene acciones vencidas?', 'aggregate_execution'],
    ['¿Qué objetivos están en riesgo?', 'analyze_risk'],
    ['¿Qué necesita mi atención?', 'executive_brief'],
    ['¿Qué acordamos en la última reunión?', 'executive_commitments'],
    ['¿Cómo vamos con el proveedor?', 'query_actions'],
    ['¿Qué debería priorizar esta semana?', 'executive_brief'],
  ]

  for (const [utterance, expectedKind] of cases) {
    it(`classifies "${utterance}" as ${expectedKind}`, () => {
      const intent = classifyAgentIntent(utterance)
      expect(intent.kind).toBe(expectedKind)
    })
  }
})

describe('WhatsApp First — B2 structured proposals and unambiguous confirmation', () => {
  it('renders structured fields, rejects loose "sí", and binds exact version code', () => {
    const binding = buildProposalBinding({
      proposalId: 'op-100',
      usuarioId: 'u-lider-1',
      operation: 'agent_create_action',
      scope: 'agent_create_action',
      summary: 'Crear acción: Revisar problema con proveedor',
      payload: { titulo_accion: 'Revisar problema con proveedor', fecha_compromiso: '2026-11-27' },
      expiresAt: '2026-11-25T23:00:00Z',
    })

    const prompt = formatWhatsAppProposalPrompt(binding, {
      executionMode: 'qa',
      proposal: {
        id: 'op-100',
        tool: 'agent_create_action',
        title: 'Crear acción',
        summary: 'Revisar problema con proveedor',
        fields: [
          { label: 'Acción', to: 'Revisar problema con proveedor' },
          { label: 'Responsable', to: 'Líder Operaciones' },
          { label: 'Fecha', to: '2026-11-27' },
          { label: 'Prioridad', to: 'Alta' },
        ],
        expiresAt: '2026-11-25T23:00:00Z',
        status: 'pending',
      },
    })

    expect(prompt).toContain('Acción: Revisar problema con proveedor')
    expect(prompt).toContain('Responsable: Líder Operaciones')
    expect(prompt).toContain('Fecha: 2026-11-27')
    expect(prompt).toContain('Prioridad: Alta')
    expect(prompt).toContain(`confirmar ${binding.version}`)
    expect(prompt).toContain(`cancelar ${binding.version}`)

    // Un "sí" suelto NUNCA ejecuta cambios
    const looseYes = parseWhatsAppApprovalIntent({ text: 'sí' })
    const res = resolveWhatsAppProposalApproval({
      actorUsuarioId: 'u-lider-1',
      actorActive: true,
      pending: [binding],
      decision: looseYes,
      executionMode: 'qa',
      nowMs: Date.parse('2026-11-24T22:00:00Z'),
    })
    expect(res.status).toBe('ambiguous')

    // Confirmación inequívoca con código exacto sí autoriza
    const exactConfirm = parseWhatsAppApprovalIntent({ text: `confirmar ${binding.version}` })
    const okRes = resolveWhatsAppProposalApproval({
      actorUsuarioId: 'u-lider-1',
      actorActive: true,
      pending: [binding],
      decision: exactConfirm,
      executionMode: 'qa',
      nowMs: Date.parse('2026-11-24T22:00:00Z'),
    })
    expect(okRes.status).toBe('ready_to_execute')
  })
})

describe('WhatsApp First — B4 proactive follow-ups (8 categories, grouping, $0 cost control)', () => {
  const candidates: ProactiveCandidate[] = [
    {
      category: 'daily_summary',
      usuarioId: 'u-dir-1',
      entityId: 'sum-1',
      title: '3 prioridades hoy',
      detail: '2 bloqueos y 1 entrega crítica.',
      dateBucket: '2026-11-24',
    },
    {
      category: 'overdue_alert',
      usuarioId: 'u-dir-1',
      entityId: 'act-1',
      title: 'Cierre proveedor empaque',
      detail: 'Vencida hace 2 días (Operaciones).',
      dateBucket: '2026-11-24',
    },
    {
      category: 'stale_blocker',
      usuarioId: 'u-dir-1',
      entityId: 'blk-1',
      title: 'Aprobación aduana',
      detail: 'Sin movimiento en 72 horas.',
      dateBucket: '2026-11-24',
    },
    {
      category: 'okr_risk_alert',
      usuarioId: 'u-dir-1',
      entityId: 'okr-1',
      title: 'Entregas a tiempo 95%',
      detail: 'Avance 42% vs ritmo esperado 68%.',
      dateBucket: '2026-11-24',
    },
  ]

  it('covers all 8 required proactive categories and attaches concrete suggested actions in dry-run', () => {
    expect(PROACTIVE_CATEGORIES).toEqual(
      expect.arrayContaining([
        'daily_summary',
        'due_reminder',
        'overdue_alert',
        'stale_blocker',
        'pending_verification',
        'agreement_followup',
        'weekly_executive_summary',
        'okr_risk_alert',
      ])
    )
    const decision = evaluateProactiveFollowup(candidates[1]!, BASE_PREFS, {
      nowIso: '2026-11-24T16:00:00Z', // 10:00 CDMX Tuesday
      lastInboundAt: '2026-11-24T12:00:00Z',
      sentTodayCount: 0,
      sentDedupeKeys: new Set(),
    })
    expect(decision.allowed).toBe(true)
    expect(decision.dryRun).toBe(true)
    if (decision.allowed) {
      expect(decision.bodyText).toContain('Acción sugerida:')
      expect(decision.transport).toBe('session_text')
    }
  })

  it('groups multiple eligible alerts into one scannable <=900-char dry-run digest', () => {
    const digest = planGroupedProactiveDigest(candidates, BASE_PREFS, {
      nowIso: '2026-11-24T16:00:00Z',
      lastInboundAt: '2026-11-24T12:00:00Z',
      sentTodayCount: 0,
      sentDedupeKeys: new Set(),
    })
    expect(digest.dryRun).toBe(true)
    expect(digest.allowed).toBe(true)
    expect(digest.includedCount).toBe(4)
    expect(digest.bodyText).not.toBeNull()
    expect(digest.bodyText!.length).toBeLessThanOrEqual(900)
  })

  it('blocks paid outside-24h templates when zeroCostOnly is enabled', () => {
    const decision = evaluateProactiveFollowup(candidates[3]!, BASE_PREFS, {
      nowIso: '2026-11-24T16:00:00Z',
      lastInboundAt: '2026-11-20T12:00:00Z', // >24h
      sentTodayCount: 0,
      sentDedupeKeys: new Set(),
      approvedTemplates: { okr_risk_alert: { name: 'scrumban_okr_risk', language: 'es_MX' } },
      costControl: { zeroCostOnly: true },
    })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reason).toBe('cost_cap_exceeded')
    }
  })
})
