import { useMemo, useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type CatalogSearchItem = {
  id: string
  label: string
  description?: string | null
  /** Código o prefijo para búsqueda (ej. nombre corto del KPI). */
  code?: string | null
}

type CatalogSearchMultiSelectProps = {
  id?: string
  items: CatalogSearchItem[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  emptyLabel?: string
  loading?: boolean
  disabled?: boolean
  className?: string
  /** Límite de selección (p. ej. 1 para sprint). */
  maxSelections?: number
}

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export function CatalogSearchMultiSelect({
  id,
  items,
  selectedIds,
  onChange,
  placeholder = 'Buscar y seleccionar…',
  emptyLabel = 'Sin resultados',
  loading = false,
  disabled = false,
  className,
  maxSelections,
}: CatalogSearchMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => items.filter((i) => selectedIds.includes(i.id)),
    [items, selectedIds]
  )

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return items
    return items.filter((item) => {
      const hay = [
        item.label,
        item.description ?? '',
        item.code ?? '',
        item.id,
      ]
        .map(normalize)
        .join(' ')
      return hay.includes(q)
    })
  }, [items, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = (itemId: string) => {
    if (selectedIds.includes(itemId)) {
      onChange(selectedIds.filter((x) => x !== itemId))
      return
    }
    if (maxSelections === 1) {
      onChange([itemId])
      setOpen(false)
      return
    }
    if (maxSelections != null && selectedIds.length >= maxSelections) {
      onChange([...selectedIds.slice(1), itemId])
      return
    }
    onChange([...selectedIds, itemId])
  }

  const triggerLabel =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0].label
        : `${selected.length} seleccionados`

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <Button
        type="button"
        id={id}
        variant="outline"
        disabled={disabled || loading}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'h-10 w-full justify-between gap-2 font-normal',
          'border-input bg-muted/30'
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 truncate text-left">{loading ? 'Cargando…' : triggerLabel}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50', open && 'rotate-180')} />
      </Button>

      {open && !disabled && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-lg"
          role="listbox"
        >
          <div className="border-b border-border/60 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="h-9 pl-8"
                autoFocus
              />
            </div>
          </div>
          <ul className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyLabel}</li>
            ) : (
              filtered.map((item) => {
                const checked = selectedIds.includes(item.id)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(item.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                        checked ? 'bg-primary/10' : 'hover:bg-muted/60'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                        )}
                      >
                        {checked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium leading-snug">{item.label}</span>
                        {item.description ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <span
              key={item.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/30 py-0.5 pl-2 pr-1 text-xs"
            >
              <span className="truncate">{item.label}</span>
              {!disabled ? (
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-muted"
                  aria-label={`Quitar ${item.label}`}
                  onClick={() => toggle(item.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
