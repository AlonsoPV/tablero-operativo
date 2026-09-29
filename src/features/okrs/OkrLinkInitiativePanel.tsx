import { Link2, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActionOption } from './model'
import { compactControl } from './okrPresentation'
import { LinkActionChoice } from './OkrInitiativeVisuals'

export function OkrLinkInitiativePanel({
  krTitle,
  search,
  onSearch,
  selectedAction,
  onSelect,
  available,
  areas,
  actionsReady,
  onCreateAction,
}: {
  krTitle: string
  search: string
  onSearch: (value: string) => void
  selectedAction: string
  onSelect: (key: string) => void
  available: ActionOption[]
  areas: { id: string; nombre: string }[]
  actionsReady: boolean
  onCreateAction: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 rounded-xl border bg-muted/30 px-3 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Link2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Se vinculará a
          </p>
          <p className="mt-0.5 text-sm font-medium leading-snug">{krTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            La acción sigue en Kanban. Aquí solo queda como iniciativa de este
            resultado.
          </p>
        </div>
      </div>

      <label className="relative block">
        <span className="sr-only">Buscar acción</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          className={cn(compactControl, 'pl-9')}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Buscar por nombre de la acción"
        />
      </label>

      <button
        type="button"
        onClick={onCreateAction}
        className="flex w-full items-start gap-3 rounded-xl border border-dashed px-3 py-3 text-left hover:bg-muted/40"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Plus className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-sm font-medium">Crear acción nueva</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Se abre el formulario de Kanban. Después puedes vincularla aquí.
          </span>
        </span>
      </button>

      <fieldset className="min-w-0" disabled={!actionsReady}>
        <legend className="mb-2 text-sm font-medium">
          Acciones disponibles
          {actionsReady ? ` · ${available.length}` : ''}
        </legend>
        {!actionsReady ? (
          <p role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Cargando acciones…
          </p>
        ) : available.length ? (
          <div className="max-h-56 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {available.map((action) => (
              <LinkActionChoice
                key={`${action.kind}:${action.id}`}
                action={action}
                areaName={
                  areas.find((area) => area.id === action.area_id)?.nombre
                }
                selected={selectedAction === `${action.kind}:${action.id}`}
                onSelect={() => onSelect(`${action.kind}:${action.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center">
            <Link2 className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              No hay acciones para vincular
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cambia la búsqueda o crea una acción nueva.
            </p>
          </div>
        )}
      </fieldset>
    </div>
  )
}
