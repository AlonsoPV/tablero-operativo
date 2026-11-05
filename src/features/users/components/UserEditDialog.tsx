import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserForm } from './UserForm'
import type { UserFormValues } from '../schemas/user.schema'
import type { UserProfile } from '../types/user.types'
import type { OrgChartUser } from '@/features/org-chart/types/orgChart.types'

export const USER_EDIT_FORM_ID = 'user-edit-dialog-form'

type UserEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  user?: UserProfile | null
  onSubmit: (values: UserFormValues) => void
  isSubmitting?: boolean
  managerOptions?: OrgChartUser[]
  canEditManager?: boolean
}

export function UserEditDialog({
  open,
  onOpenChange,
  mode,
  user,
  onSubmit,
  isSubmitting = false,
  managerOptions,
  canEditManager = false,
}: UserEditDialogProps) {
  const isEdit = mode === 'edit' && Boolean(user)

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[min(90dvh,720px)] w-[calc(100vw-2rem)] max-w-lg grid-rows-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 pb-4 pt-6 pr-12 text-left">
          <DialogTitle>{isEdit ? 'Editar ficha' : 'Invitar a alguien nuevo'}</DialogTitle>
          <DialogDescription className="text-left text-sm text-muted-foreground">
            {isEdit
              ? 'Los cambios aplican a su ficha en el tablero (rol, área y estado).'
              : 'Con correo, nombre y rol basta. Creamos el acceso confirmado y su ficha en el tablero.'}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <UserForm
            key={isEdit && user ? `edit-${user.id}` : 'create-user'}
            formId={USER_EDIT_FORM_ID}
            hideActions
            editingUserId={isEdit && user ? user.id : undefined}
            managerOptions={managerOptions}
            canEditManager={canEditManager}
            defaultValues={
              isEdit && user
                ? {
                    nombre: user.nombre,
                    rol: user.rol,
                    role_ids: user.role_ids ?? [],
                    primary_role_id: user.primary_role_id ?? null,
                    area: user.area ?? null,
                    activo: user.activo,
                    manager_user_id: user.manager_user_id ?? null,
                  }
                : undefined
            }
            membershipAreaNames={isEdit && user ? user.areas ?? [] : []}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
            isSubmitting={isSubmitting}
            isCreate={!isEdit}
          />
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-border/60 bg-muted/20 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" form={USER_EDIT_FORM_ID} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
