import { Link } from 'react-router-dom'
import {
  Building2,
  Check,
  Link2,
  Unlink,
  Users,
} from 'lucide-react'
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
  showStatus = true,
}: {
  action: ActionOption
  areaName?: string | null
  showStatus?: boolean
}) {
  const scope =
    action.kind === 'team'
      ? areaName
        ? `Equipo · ${areaName}`
        : 'Equipo'
      : 'Empresa'
  const status = action.closed ? 'Completada' : 'En curso'

  return (
    <span className="text-xs leading-snug text-muted-foreground">
      {scope}
      {showStatus ? (
        <>
          <span className="mx-1.5 text-border" aria-hidden>
            ·
          </span>
          {status}
        </>
      ) : null}
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
  busy?: boolean
  canUnlink?: boolean
  onUnlink?: () => void
}) {
  const closed = Boolean(action?.closed)
  const ScopeIcon = action?.kind === 'team' ? Users : Building2

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-xl border border-border/70 bg-background p-3 transition-all',
        'hover:border-border hover:bg-muted/20 hover:shadow-sm'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          closed
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
        )}
        aria-hidden
      >
        {closed ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Link2 className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {action ? (
          <Link
            className={cn(
              'block truncate text-sm font-semibold leading-snug tracking-tight text-foreground outline-none hover:underline focus-visible:underline',
              closed && 'text-muted-foreground'
            )}
            to={actionHref(action)}
          >
            {action.title}
          </Link>
        ) : (
          <p className="truncate text-sm text-muted-foreground">
            Acción no disponible para tu usuario
          </p>
        )}
        {action ? (
          <p className="mt-1 flex min-w-0 items-center gap-1.5">
            <ScopeIcon
              className="h-3 w-3 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <ActionMetaBadges
              action={action}
              areaName={areaName}
              showStatus={false}
            />
          </p>
        ) : null}
      </div>

      {action ? (
        <span
          className={cn(
            'mt-0.5 shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium',
            closed
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {closed ? 'Hecho' : 'En curso'}
        </span>
      ) : null}

      {canUnlink && onUnlink ? (
        <button
          type="button"
          disabled={busy}
          aria-label="Desvincular iniciativa"
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          onClick={onUnlink}
        >
          <Unlink className="h-3.5 w-3.5" />
        </button>
      ) : null}
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
        'flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-all',
        selected
          ? 'border-border bg-muted/40 shadow-sm ring-1 ring-foreground/10'
          : 'border-border/70 hover:border-border hover:bg-muted/25'
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
            ? 'border-foreground bg-foreground text-background'
            : 'border-muted-foreground/40'
        )}
        aria-hidden
      >
        {selected && <Check className="h-3 w-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug tracking-tight">
          {action.title}
        </span>
        <span className="mt-1 block">
          <ActionMetaBadges action={action} areaName={areaName} />
        </span>
      </span>
    </label>
  )
}
