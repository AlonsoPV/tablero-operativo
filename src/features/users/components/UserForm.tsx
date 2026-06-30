import { useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import {
  createUserFormSchema,
  updateUserFormSchema,
  type UserFormValues,
} from '../schemas/user.schema'
import { useRoles } from '@/features/catalogs/hooks/useRoles'
import { useAreas } from '@/features/catalogs/hooks/useAreas'

interface UserFormProps {
  defaultValues?: Partial<UserFormValues> | null
  onSubmit: (values: UserFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
  /** true = crear usuario y enviar invitacion por correo */
  isCreate?: boolean
  /** Oculta acciones; usar con `formId` y botones externos. */
  hideActions?: boolean
  formId?: string
}

const NONE_AREA = '__none__'

const EMPTY_USER_FORM: UserFormValues = {
  email: '',
  nombre: '',
  rol: '',
  area: null,
  activo: true,
}

export function UserForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  isCreate = false,
  hideActions = false,
  formId,
}: UserFormProps) {
  const { data: roles = [], isLoading: loadingRoles } = useRoles({ activo: true })
  const { data: areas = [], isLoading: loadingAreas } = useAreas({ activo: true })
  const formSchema = useMemo(
    () => (isCreate ? createUserFormSchema : updateUserFormSchema),
    [isCreate]
  )

  const resolvedDefaults = defaultValues ?? EMPTY_USER_FORM

  const currentRolMissing = Boolean(
    !isCreate &&
      resolvedDefaults.rol &&
      !roles.some((role) => role.nombre === resolvedDefaults.rol)
  )
  const currentAreaMissing = Boolean(
    !isCreate &&
      resolvedDefaults.area &&
      !areas.some((area) => area.nombre === resolvedDefaults.area)
  )

  const roleOptions = useMemo(() => {
    const base = roles.map((role) => ({
      id: role.id,
      nombre: role.nombre,
      label: role.nombre,
    }))
    if (!currentRolMissing || !resolvedDefaults.rol) return base
    return [
      {
        id: `current-${resolvedDefaults.rol}`,
        nombre: resolvedDefaults.rol,
        label: `${resolvedDefaults.rol} (actual, fuera del catalogo activo)`,
      },
      ...base,
    ]
  }, [currentRolMissing, resolvedDefaults.rol, roles])

  const areaOptions = useMemo(() => {
    if (!currentAreaMissing || !resolvedDefaults.area) {
      return areas.map((area) => ({ id: area.id, nombre: area.nombre, label: area.nombre }))
    }
    return [
      {
        id: `current-${resolvedDefaults.area}`,
        nombre: resolvedDefaults.area,
        label: `${resolvedDefaults.area} (actual, fuera del catalogo activo)`,
      },
      ...areas.map((area) => ({ id: area.id, nombre: area.nombre, label: area.nombre })),
    ]
  }, [areas, currentAreaMissing, resolvedDefaults.area])

  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: resolvedDefaults,
    shouldUnregister: false,
  })

  useEffect(() => {
    form.reset({
      email: defaultValues?.email ?? '',
      nombre: defaultValues?.nombre ?? '',
      rol: defaultValues?.rol ?? '',
      area: defaultValues?.area ?? null,
      activo: defaultValues?.activo ?? true,
    })
  }, [
    defaultValues?.email,
    defaultValues?.nombre,
    defaultValues?.rol,
    defaultValues?.area,
    defaultValues?.activo,
    form,
  ])

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-6"
    >
      {isCreate && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Como funciona la invitacion</p>
          <ol className="mt-2 list-inside list-decimal space-y-1">
            <li>Indicas correo, nombre y rol; el area es opcional.</li>
            <li>El usuario se crea y se autoconfirma al momento.</li>
            <li>Tambien recibe el correo de invitacion y puede entrar con la contrasena inicial emx@2026.</li>
          </ol>
        </div>
      )}

      {isCreate && (
        <div className="space-y-2">
          <Label htmlFor="email">Correo *</Label>
          <Input
            id="email"
            type="email"
            {...form.register('email')}
            placeholder="correo@empresa.com"
            autoComplete="email"
          />
          <p className="text-xs text-muted-foreground">
            El mismo que usara para iniciar sesion. Si ese correo ya tiene cuenta, te lo indicamos.
          </p>
          {form.formState.errors.email && (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input
          id="nombre"
          {...form.register('nombre')}
          placeholder="Nombre en el tablero"
          autoComplete="name"
        />
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="rol">Rol *</Label>
        <Controller
          name="rol"
          control={form.control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange} disabled={loadingRoles}>
              <SelectTrigger id="rol">
                <SelectValue placeholder={loadingRoles ? 'Cargando roles...' : 'Elige un rol'} />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role.id} value={role.nombre}>
                    {role.label ?? role.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-muted-foreground">
          {currentRolMissing
            ? 'El rol actual se conserva aunque no este activo en el catalogo.'
            : 'Catalogo de roles de la organizacion.'}
        </p>
        {form.formState.errors.rol && (
          <p className="text-sm text-destructive">{form.formState.errors.rol.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="area">Area</Label>
        <Controller
          name="area"
          control={form.control}
          render={({ field }) => (
            <Select
              value={field.value ?? NONE_AREA}
              onValueChange={(value) => field.onChange(value === NONE_AREA ? null : value)}
              disabled={loadingAreas}
            >
              <SelectTrigger id="area">
                <SelectValue placeholder={loadingAreas ? 'Cargando areas...' : 'Area (opcional)'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_AREA}>Sin area</SelectItem>
                {areaOptions.map((area) => (
                  <SelectItem key={area.id} value={area.nombre}>
                    {area.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-muted-foreground">
          {currentAreaMissing
            ? 'El area actual se conserva aunque no este activa en el catalogo.'
            : 'Opcional. Viene del catalogo de areas.'}
        </p>
        {form.formState.errors.area && (
          <p className="text-sm text-destructive">{form.formState.errors.area.message}</p>
        )}
      </div>

      <Controller
        name="activo"
        control={form.control}
        render={({ field }) => (
          <label className="flex cursor-pointer items-center gap-2">
            <input
              id="activo"
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={field.value}
              onChange={(event) => field.onChange(event.target.checked)}
              onBlur={field.onBlur}
              ref={field.ref}
              disabled={isSubmitting}
            />
            <span className="text-sm font-medium">Usuario activo</span>
          </label>
        )}
      />

      {!hideActions ? (
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : isCreate ? 'Crear y enviar invitacion' : 'Guardar cambios'}
          </Button>
        </div>
      ) : null}
    </form>
  )
}
