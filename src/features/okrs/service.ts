import { supabase } from '@/lib/supabase/client'
import type { ActionOption, OkrData } from './model'
import type { ReportEvent } from './reporting'

async function rpc<T>(
  name: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

function normalizeActionOptions(raw: unknown): ActionOption[] {
  let value: unknown = raw
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const id = typeof row.id === 'string' ? row.id : null
    const title = typeof row.title === 'string' ? row.title : null
    const kind = row.kind === 'team' || row.kind === 'company' ? row.kind : null
    if (!id || !title || !kind) return []
    return [
      {
        id,
        title,
        kind,
        area_id: typeof row.area_id === 'string' ? row.area_id : null,
        closed: Boolean(row.closed),
        es_okr: row.es_okr === true || row.es_okr === 'true',
      },
    ]
  })
}

async function loadTaggedActions(): Promise<ActionOption[]> {
  const [company, team, areas] = await Promise.all([
    supabase
      .from('acciones_diarias')
      .select('id, titulo_accion, area')
      .eq('es_okr', true),
    supabase
      .from('acciones_equipo')
      .select('id, titulo, area_id')
      .eq('es_okr', true),
    supabase.from('areas').select('id, nombre'),
  ])
  const areaIdByName = new Map(
    (areas.data ?? []).flatMap((area) => {
      const name = area.nombre?.trim().toLowerCase()
      return name ? [[name, area.id as string] as const] : []
    })
  )
  const tagged: ActionOption[] = []
  if (!company.error) {
    for (const row of company.data ?? []) {
      const areaName = row.area?.trim().toLowerCase()
      tagged.push({
        id: row.id,
        title: row.titulo_accion ?? '',
        kind: 'company',
        area_id: areaName ? (areaIdByName.get(areaName) ?? null) : null,
        closed: false,
        es_okr: true,
      })
    }
  }
  if (!team.error) {
    for (const row of team.data ?? []) {
      tagged.push({
        id: row.id,
        title: row.titulo ?? '',
        kind: 'team',
        area_id: row.area_id ?? null,
        closed: false,
        es_okr: true,
      })
    }
  }
  return tagged.filter((action) => action.id && action.title)
}

function mergeActionOptions(
  fromRpc: ActionOption[],
  tagged: ActionOption[]
): ActionOption[] {
  const byKey = new Map(
    fromRpc.map((action) => [`${action.kind}:${action.id}`, { ...action }])
  )
  for (const action of tagged) {
    const key = `${action.kind}:${action.id}`
    const existing = byKey.get(key)
    if (existing) {
      existing.es_okr = true
      if (!existing.area_id && action.area_id) existing.area_id = action.area_id
    } else {
      byKey.set(key, { ...action, es_okr: true })
    }
  }
  return [...byKey.values()]
}

export const okrService = {
  async history(
    objectiveId: string,
    cursor: { created_at: string; id: string } | null
  ) {
    const events = await rpc<ReportEvent[]>('okr_reporting_history', {
      p_okr_id: objectiveId,
      p_before: cursor?.created_at ?? null,
      p_before_id: cursor?.id ?? null,
    })
    const visible = events.slice(0, 50)
    const last = visible.at(-1)
    return {
      events: visible,
      next:
        events.length > 50 && last
          ? { created_at: last.created_at, id: last.id }
          : null,
    }
  },
  async dashboard(): Promise<OkrData> {
    const [data, directory] = await Promise.all([
      rpc<OkrData>('okr_dashboard'),
      rpc<Pick<OkrData, 'users' | 'areas'>>('okr_directory'),
    ])
    // Preserve the original operational OKR's live calculations.
    if (data.keyResults.some((kr) => !kr.metric_type.startsWith('manual:'))) {
      const operational = await rpc<{
        ok: boolean
        okr?: { id: string }
        key_results?: {
          metric_type: string
          current_value: number
          progress: number
        }[]
      }>('get_operational_okr_dashboard')
      for (const kr of data.keyResults) {
        const metric =
          operational.ok && operational.okr?.id === kr.okr_id
            ? operational.key_results?.find(
                (item) => item.metric_type === kr.metric_type
              )
            : undefined
        if (metric) {
          kr.current_value = metric.current_value
          kr.computed_progress = metric.progress
        }
      }
    }
    return { ...data, ...directory }
  },
  async actions(): Promise<ActionOption[]> {
    let fromRpc: ActionOption[] = []
    try {
      fromRpc = normalizeActionOptions(await rpc<unknown>('okr_action_options'))
    } catch {
      fromRpc = []
    }
    return mergeActionOptions(fromRpc, await loadTaggedActions())
  },
  saveObjective: (data: Record<string, unknown>, id?: string) =>
    rpc<string>('okr_save_objective', { p_data: data, p_id: id ?? null }),
  saveKeyResult: (okrId: string, data: Record<string, unknown>, id?: string) =>
    rpc<string>('okr_save_key_result', {
      p_okr_id: okrId,
      p_data: data,
      p_id: id ?? null,
    }),
  checkIn: (
    id: string,
    value: number,
    note: string,
    confidence?: 'red' | 'yellow' | 'green' | null
  ) =>
    rpc<void>('okr_check_in', {
      p_id: id,
      p_value: value,
      p_note: note,
      p_confidence: confidence ?? null,
    }),
  deleteObjective: (id: string) =>
    rpc<void>('okr_delete_objective', { p_id: id }),
  deleteKeyResult: (id: string) =>
    rpc<void>('okr_delete_key_result', { p_id: id }),
  async link(krId: string, action: ActionOption) {
    const { error } = await supabase.from('okr_initiatives').insert({
      key_result_id: krId,
      action_id: action.kind === 'company' ? action.id : null,
      team_action_id: action.kind === 'team' ? action.id : null,
    })
    if (error)
      throw new Error(
        error.code === '23505'
          ? 'Esta acción ya está vinculada al KR.'
          : error.message.includes('OKRs de equipo')
            ? 'Las iniciativas solo se vinculan a OKRs de equipo.'
            : error.message
      )
  },
  async unlink(id: string) {
    const { data, error } = await supabase
      .from('okr_initiatives')
      .delete()
      .eq('id', id)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data?.length)
      throw new Error(
        'No se pudo desvincular la iniciativa. Verifica tus permisos.'
      )
  },
  tagTeamAction: (id: string, esOkr: boolean) =>
    rpc<void>('okr_tag_team_action', { p_id: id, p_es_okr: esOkr }),
}
