import { describe, expect, it } from 'vitest'
import { buildActiveQueryEntry, populationLabel } from './actionQueryContract.js'
import { interpretOperationalMessage } from './operationalInterpret.js'
import {
  OPERATIONAL_AUDIT_MATRIX,
  OPERATIONAL_DICTIONARY_VERSION,
  findTermsInText,
} from './operationalDictionary.js'
import { classifyCreateWorkKind } from '../../src/features/ai-support/operationalSemantics/classifyCreateWork.js'

describe('operationalDictionary SSOT', () => {
  it('exposes versioned audit matrix covering kanban and okrs', () => {
    expect(OPERATIONAL_DICTIONARY_VERSION).toMatch(/^ops-dict-/)
    expect(OPERATIONAL_AUDIT_MATRIX.some((r) => r.entityId === 'kanban_action')).toBe(true)
    expect(OPERATIONAL_AUDIT_MATRIX.some((r) => r.entityId === 'okr_initiative')).toBe(true)
    expect(findTermsInText('mis acciones en rojo').map((t) => t.id)).toEqual(
      expect.arrayContaining(['kanban_action', 'visual_board_red', 'role_responsable'])
    )
  })
})

describe('interpretOperationalMessage', () => {
  it('1–4 personales: mis / creé / equipo / rojo coloquial', () => {
    const mine = interpretOperationalMessage('Cuantas acciones tengo abiertas?')
    expect(mine.intent).toBe('query')
    expect(mine.toolHint).toBe('get_my_actions')
    expect(mine.filters?.scope).toBe('assigned_to_me')
    expect(populationLabel(mine.filters!.scope!)).toBe('responsable_actual')

    const created = interpretOperationalMessage('Cuantas acciones cree yo?')
    expect(created.filters?.scope).toBe('created_by_me')

    const team = interpretOperationalMessage('Muestrame las de todo el equipo')
    expect(team.filters?.scope).toBe('team_authorized')
    expect(team.identity.kind).toBe('team')

    const red = interpretOperationalMessage('Cuantas estan en rojo?', {
      activeQuery: buildActiveQueryEntry({
        scope: 'assigned_to_me',
        status_group: 'open',
        visual: 'none',
      }),
    })
    expect(red.filters?.scope).toBe('assigned_to_me')
    expect(red.filters?.visual).toBe('board_red')
  })

  it('5–6 priority_red vs board_red', () => {
    const pr = interpretOperationalMessage('Que acciones tienen prioridad roja?')
    expect(pr.filters?.visual).toBe('priority_red')
    const br = interpretOperationalMessage('Las rojas')
    expect(br.filters?.visual).toBe('board_red')
  })

  it('7–9 tarea vs iniciativa vs aclaración', () => {
    const task = interpretOperationalMessage('Crea una tarea para cerrar OTIF')
    expect(task.intent).toBe('propose_create_kanban')
    expect(task.toolHint).toBe('create_action')

    const init = interpretOperationalMessage('Registra una iniciativa de OTIF')
    expect(init.intent).toBe('propose_create_initiative')
    expect(init.toolHint).not.toBe('create_action')

    const amb = interpretOperationalMessage('Genera una accion para el objetivo de entrega perfecta')
    expect(amb.intent).toBe('clarify')
    expect(amb.ambiguity?.question).toMatch(/Kanban|OKR/i)
  })

  it('10–12 responsable / creador / verificador', () => {
    expect(interpretOperationalMessage('De cuales soy responsable?').filters?.scope).toBe(
      'assigned_to_me'
    )
    expect(interpretOperationalMessage('Las que solicite').filters?.scope).toBe('created_by_me')
    expect(interpretOperationalMessage('Que acciones verifico?').filters?.status_group).toBe(
      'verification'
    )
  })

  it('13–16 contexto + cambio de filtros', () => {
    const active = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const list = interpretOperationalMessage('Cuales son?', { activeQuery: active })
    expect(list.filters).toMatchObject({
      scope: 'assigned_to_me',
      visual: 'board_red',
      status_group: 'open',
    })
    expect(list.filters?.limit).toBe(12)

    const overdue = interpretOperationalMessage('Cuales estan vencidas?', { activeQuery: active })
    expect(overdue.filters?.scope).toBe('assigned_to_me')
    expect(overdue.filters?.visual).toBe('overdue')
  })

  it('17–18 prepare WA/email', () => {
    const wa = interpretOperationalMessage('Prepara un WhatsApp para Gerardo')
    expect(wa.intent).toBe('prepare_comms')
    expect(wa.toolHint).toBe('queue_workspace_draft')

    const mail = interpretOperationalMessage('Redactame un correo para el director')
    expect(mail.intent).toBe('prepare_comms')
  })

  it('19–22 ambigüedad / no mezclar módulos', () => {
    const askChannel = interpretOperationalMessage('Prepara un mensaje para Carlos')
    expect(askChannel.intent).toBe('prepare_comms')
    expect(askChannel.ambiguity?.question).toMatch(/WhatsApp|correo/i)

    const bau = interpretOperationalMessage('Dame el resumen del dashboard')
    expect(bau.toolHint).toBe('get_dashboard_summary')
    expect(bau.module).toBe('org')

    const personal = interpretOperationalMessage('Cuantas acciones tengo?')
    expect(personal.toolHint).toBe('get_my_actions')
    expect(personal.toolHint).not.toBe('get_dashboard_summary')
  })
})

describe('classifyCreateWorkKind (chat)', () => {
  it('distinguishes kanban vs initiative', () => {
    expect(classifyCreateWorkKind('Crea una accion para cerrar evidencias')).toBe('kanban')
    expect(classifyCreateWorkKind('Generame una iniciativa de OTIF')).toBe('initiative')
    expect(classifyCreateWorkKind('Genera una accion para el objetivo X')).toBe('clarify')
  })
})
