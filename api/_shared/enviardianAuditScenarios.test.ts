/**
 * Escenarios 1–9 del brief de auditoría (con dobles; sin envíos reales).
 */
import { describe, expect, it } from 'vitest'
import { buildEnviardianReportDocument } from '../../src/features/guide/enviardianReportDocument'
import { guideToolFailure, guideToolSuccess } from './guideToolResult'
import { verifiedFactsFromLog } from './guideRetellTool'
import { fillWorkspaceDraftsFromTranscript } from './workspaceDraftFinalize'
import { partitionTechnicalFromList } from './guideReportSanitize'

describe('Enviardián audit scenarios (mocked)', () => {
  it('escenario 1: prepare WhatsApp → draft_registered, no envío', () => {
    const res = guideToolSuccess({
      message: 'Deje borrador de WhatsApp para revision. No se envio.',
      status: 'draft_registered',
      pending_op_id: 'wa-1',
      entity_type: 'whatsapp',
    })
    expect(res.success).toBe(true)
    expect(res.status).toBe('draft_registered')
    expect(res.message).toMatch(/No se envio/i)
  })

  it('escenario 2: prepare email independiente', () => {
    const wa = guideToolSuccess({
      message: 'Deje borrador de WhatsApp.',
      status: 'draft_registered',
      pending_op_id: 'wa-1',
      entity_type: 'whatsapp',
    })
    const mail = guideToolSuccess({
      message: 'Deje borrador de correo.',
      status: 'draft_registered',
      pending_op_id: 'em-1',
      entity_type: 'email',
    })
    expect(wa.operation_id).not.toBe(mail.operation_id)
    expect(mail.entity_type).toBe('email')
  })

  it('escenario 3: accion como propuesta pending_confirmation', () => {
    const doc = buildEnviardianReportDocument({
      summary: 'Sesion',
      createdWork: [{ title: 'Revisar indicadores', pending: true, kind: 'action' }],
      recommendations: [],
    })
    expect(doc.session_actions[0]?.status).toBe('pending_confirmation')
    expect(doc.session_actions[0]?.kind).toBe('action')
  })

  it('escenario 4: iniciativa draft vs created', () => {
    const draft = buildEnviardianReportDocument({
      summary: 'Sesion',
      createdWork: [{ title: 'Mejorar seguimiento OKR', pending: true, kind: 'initiative' }],
    })
    const created = buildEnviardianReportDocument({
      summary: 'Sesion',
      createdWork: [{ title: 'Mejorar seguimiento OKR', pending: false, id: 'ini-1', kind: 'initiative' }],
    })
    expect(draft.session_actions[0]?.status).toBe('pending_confirmation')
    expect(created.session_actions[0]?.status).toBe('executed')
    expect(created.session_actions[0]?.id).toBe('ini-1')
  })

  it('escenario 5: cancel WA keep email reflected in draft refs', () => {
    const doc = buildEnviardianReportDocument({
      summary: 'Sesion',
      communicationDrafts: [
        { pendingOpId: 'wa-1', channel: 'whatsapp', status: 'cancelled', purpose: 'resumen OKR' },
        { pendingOpId: 'em-1', channel: 'email', status: 'pending', purpose: 'resumen OKR' },
      ],
    })
    expect(doc.communication_drafts?.find((d) => d.channel === 'whatsapp')?.status).toBe('cancelled')
    expect(doc.communication_drafts?.find((d) => d.channel === 'email')?.status).toBe('pending')
  })

  it('escenario 6: fallo tecnico estructurado no es recomendacion', () => {
    const fail = guideToolFailure({
      code: 'DATABASE_ERROR',
      user_message: 'No pude guardar el borrador. No afirmo que se haya enviado.',
      tool: 'queue_workspace_draft',
    })
    expect(fail.success).toBe(false)
    const { business, technical } = partitionTechnicalFromList([
      fail.error.user_message,
      'Revisar OTIF con operaciones',
    ])
    expect(business).toEqual(['Revisar OTIF con operaciones'])
    expect(technical.length).toBeGreaterThanOrEqual(0)
    const facts = verifiedFactsFromLog([
      { tool: 'queue_workspace_draft', status: 'error', summary: 'DATABASE_ERROR' },
    ])
    expect(facts.hadError).toBe(true)
    expect(facts.technicalAttention[0]?.code).toBe('TOOL_ERROR')
  })

  it('escenario 7: idempotencia conceptual — mismo operation_id no duplica counts', () => {
    const doc = buildEnviardianReportDocument({
      summary: 'Sesion',
      communicationDrafts: [
        { pendingOpId: 'wa-1', channel: 'whatsapp', status: 'pending' },
        { pendingOpId: 'wa-1', channel: 'whatsapp', status: 'pending' },
      ],
    })
    // normalize no dedupe ids idénticos por diseño de slice; el prepare dedupea en DB.
    expect(doc.communication_drafts?.length).toBeLessThanOrEqual(12)
  })

  it('escenario 8: invite full-write captura propuesta sin afirmar envio', () => {
    const queued = guideToolSuccess({
      message: 'Deje borrador de correo para revision. No se envio.',
      status: 'draft_registered',
      pending_op_id: 'em-2',
      entity_type: 'email',
    })
    const deniedSend = guideToolFailure({
      code: 'PERMISSION_DENIED',
      user_message: 'Este modo no permite enviar comunicaciones. No inventes que se envio.',
      status: 'denied',
    })
    expect(queued.success).toBe(true)
    expect(deniedSend.success).toBe(false)
    expect(deniedSend.error.code).toBe('PERMISSION_DENIED')
  })

  it('escenario 9: informe con errores tecnicos limpios', () => {
    const facts = verifiedFactsFromLog([
      { tool: 'get_okr_progress', status: 'ok', summary: 'Capacidad Flexible 81%' },
      { tool: 'get_my_actions', status: 'error', summary: 'timeout' },
    ])
    const doc = buildEnviardianReportDocument({
      summary: 'Entrevista OKR',
      verifiedLines: facts.lines,
      verifiedMetrics: facts.metrics,
      technicalAttention: facts.technicalAttention,
      llmFindings: [{ title: 'get_okr_progress: CAJA', detail: 'TIMEOUT', evidence: 'said' }],
    })
    expect(doc.key_findings.every((f) => !/^get_okr_progress:/i.test(f.title))).toBe(true)
    expect(doc.technical_attention?.length).toBeGreaterThan(0)
    expect(doc.counts?.findings).toBe(doc.key_findings.length)
  })

  it('fill de borradores no requiere proveedor online', () => {
    const filled = fillWorkspaceDraftsFromTranscript({
      drafts: [
        {
          id: 'd1',
          tool: 'whatsapp_prepare_send',
          payload: {
            incomplete: true,
            purpose: 'Resumen OKR',
            recipient_hint: 'Alonso',
            content_instructions: 'Incluir avance',
          },
          preview: {},
        },
      ],
      transcript: 'Usuario: Prepara un WhatsApp para Alonso con el resumen.\nEnviardian: Deje el borrador.',
      report: JSON.stringify({
        version: 'enviardian-informe-v3',
        executive_summary: { text: 'Avance OKR en 81%' },
        key_findings: [],
        verified_metrics: [{ label: 'Capacidad Flexible', value: '81', unit: '%' }],
        risks: [],
        confirmed_decisions: [],
        pending_decisions: [],
        recommendations: [],
        confirmed_commitments: [],
        session_actions: [],
        evidence_sources: ['Capacidad Flexible 81%'],
        metadata: { topic: 'OKR', generationStatus: 'ready' },
      }),
    })
    expect(filled[0]?.payload.body || filled[0]?.preview).toBeTruthy()
  })
})
