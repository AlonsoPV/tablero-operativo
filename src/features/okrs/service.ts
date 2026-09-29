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
  actions: () => rpc<ActionOption[]>('okr_action_options'),
  saveObjective: (data: Record<string, unknown>, id?: string) =>
    rpc<string>('okr_save_objective', { p_data: data, p_id: id ?? null }),
  saveKeyResult: (okrId: string, data: Record<string, unknown>, id?: string) =>
    rpc<string>('okr_save_key_result', {
      p_okr_id: okrId,
      p_data: data,
      p_id: id ?? null,
    }),
  checkIn: (id: string, value: number, note: string) =>
    rpc<void>('okr_check_in', { p_id: id, p_value: value, p_note: note }),
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
}
