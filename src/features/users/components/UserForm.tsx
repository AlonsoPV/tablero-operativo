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
import { wouldCreateHierarchyCycle } from '@/features/org-chart/utils/orgHierarchy'
import type { OrgChartUser } from '@/features/org-chart/types/orgChart.types'
import { AreaMembershipFields } from './AreaMembershipFields'
import { useRouteAccess } from '@/features/auth/hooks/useRouteAccess'
import { isAppSuperAdminByAppRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'

interface UserFormProps {
  defaultValues?: Partial<UserFormValues> | null
  /** Nombres de áreas adicionales (además de area principal). */
  membershipAreaNames?: string[]
  onSubmit: (values: UserFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
  /** true = crear usuario y enviar invitacion por correo */
  isCreate?: boolean
  /** Oculta acciones; usar con `formId` y botones externos. */
  hideActions?: boolean
  formId?: string
  /** Usuario en edición (para validar jerarquía). */
  editingUserId?: string
  /** Opciones de jefe directo. */
  managerOptions?: OrgChartUser[]
  /** Si puede editar "Reporta a". */
  canEditManager?: boolean
}

const NONE_MANAGER = '__none_manager__'

const EMPTY_USER_FORM: UserFormValues = {
  email: '',
  nombre: '',
  rol: '',
  role_ids: [],
  primary_role_id: null,
  area: null,
  additional_area_ids: [],
  activo: true,
  manager_user_id: null,
  direct_report_ids: [],
}

export function UserForm({
  defaultValues,
  membershipAreaNames = [],
  onSubmit,
  onCancel,
  isSubmitting = false,
  isCreate = false,
  hideActions = false,
  formId,
  editingUserId,
  managerOptions = [],
  canEditManager = false,
}: UserFormProps) {
  const { data: roles = [], isLoading: loadingRoles } = useRoles({ activo: true })
  const { rol: actorRole, appRole } = useRouteAccess()
  const canAssignMultipleRoles = isSuperAdminByRole(actorRole) || isAppSuperAdminByAppRole(appRole)
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

  const selectableManagers = useMemo(() => {
    return managerOptions
      .filter((option) => option.activo)
      .filter((option) => option.id !== editingUserId)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [editingUserId, managerOptions])

  const currentManagerMissing = Boolean(
    !isCreate &&
      resolvedDefaults.manager_user_id &&
      !managerOptions.some((option) => option.id === resolvedDefaults.manager_user_id)
  )

  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: resolvedDefaults,
    shouldUnregister: false,
  })

  useEffect(() => {
    const primaryId = areas.find((a) => a.nombre === (defaultValues?.area ?? null))?.id
    const names =
      membershipAreaNames.length > 0
        ? membershipAreaNames
        : defaultValues?.area
          ? [defaultValues.area]
          : []
    const additional = areas
      .filter((a) => names.includes(a.nombre) && a.id !== primaryId)
      .map((a) => a.id)
    const primaryRole = roles.find((role) => role.nombre === (defaultValues?.rol ?? ''))
    const roleIds = defaultValues?.role_ids?.length
      ? defaultValues.role_ids
      : primaryRole
        ? [primaryRole.id]
        : []

    form.reset({
      email: defaultValues?.email ?? '',
      nombre: defaultValues?.nombre ?? '',
      rol: defaultValues?.rol ?? '',
      role_ids: roleIds,
      primary_role_id: defaultValues?.primary_role_id ?? primaryRole?.id ?? null,
      area: defaultValues?.area ?? null,
      additional_area_ids: defaultValues?.additional_area_ids ?? additional,
      activo: defaultValues?.activo ?? true,
      manager_user_id: defaultValues?.manager_user_id ?? null,
      direct_report_ids: defaultValues?.direct_report_ids ?? [],
    })
  }, [
    defaultValues?.email,
    defaultValues?.nombre,
    defaultValues?.rol,
    defaultValues?.role_ids,
    defaultValues?.primary_role_id,
    defaultValues?.area,
    defaultValues?.activo,
    defaultValues?.manager_user_id,
    defaultValues?.additional_area_ids,
    defaultValues?.direct_report_ids,
    membershipAreaNames,
    areas,
    roles,
    form,
  ])

  const handleValidatedSubmit = (values: UserFormValues) => {
    if (
      !isCreate &&
      canEditManager &&
      editingUserId &&
      values.manager_user_id &&
      wouldCreateHierarchyCycle(editingUserId, values.manager_user_id, managerOptions)
    ) {
      form.setError('manager_user_id', {
        message: 'Ese jefe generaría un ciclo jerárquico.',
      })
      return
    }
    onSubmit(
      canAssignMultipleRoles
        ? values
        : { ...values, role_ids: [], primary_role_id: null }
    )
  }

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(handleValidatedSubmit)}
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
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value)
                const selected = roles.find((role) => role.nombre === value)
                if (!selected) return
                form.setValue('primary_role_id', selected.id, { shouldDirty: true })
                const current = form.getValues('role_ids') ?? []
                if (!current.includes(selected.id)) {
                  form.setValue('role_ids', [...current, selected.id], { shouldDirty: true })
                }
              }}
              disabled={loadingRoles}
            >
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

      {canAssignMultipleRoles ? (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <div>
            <Label>Roles adicionales</Label>
            <p className="text-xs text-muted-foreground">
              El acceso final será la combinación de todos los roles seleccionados.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((role) => {
              const primaryId = form.watch('primary_role_id')
              const selected = (form.watch('role_ids') ?? []).includes(role.id)
              return (
                <label key={role.id} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={role.id === primaryId}
                    onChange={(event) => {
                      const current = form.getValues('role_ids') ?? []
                      const next = event.target.checked
                        ? [...new Set([...current, role.id])]
                        : current.filter((id) => id !== role.id)
                      form.setValue('role_ids', next, { shouldDirty: true })
                    }}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span>{role.nombre}</span>
                  {role.id === primaryId ? <span className="ml-auto text-xs text-primary">Principal</span> : null}
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      <AreaMembershipFields
        areas={areaOptions}
        primaryAreaNombre={form.watch('area') ?? null}
        additionalAreaIds={form.watch('additional_area_ids') ?? []}
        onPrimaryChange={(nombre) => form.setValue('area', nombre, { shouldDirty: true })}
        onAdditionalChange={(ids) =>
          form.setValue('additional_area_ids', ids, { shouldDirty: true })
        }
        loading={loadingAreas}
        idPrefix="user-form"
      />
      {form.formState.errors.area && (
        <p className="text-sm text-destructive">{form.formState.errors.area.message}</p>
      )}

      {!isCreate && canEditManager ? (
        <div className="space-y-2">
          <Label htmlFor="manager_user_id">Reporta a</Label>
          <Controller
            name="manager_user_id"
            control={form.control}
            render={({ field }) => (
              <Select
                value={field.value ?? NONE_MANAGER}
                onValueChange={(value) =>
                  field.onChange(value === NONE_MANAGER ? null : value)
                }
              >
                <SelectTrigger id="manager_user_id">
                  <SelectValue placeholder="Sin responsable superior" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_MANAGER}>Sin responsable superior</SelectItem>
                  {currentManagerMissing && resolvedDefaults.manager_user_id ? (
                    <SelectItem value={resolvedDefaults.manager_user_id}>
                      Jefe actual (no visible en catálogo)
                    </SelectItem>
                  ) : null}
                  {selectableManagers.map((manager) => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.nombre} · {manager.rol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-xs text-muted-foreground">
            Define el jefe directo para organigrama y escalamientos futuros.
          </p>
          {form.formState.errors.manager_user_id && (
            <p className="text-sm text-destructive">
              {form.formState.errors.manager_user_id.message}
            </p>
          )}
        </div>
      ) : null}

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
