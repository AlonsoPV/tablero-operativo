import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { userFormSchema, type UserFormValues } from '../schemas/user.schema'
import { useRoles } from '@/features/catalogs/hooks/useRoles'
import { useAreas } from '@/features/catalogs/hooks/useAreas'

interface UserFormProps {
  defaultValues?: Partial<UserFormValues> | null
  onSubmit: (values: UserFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
  /** true = crear (puede estar deshabilitado si no hay integración Auth) */
  isCreate?: boolean
}

export function UserForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  isCreate = false,
}: UserFormProps) {
  const { data: roles = [], isLoading: loadingRoles } = useRoles({ activo: true })
  const { data: areas = [], isLoading: loadingAreas } = useAreas({ activo: true })

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaultValues ?? {
      user_id: '',
      nombre: '',
      rol: '',
      area: undefined,
      activo: true,
      onboarding_completed: false,
    },
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {isCreate && (
        <div className="space-y-2">
          <Label htmlFor="user_id">ID de usuario (Auth) *</Label>
          <Input
            id="user_id"
            {...form.register('user_id')}
            placeholder="UUID del usuario en Supabase Auth (ej. desde Authentication)"
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Crea el usuario en Supabase → Authentication y pega aquí su UUID para vincular el perfil.
          </p>
          {form.formState.errors.user_id && (
            <p className="text-sm text-destructive">{form.formState.errors.user_id.message}</p>
          )}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input
          id="nombre"
          {...form.register('nombre')}
          placeholder="Nombre del usuario"
          autoComplete="name"
        />
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="rol">Rol *</Label>
        <Select
          value={form.watch('rol')}
          onValueChange={(v) => form.setValue('rol', v)}
          disabled={loadingRoles}
        >
          <SelectTrigger id="rol">
            <SelectValue placeholder={loadingRoles ? 'Cargando roles...' : 'Seleccionar rol'} />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.nombre}>
                {r.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.rol && (
          <p className="text-sm text-destructive">{form.formState.errors.rol.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="area">Área</Label>
        <Select
          value={form.watch('area') ?? '__none__'}
          onValueChange={(v) => form.setValue('area', v === '__none__' ? undefined : v)}
          disabled={loadingAreas}
        >
          <SelectTrigger id="area">
            <SelectValue placeholder={loadingAreas ? 'Cargando áreas...' : 'Seleccionar área (opcional)'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sin área</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a.id} value={a.nombre}>
                {a.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Opcional. Valores del catálogo de áreas.
        </p>
        {form.formState.errors.area && (
          <p className="text-sm text-destructive">{form.formState.errors.area.message}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            {...form.register('activo')}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm font-medium">Usuario activo</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            {...form.register('onboarding_completed')}
            className="h-4 w-4 rounded border-input"
          />
          <span className="text-sm font-medium">Onboarding completado</span>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : isCreate ? 'Crear usuario' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
