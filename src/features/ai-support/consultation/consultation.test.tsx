import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { AccionDiaria } from '@/types'
import type { OkrData } from '@/features/okrs/model'
import { AssistantMessageBody } from '@/features/ai-support/components/AssistantMessageBody'
import { AssistantReplyViews } from '@/features/ai-support/chatViews'
import type { AssistantUiPayload } from '@/features/ai-support/chatViews/types'
import { sliceContextForIntent } from '@/features/ai-support/operationalContext/sliceContextForIntent'
import { buildOperationalSnapshot } from '@/features/ai-support/operationalContext/buildOperationalSnapshot'
import { detectAssistantIntent } from '@/features/ai-support/operationalContext/detectAssistantIntent'
import { resolveAssistantTurn } from './answerConsultation'

function action(
  partial: Partial<AccionDiaria> & Pick<AccionDiaria, 'id' | 'titulo_accion' | 'responsable'>
): AccionDiaria {
  return {
    fecha: '2026-11-03',
    descripcion_accion: '',
    hora_limite: '18:00',
    evidencia_esperada: '',
    evidencia_cargada: false,
    evidencia_adjunta: null,
    estado: 'Pendiente',
    kpi_afectado: null,
    tipo_accion: 'operativa',
    story_points: 1,
    okr_impactado: null,
    proceso: null,
    area: 'Operaciones',
    cliente_id: null,
    prioridad: 'P2',
    causa_raiz: null,
    responsable_bloqueo: null,
    escalado: false,
    fecha_escalamiento: null,
    notas_escalamiento: null,
    repeticion: false,
    verificador_dato: null,
    verificador_gobierno: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-11-03T12:00:00Z',
    ...partial,
  }
}

function kr(id: string, okrId: string, current: number): OkrData['keyResults'][number] {
  return {
    id,
    okr_id: okrId,
    title: id,
    baseline_value: 0,
    target_value: 100,
    current_value: current,
    owner_user_id: null,
    unit: '%',
    metric_type: 'percent',
    can_update: false,
  }
}

const okrData: OkrData = {
  objectives: [
    {
      id: 'slow',
      nombre_okr: 'Entrega',
      descripcion: null,
      scope: 'company',
      area_id: null,
      owner_user_id: 'u1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      activo: true,
      can_manage: false,
    },
    {
      id: 'fast',
      nombre_okr: 'Cobertura',
      descripcion: null,
      scope: 'company',
      area_id: null,
      owner_user_id: 'u1',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      activo: true,
      can_manage: false,
    },
  ],
  keyResults: [kr('kr-slow', 'slow', 20), kr('kr-fast', 'fast', 80)],
  initiatives: [{ id: 'ini-1', key_result_id: 'kr-slow', action_id: null, team_action_id: null }],
  checkIns: [],
  users: [],
  areas: [],
  can_manage_company: false,
}

function snapshot(options: { canSeeOkrs?: boolean; okr?: OkrData | null } = {}) {
  return buildOperationalSnapshot({
    usuarioId: 'u1',
    rol: 'Operativo',
    areas: ['Operaciones'],
    seesAllBoard: false,
    canSeeOkrs: options.canSeeOkrs ?? true,
    openActions: [
      action({ id: '1', titulo_accion: 'Cerrar POD', responsable: 'u1', estado: 'Retraso', fecha: '2026-11-01' }),
    ],
    pendingVerificationActions: [],
    priorities: [],
    okrData: options.okr === undefined ? okrData : options.okr,
    today: '2026-11-03',
    fetchedAt: '2026-11-03T18:00:00.000Z',
    nowMs: Date.parse('2026-11-03T18:00:00Z'),
  })
}

function viewsOf(ui: AssistantUiPayload | undefined) {
  return ui?.views.map((view) => view.type) ?? []
}

/** Misma elección de componente que el hilo del asistente. */
function markup(content: string, ui: AssistantUiPayload | undefined) {
  if (ui?.views.length) {
    return renderToStaticMarkup(
      <MemoryRouter>
        <AssistantReplyViews ui={ui} narrative={content} />
      </MemoryRouter>
    )
  }
  return renderToStaticMarkup(<AssistantMessageBody content={content} />)
}

function ask(message: string, data = snapshot(), prior: string[] = []) {
  const turn = resolveAssistantTurn({ message, snapshot: data, priorUserMessages: prior })
  expect(turn.handled).toBe(true)
  expect(turn.content).toBeTruthy()
  return turn
}

