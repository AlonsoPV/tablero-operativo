import { Link } from 'react-router-dom'
import { Check, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'
import type { ActionOption } from './model'

export function actionHref(action: ActionOption) {
  return action.kind === 'company'
    ? `${ROUTES.KANBAN}?accion=${action.id}`
    : `${ROUTES.TEAM_KANBAN_BOARD}?area=${action.area_id}&accion=${action.id}`
}

export function ActionMetaBadges({
  action,
  areaName,
}: {
  action: ActionOption
  areaName?: string | null
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="muted" className="font-medium">
        {action.kind === 'team' ? 'Equipo' : 'Empresa'}
      </Badge>
      {action.kind === 'team' && areaName ? (
        <Badge variant="outline" className="font-medium">
          {areaName}
        </Badge>
      ) : null}
      <Badge variant={action.closed ? 'success' : 'secondary'} className="font-medium">
        {action.closed ? 'Completada' : 'En curso'}
      </Badge>
    </span>
  )
}

export function LinkedInitiativeRow({
  action,
  areaName,
  busy,
  canUnlink,
  onUnlink,
}: {
  action: ActionOption | undefined
  areaName?: string | null
  busy: boolean
  canUnlink: boolean
  onUnlink: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card px-3 py-2">
      <span
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          action?.closed ? 'bg-emerald-500' : 'bg-sky-500'
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {action ? (
          <Link
            className="block truncate text-sm font-medium leading-snug hover:underline"
            to={actionHref(action)}
          >
            {action.title}
          </Link>
        ) : (
          <p className="truncate text-sm text-muted-foreground">
            Acción no disponible para tu usuario
          </p>
        )}
        {action && (
          <div className="mt-1">
            <ActionMetaBadges action={action} areaName={areaName} />
          </div>
        )}
      </div>
      {canUnlink && (
        <button
          type="button"
          disabled={busy}
          aria-label="Desvincular iniciativa"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          onClick={onUnlink}
        >
          <Unlink className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function LinkActionChoice({
  action,
  areaName,
  selected,
  onSelect,
}: {
  action: ActionOption
  areaName?: string | null
  selected: boolean
  onSelect: () => void
}) {
  const key = `${action.kind}:${action.id}`
  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'hover:bg-muted/50'
      )}
    >
      <input
        type="radio"
        name="action"
        value={key}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/40'
        )}
        aria-hidden
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-snug">{action.title}</span>
        <span className="mt-1.5 block">
          <ActionMetaBadges action={action} areaName={areaName} />
        </span>
      </span>
    </label>
  )
}
