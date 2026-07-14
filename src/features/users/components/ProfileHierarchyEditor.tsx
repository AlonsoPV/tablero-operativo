import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isExcludedFromOrgChartByRole } from '@/features/auth/lib/permissions'
import type { OrgChartUser } from '@/features/org-chart/types/orgChart.types'
import {
  getDirectReports,
  initialsFromName,
  wouldCreateHierarchyCycle,
} from '@/features/org-chart/utils/orgHierarchy'

type ProfileHierarchyEditorProps = {
  userId: string
  users: OrgChartUser[]
  managerUserId: string | null
  onSave: (input: {
    manager_user_id: string | null
    direct_report_ids: string[]
  }) => Promise<void>
  isSaving?: boolean
  embedded?: boolean
}

type ChecklistUser = Pick<OrgChartUser, 'id' | 'nombre' | 'rol'>

function PersonChecklist({
  id,
  name,
  label,
  hint,
  options,
  selectedIds,
  onToggle,
  multiple,
  emptyMessage,
}: {
  id: string
  name: string
  label: string
  hint?: string
  options: ChecklistUser[]
  selectedIds: string[]
  onToggle: (id: string) => void
  multiple: boolean
  emptyMessage: string
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
    <div id={`${id}-field`} data-name={`${name}-field`} className="space-y-2">
      <div id={`${id}-header`} data-name={`${name}-header`} className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <Label htmlFor={`${id}-search`} id={`${id}-label`} data-name={`${name}-label`}>
            {label}
          </Label>
          {hint ? (
            <p id={`${id}-hint`} data-name={`${name}-hint`} className="mt-0.5 text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
        <p id={`${id}-count`} data-name={`${name}-count`} className="text-xs tabular-nums text-muted-foreground">
          {selectedCount === 0
            ? 'Ninguno seleccionado'
            : multiple
              ? `${selectedCount} seleccionado${selectedCount === 1 ? '' : 's'}`
              : '1 seleccionado'}
        </p>
      </div>

      {options.length === 0 ? (
        <p id={`${id}-empty`} data-name={`${name}-empty`} className="text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div id={`${id}-list-wrap`} data-name={`${name}-list-wrap`} className="overflow-hidden rounded-lg border border-border/60">
          <div id={`${id}-search-wrap`} data-name={`${name}-search-wrap`} className="border-b border-border/50 bg-muted/20 p-2">
            <input
              id={`${id}-search`}
              name={`${name}-search`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o rol…"
              className="h-9 w-full rounded-md border border-border/60 bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <ul
            id={`${id}-list`}
            data-name={`${name}-list`}
            className="max-h-56 space-y-0.5 overflow-y-auto p-2"
            role="listbox"
            aria-multiselectable={multiple}
          >
            {!multiple ? (
              <li id={`${id}-option-none`} data-name={`${name}-option-none`}>
                <label
                  htmlFor={`${id}-none`}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/40',
                    selectedIds.length === 0 && 'bg-muted/30'
                  )}
                >
                  <input
                    id={`${id}-none`}
                    name={name}
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={selectedIds.length === 0}
                    onChange={() => onToggle('')}
                  />
                  <span className="text-muted-foreground">Sin responsable superior</span>
                </label>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li id={`${id}-no-match`} data-name={`${name}-no-match`} className="px-2 py-3 text-sm text-muted-foreground">
                Sin coincidencias.
              </li>
            ) : (
              filtered.map((user) => {
                const checked = selectedIds.includes(user.id)
                const optionId = `${id}-${user.id}`
                return (
                  <li key={user.id} id={optionId} data-name={`${name}-option-${user.id}`}>
                    <label
                      htmlFor={`${optionId}-check`}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/40',
                        checked && 'bg-primary/5 ring-1 ring-primary/15'
                      )}
                    >
                      <input
                        id={`${optionId}-check`}
                        name={multiple ? `${name}[]` : name}
                        type="checkbox"
                        value={user.id}
                        className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                        checked={checked}
                        onChange={() => onToggle(user.id)}
                        aria-checked={checked}
                      />
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
                        aria-hidden
                      >
                        {initialsFromName(user.nombre)}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{user.nombre}</span>
                        <span className="text-muted-foreground"> · {user.rol}</span>
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

export function ProfileHierarchyEditor({
  userId,
  users,
  managerUserId,
  onSave,
  isSaving = false,
  embedded = false,
}: ProfileHierarchyEditorProps) {
  const initialReports = useMemo(
    () => getDirectReports(userId, users).map((u) => u.id),
    [userId, users]
  )
  const [managerId, setManagerId] = useState<string | null>(managerUserId)
  const [reportIds, setReportIds] = useState<string[]>(initialReports)
  const [saving, setSaving] = useState(false)

  const managerOptions = useMemo(
    () =>
      users
        .filter(
          (u) =>
            u.id !== userId &&
            u.activo &&
            !isExcludedFromOrgChartByRole(u.rol) &&
            !wouldCreateHierarchyCycle(userId, u.id, users)
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [userId, users]
  )

  const reportCandidates = useMemo(() => {
    return users
      .filter((u) => {
        if (u.id === userId || !u.activo || isExcludedFromOrgChartByRole(u.rol)) return false
        if (wouldCreateHierarchyCycle(u.id, userId, users)) return false
        if (u.manager_user_id == null || u.manager_user_id === userId) return true
        return reportIds.includes(u.id)
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [reportIds, userId, users])

  const dirty =
    (managerId ?? null) !== (managerUserId ?? null) ||
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

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        manager_user_id: managerId,
        direct_report_ids: reportIds,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      id="profile-hierarchy-editor"
      data-name="profile-hierarchy-editor"
      className={cn('space-y-5', !embedded && 'rounded-xl border border-border/60 bg-card/50 p-4 sm:p-5')}
    >
      {!embedded ? (
        <div id="profile-hierarchy-intro" data-name="profile-hierarchy-intro">
          <h3
            id="profile-hierarchy-title"
            data-name="profile-hierarchy-title"
            className="text-sm font-semibold text-foreground"
          >
            Jerarquía
          </h3>
          <p
            id="profile-hierarchy-help"
            data-name="profile-hierarchy-help"
            className="mt-1 text-xs text-muted-foreground"
          >
            Elige con checks a quién reportas y a quiénes supervisas. En «Supervisa a» puedes marcar
            varias personas; en «Reporta a» solo una (tu jefe directo).
          </p>
        </div>
      ) : (
        <p
          id="profile-hierarchy-help"
          data-name="profile-hierarchy-help"
          className="text-xs text-muted-foreground"
        >
          En «Supervisa a» puedes marcar varias personas; en «Reporta a» solo una.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <PersonChecklist
          id="profile-manager"
          name="profile-manager"
          label="Reporta a"
          hint="Un solo responsable superior (o ninguno)."
          options={managerOptions}
          selectedIds={managerId ? [managerId] : []}
          onToggle={toggleManager}
          multiple={false}
          emptyMessage="No hay personas disponibles como responsable superior."
        />

        <PersonChecklist
          id="profile-reports"
          name="profile-reports"
          label="Supervisa a"
          hint="Varias personas; solo sin líder o que ya te reportan."
          options={reportCandidates}
          selectedIds={reportIds}
          onToggle={toggleReport}
          multiple
          emptyMessage="No hay personas disponibles para asignar como reportes."
        />
      </div>

      <div
        id="profile-hierarchy-actions"
        data-name="profile-hierarchy-actions"
        className="flex justify-end border-t border-border/40 pt-3"
      >
        <Button
          id="profile-hierarchy-save"
          name="profile-hierarchy-save"
          type="button"
          disabled={!dirty || saving || isSaving}
          onClick={() => void handleSave()}
        >
          {saving || isSaving ? 'Guardando…' : 'Guardar jerarquía'}
        </Button>
      </div>
    </div>
  )
}
