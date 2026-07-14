import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useUpdateUser } from '@/features/users/hooks/useUpdateUser'
import { isExcludedFromOrgChartByRole } from '@/features/auth/lib/permissions'
import type { OrgChartUser } from '../types/orgChart.types'
import {
  getDirectReports,
  initialsFromName,
  mapManagerUpdateError,
  wouldCreateHierarchyCycle,
} from '../utils/orgHierarchy'

type ChecklistUser = Pick<OrgChartUser, 'id' | 'nombre' | 'rol'>

function PersonChecklist({
  id,
  label,
  hint,
  options,
  selectedIds,
  onToggle,
  multiple,
  emptyMessage,
  disabled,
}: {
  id: string
  label: string
  hint?: string
  options: ChecklistUser[]
  selectedIds: string[]
  onToggle: (id: string) => void
  multiple: boolean
  emptyMessage: string
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (user) =>
        user.nombre.toLowerCase().includes(q) || user.rol.toLowerCase().includes(q)
    )
  }, [options, query])

  const selectedCount = selectedIds.length

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Label htmlFor={`${id}-search`}>{label}</Label>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {selectedCount === 0
            ? 'Ninguno seleccionado'
            : multiple
              ? `${selectedCount} seleccionado${selectedCount === 1 ? '' : 's'}`
              : '1 seleccionado'}
        </p>
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
          <div className="border-b border-border/50 bg-muted/20 p-2">
            <input
              id={`${id}-search`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o rol…"
              disabled={disabled}
              className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
          </div>
          <ul
            className="max-h-48 space-y-0.5 overflow-y-auto p-2"
            role="listbox"
            aria-multiselectable={multiple}
          >
            {!multiple ? (
              <li>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/40',
                    selectedIds.length === 0 && 'bg-muted/30',
                    disabled && 'pointer-events-none opacity-60'
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={selectedIds.length === 0}
                    onChange={() => onToggle('')}
                    disabled={disabled}
                  />
                  <span className="text-muted-foreground">Sin responsable superior</span>
                </label>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">Sin coincidencias.</li>
            ) : (
              filtered.map((person) => {
                const checked = selectedIds.includes(person.id)
                return (
                  <li key={person.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/40',
                        checked && 'bg-primary/5 ring-1 ring-primary/15',
                        disabled && 'pointer-events-none opacity-60'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                        checked={checked}
                        onChange={() => onToggle(person.id)}
                        disabled={disabled}
                      />
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
                        aria-hidden
                      >
                        {initialsFromName(person.nombre)}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{person.nombre}</span>
                        <span className="text-muted-foreground"> · {person.rol}</span>
                      </span>
                    </label>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

interface OrgChartHierarchyEditorProps {
  user: OrgChartUser
  users: OrgChartUser[]
  currentUserId?: string | null
  /** RH / editor global: puede reasignar reportes que ya tienen otro jefe. */
  canManageAnyReports?: boolean
}

export function OrgChartHierarchyEditor({
  user,
  users,
  currentUserId,
  canManageAnyReports = false,
}: OrgChartHierarchyEditorProps) {
  const updateUser = useUpdateUser()
  const initialReports = useMemo(
    () => getDirectReports(user.id, users).map((u) => u.id),
    [user.id, users]
  )
  const [managerId, setManagerId] = useState<string | null>(user.manager_user_id)
  const [reportIds, setReportIds] = useState<string[]>(initialReports)

  useEffect(() => {
    setManagerId(user.manager_user_id)
    setReportIds(getDirectReports(user.id, users).map((u) => u.id))
  }, [user.id, user.manager_user_id, users])

  const managerOptions = useMemo(
    () =>
      users
        .filter(
          (option) =>
            option.activo &&
            option.id !== user.id &&
            !isExcludedFromOrgChartByRole(option.rol) &&
            !wouldCreateHierarchyCycle(user.id, option.id, users)
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [user.id, users]
  )

  const reportCandidates = useMemo(() => {
    return users
      .filter((candidate) => {
        if (candidate.id === user.id || !candidate.activo) return false
        if (isExcludedFromOrgChartByRole(candidate.rol)) return false
        if (wouldCreateHierarchyCycle(candidate.id, user.id, users)) return false
        if (canManageAnyReports) return true
        if (candidate.manager_user_id == null || candidate.manager_user_id === user.id) return true
        return reportIds.includes(candidate.id)
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [canManageAnyReports, reportIds, user.id, users])

  const dirty =
    (managerId ?? null) !== (user.manager_user_id ?? null) ||
    reportIds.slice().sort().join() !== initialReports.slice().sort().join()

  const toggleManager = (id: string) => {
    if (id === '') {
      setManagerId(null)
      return
    }
    setManagerId((prev) => (prev === id ? null : id))
  }

  const toggleReport = (id: string) => {
    setReportIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const handleSave = () => {
    if (managerId && wouldCreateHierarchyCycle(user.id, managerId, users)) {
      toast.error('No se puede asignar ese jefe: generaría un ciclo jerárquico.')
      return
    }

    updateUser.mutate(
      {
        id: user.id,
        input: {
          manager_user_id: managerId,
          direct_report_ids: reportIds,
        },
      },
      {
        onSuccess: () => toast.success('Jerarquía actualizada'),
        onError: (error) => {
          const raw = error instanceof Error ? error.message : 'No se pudo actualizar'
          toast.error(mapManagerUpdateError(raw))
        },
      }
    )
  }

  const editingSelf = currentUserId === user.id

  return (
    <section className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Editar jerarquía</p>
        <p className="text-xs text-muted-foreground">
          {editingSelf
            ? 'Define a quién reportas y a quiénes supervisas.'
            : `Asigna jefe y reportes de ${user.nombre}.`}{' '}
          En «Supervisa a» puedes marcar varias personas; en «Reporta a» solo una.
        </p>
      </div>

      <PersonChecklist
        id={`org-manager-${user.id}`}
        label="Reporta a"
        hint="Marca un responsable superior (o ninguno)."
        options={managerOptions}
        selectedIds={managerId ? [managerId] : []}
        onToggle={toggleManager}
        multiple={false}
        emptyMessage="No hay personas disponibles como responsable superior."
        disabled={updateUser.isPending}
      />

      <PersonChecklist
        id={`org-reports-${user.id}`}
        label="Supervisa a"
        hint={
          canManageAnyReports
            ? 'Puedes marcar varias personas; RH puede reasignar reportes de otros líderes.'
            : 'Puedes marcar varias. Solo aparecen sin líder o que ya reportan aquí.'
        }
        options={reportCandidates}
        selectedIds={reportIds}
        onToggle={toggleReport}
        multiple
        emptyMessage="No hay personas disponibles para asignar como reportes."
        disabled={updateUser.isPending}
      />

      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={!dirty || updateUser.isPending}
        onClick={handleSave}
      >
        {updateUser.isPending ? 'Guardando...' : 'Guardar jerarquía'}
      </Button>
    </section>
  )
}
