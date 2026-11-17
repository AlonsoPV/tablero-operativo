import { describe, expect, it } from 'vitest'
import {
  actionMatchesVisual,
  buildActiveQueryEntry,
  canUseWideActionScope,
  isPersonalActionScope,
  maybeRewriteWideToolToMyActions,
  mergeActionQueryArgs,
  parseActionQueryScope,
  parseActionQueryVisual,
  populationLabel,
  readLatestActiveQuery,
} from './actionQueryContract.js'

describe('actionQueryContract', () => {
  it('defaults scope to assigned_to_me and population personal', () => {
    expect(parseActionQueryScope(undefined)).toBe('assigned_to_me')
    expect(populationLabel('assigned_to_me')).toBe('responsable_actual')
    expect(populationLabel('board_authorized')).toBe('tablero_autorizado')
  })

  it('maps "rojo" visual aliases to board_red', () => {
    expect(parseActionQueryVisual('rojo')).toBe('board_red')
    expect(parseActionQueryVisual('board_red')).toBe('board_red')
    expect(parseActionQueryVisual('priority_red')).toBe('priority_red')
  })

  it('gates wide scopes by role / boardScope', () => {
    expect(canUseWideActionScope('assigned_to_me', { rol: 'Analista' })).toBe(true)
    expect(canUseWideActionScope('board_authorized', { rol: 'Analista' })).toBe(false)
    expect(
      canUseWideActionScope('board_authorized', { rol: 'Analista', boardScope: 'organization' })
    ).toBe(true)
    expect(canUseWideActionScope('team_authorized', { rol: 'Director' })).toBe(true)
  })

  it('board_red matches priority rojo OR Retraso/overdue like the UI', () => {
    const priorities = [{ id: 'p1', nombre: 'P1_Critica', color: 'rojo', activo: true }]
    const redPriority = {
      id: 'a1',
      estado: 'Pendiente',
      fecha: '2099-01-01',
      prioridad: 'P1_Critica',
      prioridad_id: 'p1',
    }
    const overdue = {
      id: 'a2',
      estado: 'Retraso',
      fecha: '2020-01-01',
      prioridad: 'P3_Baja',
    }
    const green = {
      id: 'a3',
      estado: 'Pendiente',
      fecha: '2099-01-01',
      prioridad: 'P3_Baja',
    }
    expect(actionMatchesVisual(redPriority, 'board_red', priorities)).toBe(true)
    expect(actionMatchesVisual(overdue, 'board_red', priorities)).toBe(true)
    expect(actionMatchesVisual(green, 'board_red', priorities)).toBe(false)
    expect(actionMatchesVisual(overdue, 'priority_red', priorities)).toBe(false)
    expect(actionMatchesVisual(redPriority, 'priority_red', priorities)).toBe(true)
  })

  it('reads latest active_query from consult_log', () => {
    const log = [
      { tool: 'get_my_actions', status: 'ok', at: 't1', summary: 'old' },
      buildActiveQueryEntry({
        scope: 'assigned_to_me',
        status_group: 'open',
        visual: 'board_red',
        at: 't2',
      }),
      {
        tool: 'get_my_actions',
        status: 'ok',
        at: 't3',
        summary: JSON.stringify(
          buildActiveQueryEntry({
            scope: 'created_by_me',
            status_group: 'open',
            visual: 'none',
            at: 't3',
          })
        ),
      },
    ]
    const latest = readLatestActiveQuery(log)
    expect(latest?.scope).toBe('created_by_me')
    expect(latest?.visual).toBe('none')
  })

  it('merge: «Todas» keeps previous contract and does not open board', () => {
    const previous = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const merged = mergeActionQueryArgs({}, previous, 'Todas')
    expect(merged.scope).toBe('assigned_to_me')
    expect(merged.visual).toBe('board_red')
    expect(merged.status_group).toBe('open')
  })

  it('merge: «las que creé» switches scope and keeps visual', () => {
    const previous = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const merged = mergeActionQueryArgs({}, previous, 'las que cree')
    expect(merged.scope).toBe('created_by_me')
    expect(merged.visual).toBe('board_red')
  })

  it('merge: «soy responsable» narrows to assigned_to_me without dropping visual', () => {
    const previous = buildActiveQueryEntry({
      scope: 'board_authorized',
      status_group: 'open',
      visual: 'board_red',
    })
    const merged = mergeActionQueryArgs({}, previous, 'De cuales soy responsable?')
    expect(merged.scope).toBe('assigned_to_me')
    expect(merged.visual).toBe('board_red')
  })

  it('merge: explicit args win for reconsulta', () => {
    const previous = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const merged = mergeActionQueryArgs(
      { scope: 'created_by_me', visual: 'none', status_group: 'overdue' },
      previous,
      null
    )
    expect(merged.scope).toBe('created_by_me')
    expect(merged.visual).toBe('none')
    expect(merged.status_group).toBe('overdue')
  })

  it('merge: empty args + previous keeps contract (no utterance)', () => {
    const previous = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const merged = mergeActionQueryArgs({}, previous, null)
    expect(merged).toMatchObject({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
  })

  it('merge: «Todas» ignores LLM board_authorized when previous is personal', () => {
    const previous = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const merged = mergeActionQueryArgs(
      { scope: 'board_authorized', visual: 'none' },
      previous,
      'Todas'
    )
    expect(merged.scope).toBe('assigned_to_me')
    expect(merged.visual).toBe('board_red')
    expect(isPersonalActionScope(merged.scope)).toBe(true)
  })

  it('security: assigned_to_me population is never acciones_corporativas', () => {
    expect(populationLabel('assigned_to_me')).toBe('responsable_actual')
    expect(populationLabel('created_by_me')).toBe('creadas_por_mi')
    expect(populationLabel('assigned_to_me')).not.toBe('acciones_corporativas')
  })

  it('gate: rewrites dashboard → get_my_actions on personal follow-up «Todas»', () => {
    const previous = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const out = maybeRewriteWideToolToMyActions({
      tool: 'get_dashboard_summary',
      args: {},
      previous,
      utterance: 'Todas',
    })
    expect(out.rewrote).toBe(true)
    expect(out.tool).toBe('get_my_actions')
    expect(out.rewrote_from).toBe('get_dashboard_summary')
    expect(out.args.scope).toBe('assigned_to_me')
    expect(out.args.visual).toBe('board_red')
  })

  it('gate: rewrites get_team_actions on empty utterance with personal active_query', () => {
    const previous = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const out = maybeRewriteWideToolToMyActions({
      tool: 'get_team_actions',
      args: {},
      previous,
      utterance: null,
    })
    expect(out.rewrote).toBe(true)
    expect(out.tool).toBe('get_my_actions')
  })

  it('gate: does not rewrite when user asks for team explicitly', () => {
    const previous = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    })
    const out = maybeRewriteWideToolToMyActions({
      tool: 'get_dashboard_summary',
      args: {},
      previous,
      utterance: 'Ahora muestrame las de todo el equipo',
    })
    expect(out.rewrote).toBe(false)
    expect(out.tool).toBe('get_dashboard_summary')
  })

  it('conversational matrix A–J (active_query fusion)', () => {
    // A: abiertas responsable
    let q = mergeActionQueryArgs(
      { scope: 'assigned_to_me', status_group: 'open' },
      null,
      'Cuantas acciones tengo abiertas?'
    )
    expect(q).toMatchObject({ scope: 'assigned_to_me', status_group: 'open' })
    let active = buildActiveQueryEntry({ ...q, visual: q.visual })

    // B: en rojo conserva responsable + open
    q = mergeActionQueryArgs({}, active, 'Cuantas estan en rojo?')
    expect(q.scope).toBe('assigned_to_me')
    expect(q.visual).toBe('board_red')
    active = buildActiveQueryEntry({ ...q, visual: q.visual })

    // C: cuales → listado, mismo contrato
    q = mergeActionQueryArgs({}, active, 'Cuales son?')
    expect(q).toMatchObject({
      scope: 'assigned_to_me',
      visual: 'board_red',
      status_group: 'open',
    })
    expect(q.limit).toBe(12)
    active = buildActiveQueryEntry({ ...q, visual: q.visual })

    // D: cree → created_by_me
    q = mergeActionQueryArgs({}, active, 'Cuales cree yo?')
    expect(q.scope).toBe('created_by_me')
    expect(q.visual).toBe('board_red')
    active = buildActiveQueryEntry({ ...q, visual: q.visual })

    // D2: he asignado → created_by_me (no hay asignador distinto)
    q = mergeActionQueryArgs({}, active, 'Cuales he asignado yo?')
    expect(q.scope).toBe('created_by_me')

    // E: responsable → assigned_to_me
    q = mergeActionQueryArgs({}, active, 'Y de cuales soy responsable?')
    expect(q.scope).toBe('assigned_to_me')
    expect(q.visual).toBe('board_red')
    active = buildActiveQueryEntry({ ...q, visual: q.visual })

    // F: Todas → mismo contrato (no board)
    q = mergeActionQueryArgs({ scope: 'board_authorized' }, active, 'Todas')
    expect(q.scope).toBe('assigned_to_me')
    expect(q.visual).toBe('board_red')

    // F2: enlistalas conserva contrato personal
    q = mergeActionQueryArgs({}, active, 'Enlistalas')
    expect(q.scope).toBe('assigned_to_me')
    expect(q.limit).toBe(12)

    // G: equipo explícito
    q = mergeActionQueryArgs({}, active, 'Ahora muestrame las de todo el equipo')
    expect(q.scope).toBe('team_authorized')

    // G2: tablero / en total → board_authorized
    q = mergeActionQueryArgs({}, active, 'Cuantas acciones en total hay en el tablero?')
    expect(q.scope).toBe('board_authorized')

    // H: vencidas conserva alcance actual (team) + overdue
    active = buildActiveQueryEntry({
      scope: 'team_authorized',
      status_group: 'open',
      visual: 'none',
    })
    q = mergeActionQueryArgs({}, active, 'Cuales estan vencidas?')
    expect(q.scope).toBe('team_authorized')
    expect(q.visual).toBe('overdue')

    // I: prioridad roja (no vencimiento)
    active = buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'none',
    })
    q = mergeActionQueryArgs({}, active, 'Que acciones tienen prioridad roja?')
    expect(q.scope).toBe('assigned_to_me')
    expect(q.visual).toBe('priority_red')

    // J: recomendacion no cambia contrato; el spoken/prompt impone nivel 3 solo si lo piden
    q = mergeActionQueryArgs({}, buildActiveQueryEntry({
      scope: 'assigned_to_me',
      status_group: 'open',
      visual: 'board_red',
    }), 'Que me recomiendas hacer?')
    expect(q.scope).toBe('assigned_to_me')
    expect(q.visual).toBe('board_red')
  })
})
