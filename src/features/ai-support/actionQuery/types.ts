/** Contrato de consulta de acciones (cliente + servidor). */

export type ActionQueryScope =
  | 'assigned_to_me'
  | 'created_by_me'
  | 'assigned_to_me_or_created'
  | 'team_authorized'
  | 'board_authorized'

export type ActionQueryStatusGroup =
  | 'open'
  | 'overdue'
  | 'due_week'
  | 'stale'
  | 'blocked'
  | 'verification'

export type ActionQueryVisual = 'none' | 'priority_red' | 'overdue' | 'board_red'

export type ActionActiveQuery = {
  type: 'active_query'
  entity: 'actions'
  scope: ActionQueryScope
  status_group: ActionQueryStatusGroup
  visual: ActionQueryVisual
  at: string
}
