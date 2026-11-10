/** `fecha_limite` es timestamptz. No usa la regla de fecha + hora del Kanban corporativo. */
export function isTeamDeadlinePast(fechaLimite: string | null | undefined, now = new Date()): boolean {
  if (!fechaLimite) return false
  const due = Date.parse(fechaLimite)
  return Number.isFinite(due) && due < now.getTime()
}

type TeamPopulationRow = {
  id: string
  fecha_limite?: string | null
  bloqueada?: boolean
  completed_at?: string | null
}

export function isTeamPopulationRow(row: object): row is TeamPopulationRow {
  return 'fecha_limite' in row && !('hora_limite' in row) && 'id' in row
}

export function summarizeTeamActions(rows: object[], now = new Date()) {
  const unique = new Map<string, TeamPopulationRow>()
  for (const row of rows) {
    if (!isTeamPopulationRow(row)) continue
    unique.set(row.id, row)
  }
  const actions = [...unique.values()]
  const open = actions.filter((action) => !action.completed_at)
  return {
    population: 'acciones_equipo' as const,
    total: actions.length,
    open: open.length,
    overdue: open.filter((action) => isTeamDeadlinePast(action.fecha_limite, now)).length,
    blocked: open.filter((action) => action.bloqueada === true).length,
  }
}
