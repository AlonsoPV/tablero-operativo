import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUpdateUser } from '@/features/users/hooks/useUpdateUser'
import type { OrgChartUser } from '../types/orgChart.types'
import { mapManagerUpdateError, wouldCreateHierarchyCycle } from '../utils/orgHierarchy'

const NONE_MANAGER = '__none_manager__'

interface OrgChartHierarchyEditorProps {
  user: OrgChartUser
  users: OrgChartUser[]
  currentUserId?: string | null
}

export function OrgChartHierarchyEditor({
  user,
  users,
  currentUserId,
}: OrgChartHierarchyEditorProps) {
  const updateUser = useUpdateUser()
  const [managerId, setManagerId] = useState(user.manager_user_id ?? NONE_MANAGER)

  useEffect(() => {
    setManagerId(user.manager_user_id ?? NONE_MANAGER)
  }, [user.id, user.manager_user_id])

  const managerOptions = useMemo(
    () =>
      users
        .filter((option) => option.activo && option.id !== user.id)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [user.id, users]
  )

  const hasChanges = (managerId === NONE_MANAGER ? null : managerId) !== (user.manager_user_id ?? null)

  const handleSave = () => {
    const nextManagerId = managerId === NONE_MANAGER ? null : managerId

    if (
      nextManagerId &&
      wouldCreateHierarchyCycle(user.id, nextManagerId, users)
    ) {
      toast.error('No se puede asignar ese jefe: generaría un ciclo jerárquico.')
      return
    }

    updateUser.mutate(
      { id: user.id, input: { manager_user_id: nextManagerId } },
      {
        onSuccess: () => toast.success('Jerarquía actualizada'),
        onError: (error) => {
          const raw = error instanceof Error ? error.message : 'No se pudo actualizar'
          toast.error(mapManagerUpdateError(raw))
        },
      }
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">Editar jerarquía</p>
        <p className="text-xs text-muted-foreground">
          Asigna o cambia el jefe directo de {user.nombre}.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`manager-${user.id}`}>Reporta a</Label>
        <Select value={managerId} onValueChange={setManagerId} disabled={updateUser.isPending}>
          <SelectTrigger id={`manager-${user.id}`}>
            <SelectValue placeholder="Sin responsable superior" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_MANAGER}>Sin responsable superior</SelectItem>
            {managerOptions.map((manager) => (
              <SelectItem key={manager.id} value={manager.id}>
                {manager.nombre} · {manager.rol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={!hasChanges || updateUser.isPending}
        onClick={handleSave}
      >
        {updateUser.isPending ? 'Guardando...' : 'Guardar jerarquía'}
      </Button>

      {currentUserId === user.id ? (
        <p className="text-xs text-muted-foreground">
          No puedes asignarte a ti mismo como jefe directo.
        </p>
      ) : null}
    </section>
  )
}
