import { supabase } from '@/lib/supabase/client'
import type { TeamAction, TeamArea, TeamBoard } from './types'

function unwrap<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (data == null) throw new Error('La operacion no devolvio datos.')
  return data
}

export const teamKanbanService = {
  async areas() {
    const { data, error } = await supabase.rpc('team_kanban_my_areas')
    return unwrap(data, error) as TeamArea[]
  },
  async board(areaId: string) {
    const { data, error } = await supabase.rpc('team_kanban_board', { p_area_id: areaId })
    return unwrap(data, error) as unknown as TeamBoard
  },
  async create(input: { areaId: string; title: string; description: string; assignee: string; priority: string; dueAt: string | null; evidence: boolean; evidenceText?: string; checklist: Array<{ text: string; responsable_id?: string | null }>; storyPoints?: number; actionType?: string; gapIds?: string[]; catalogKpiIds?: string[] }) {
    const { data, error } = await supabase.rpc('team_kanban_create_action', {
      p_area_id: input.areaId, p_title: input.title, p_description: input.description,
      p_assignee: input.assignee, p_priority: input.priority, p_due_at: input.dueAt,
      p_evidence: input.evidence,
      p_checklist: input.checklist
        .map((item) => ({ text: item.text.trim(), done: false, responsable_id: item.responsable_id ?? null }))
        .filter((item) => item.text),
      p_evidence_text: input.evidenceText ?? null, p_story_points: input.storyPoints ?? 0,
      p_tipo_accion: input.actionType ?? 'operativa', p_gap_ids: input.gapIds ?? [],
      p_catalog_kpi_ids: input.catalogKpiIds ?? [],
    })
    if (error) throw new Error(error.message)
    return unwrap(data, null) as TeamAction
  },
  async update(actionId: string, patch: { stateId?: string; assignee?: string; priority?: string; blocked?: boolean }) {
    const { data, error } = await supabase.rpc('team_kanban_update_action', {
      p_action_id: actionId, p_state_id: patch.stateId ?? null, p_assignee: patch.assignee ?? null,
      p_priority: patch.priority ?? null, p_blocked: patch.blocked ?? null,
    })
    if (error) throw new Error(error.message)
    return unwrap(data, null) as TeamAction
  },
  async escalate(actionId: string, reason: string) {
    const { data, error } = await supabase.rpc('team_kanban_escalate', { p_action_id: actionId, p_reason: reason })
    return unwrap(data, error) as string
  },
}
