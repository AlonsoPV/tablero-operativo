import { UserRoundCheck } from 'lucide-react'
import { KanbanScopeToggle } from './KanbanScopeToggle'

type Props = {
  active: boolean
  disabled?: boolean
  onClick: () => void
  id?: string
  variant?: 'group' | 'standalone'
  className?: string
}

export function KanbanMineToggle({
  active,
  disabled = false,
  onClick,
  id = 'kanban-btn-mine',
  variant = 'standalone',
  className,
}: Props) {
  return (
    <KanbanScopeToggle
      id={id}
      active={active}
      disabled={disabled}
      onClick={onClick}
      icon={UserRoundCheck}
      label="Todas"
      activeLabel="Propias"
      title={active ? 'Ver todas las acciones' : 'Ver solo acciones propias'}
      tone="primary"
      variant={variant}
      className={className}
    />
  )
}