describe('consulta integral del asistente', () => {
  it('1 · «¿Qué es un OKR?» explica y no renderiza tarjetas', () => {
    expect(detectAssistantIntent('¿Qué es un OKR?')).toBe('concept')
    const turn = ask('¿Qué es un OKR?')
    expect(turn.content).toMatch(/objetivo con resultados medibles/i)
    expect(turn.content).not.toMatch(/Entrega|Cobertura|%/)
    expect(viewsOf(turn.ui)).toEqual([])
    const html = markup(turn.content!, turn.ui)
    expect(html).toMatch(/resultados medibles/)
    expect(html).not.toMatch(/Entrega|Cobertura|Avance de/)
    expect(sliceContextForIntent(snapshot(), 'concept').includeOkrs).toBe(false)
    expect(sliceContextForIntent(snapshot(), 'concept').boardContext?.okrs).toBeNull()
  })

  it('2 · «¿Cuáles son nuestros OKRs?» lista solo los autorizados', () => {
    const turn = ask('¿Cuáles son nuestros OKRs?')
    expect(turn.content).toMatch(/OKR/i)
    expect(viewsOf(turn.ui)).toContain('okr_list')
    const html = markup(turn.content!, turn.ui)
    expect(html).toContain('Entrega')
    expect(html).toContain('Cobertura')
    expect(html).toContain('20%')
    expect(html).toContain('80%')
  })

  it('3 · «¿Cómo vamos con los objetivos?» analiza el avance', () => {
    const turn = ask('¿Cómo vamos con los objetivos?')
    expect(turn.content).toMatch(/pide más atención es «Entrega»/)
    expect(turn.content).toContain('20%')
    expect(viewsOf(turn.ui)).toEqual(expect.arrayContaining(['brief', 'okr_list', 'recommendation']))
    const html = markup(turn.content!, turn.ui)
    expect(html).toContain('Entrega')
    expect(html).toContain('Bajo 40%')
  })

  it('4 · «¿Qué iniciativas están atrasadas?» declara el límite y no inventa el atraso', () => {
    const turn = ask('¿Qué iniciativas están atrasadas?')
    expect(turn.content).toMatch(/no marco iniciativas como atrasadas/i)
    expect(turn.content).toMatch(/no dice que una iniciativa esté atrasada/i)
    expect(turn.content).not.toMatch(/ini-1/)
    expect(viewsOf(turn.ui)).toContain('brief')
    expect(markup(turn.content!, turn.ui)).toMatch(/Sin estado de atraso por iniciativa/)
  })

  it('5 · «¿Qué acciones tengo pendientes?» lista acciones, no OKRs', () => {
    const turn = ask('¿Qué acciones tengo pendientes?')
    expect(turn.content).toMatch(/acciones abiertas/i)
    expect(viewsOf(turn.ui)).toContain('action_list')
    expect(viewsOf(turn.ui)).not.toContain('okr_list')
    const list = turn.ui?.views.find((view) => view.type === 'action_list')
    expect(list?.type === 'action_list' && list.actions.some((row) => row.title === 'Cerrar POD')).toBe(true)
    expect(markup(turn.content!, turn.ui)).toContain('Cerrar POD')
  })

  it('6 · «¿Qué deberíamos priorizar?» propone sin ejecutar', () => {
    const turn = ask('¿Qué deberíamos priorizar?')
    expect(turn.content).toMatch(/propuesta|no actualicé ni creé/i)
    expect(turn.content).toContain('Cerrar POD')
    expect(viewsOf(turn.ui)).not.toContain('okr_list')
    expect(markup(turn.content!, turn.ui)).toMatch(/No creé ni actualicé/)
  })

  it('7 · una conversación pasa de explicar a consultar, analizar y proponer', () => {
    const data = snapshot()
    const prior: string[] = []
    const lines = [
      '¿Qué es un OKR?',
      '¿Y cuáles tenemos actualmente?',
      '¿Cuál necesita más atención?',
      '¿Qué podemos hacer para mejorarlo?',
    ]
    const turns = lines.map((line) => {
      const turn = ask(line, data, prior)
      prior.push(line)
      return turn
    })
    expect(viewsOf(turns[0]!.ui)).toEqual([])
    expect(turns[0]!.content).toMatch(/resultados medibles/)
    expect(turns[0]!.content).not.toContain('Entrega')
    expect(viewsOf(turns[1]!.ui)).toContain('okr_list')
    expect(markup(turns[1]!.content!, turns[1]!.ui)).toContain('Entrega')
    expect(turns[2]!.content).toMatch(/Entrega/)
    expect(turns[2]!.content).toContain('20%')
    expect(turns[3]!.content).toMatch(/Propuesta, sin ejecutar/)
    expect(turns[3]!.content).toMatch(/Entrega/)
    expect(turns[3]!.content).toMatch(/No creé ni actualicé/)
    expect(viewsOf(turns[3]!.ui)[0]).toBe('recommendation')
  })

  it('8 · sin permiso no muestra objetivos', () => {
    const hidden = snapshot({ canSeeOkrs: false })
    expect(hidden.board.okrs).toBeNull()
    const turn = ask('¿Cuáles son nuestros OKRs?', hidden)
    expect(turn.content).toMatch(/no tienes acceso a OKRs/i)
    expect(turn.content).not.toMatch(/Entrega|Cobertura/)
    expect(viewsOf(turn.ui)).toEqual(['empty'])
    expect(markup(turn.content!, turn.ui)).not.toContain('Entrega')
    const explained = ask('¿Qué es un OKR?', hidden)
    expect(explained.content).toMatch(/resultados medibles/)
    expect(viewsOf(explained.ui)).toEqual([])
  })

  it('9 · sin datos no inventa objetivos', () => {
    const empty = snapshot({
      okr: {
        ...okrData,
        objectives: [],
        keyResults: [],
        initiatives: [],
      },
    })
    const turn = ask('¿Cuáles son nuestros OKRs?', empty)
    expect(turn.content).toMatch(/no hay OKRs/i)
    expect(turn.content).not.toMatch(/Entrega|Cobertura/)
    expect(viewsOf(turn.ui)).toEqual(['empty'])
  })

  it('10 · la pregunta conceptual no dispara la lista de negocio', () => {
    const turn = ask('¿Qué significa KR?')
    expect(detectAssistantIntent('¿Qué significa KR?')).toBe('concept')
    expect(turn.content).toMatch(/resultado clave/i)
    expect(turn.content).not.toMatch(/Entrega|%|Cerrar POD/)
    expect(viewsOf(turn.ui)).toEqual([])
    expect(markup(turn.content!, turn.ui)).not.toContain('Entrega')
  })
})
