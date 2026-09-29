import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'
import { TeamActionFormDialog } from '@/features/team-kanban/TeamActionFormDialog'
import { teamKanbanService } from '@/features/team-kanban/service'

export function TeamInitiativeCreator({
  areaId,
  areaName,
  onClose,
  onDone,
}: {
  areaId: string
  areaName: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const board = useQuery({
    queryKey: ['okr-create-team-action', areaId],
    queryFn: () => teamKanbanService.board(areaId),
  })
  const priorities = usePriorities({ activo: true })
  if (!board.data || !priorities.data) {
    const error = board.error ?? priorities.error
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent>
          <DialogTitle>Nueva iniciativa del equipo</DialogTitle>
          <DialogDescription>
            {error ? error.message : 'Cargando formulario de acciones…'}
          </DialogDescription>
          {error && (
            <Button
              onClick={() => {
                void board.refetch()
                void priorities.refetch()
              }}
            >
              Reintentar
            </Button>
          )}
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <TeamActionFormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      areaId={areaId}
      areaName={areaName}
      board={board.data}
      priorities={priorities.data}
      onDone={onDone}
    />
  )
}
