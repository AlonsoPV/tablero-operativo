export const teamKanbanQueryKeys = {
  areas: ['team-kanban', 'areas'] as const,
  assignedAreas: (userId: string) => ['team-kanban', 'assigned-areas', userId] as const,
  board: (id: string) => ['team-kanban', 'board', id] as const,
}
