import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { roleFormSchema, type RoleFormValues } from '../schemas/role.schema'
import type { AppModule } from '../types/catalogs.types'

interface RoleFormProps {
  defaultValues?: Partial<RoleFormValues> | null
  onSubmit: (values: RoleFormValues) => void
  onCancel: () => void
  isSubmitting?: boolean
  modules?: AppModule[]
  lockName?: boolean
}

export function RoleForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  modules = [],
  lockName = false,
}: RoleFormProps) {
  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: defaultValues ?? {
      nombre: '',
      descripcion: undefined,
      activo: true,
      module_keys: [],
    },
  })
  const moduleGroups = useMemo(() => {
    const labels: Record<string, string> = {
      operacion: 'Operación',
      conocimiento: 'Conocimiento',
      gestion: 'Gestión',
      estrategia: 'Estrategia',
      configuracion: 'Configuración',
    }
    return Object.entries(
      modules.reduce<Record<string, AppModule[]>>((groups, module) => {
        const key = module.section || 'otros'
        groups[key] = [...(groups[key] ?? []), module]
        return groups
      }, {})
    ).map(([key, items]) => ({ key, label: labels[key] ?? 'Otros', items }))
  }, [modules])

  const handleSubmit = (values: RoleFormValues) => {
    onSubmit(
      lockName
        ? { ...values, module_keys: modules.map((module) => module.key) }
        : values
    )
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input id="nombre" {...form.register('nombre')} placeholder="Nombre del rol" readOnly={lockName} />
        {lockName ? <p className="text-xs text-muted-foreground">Este nombre técnico está protegido.</p> : null}
        {form.formState.errors.nombre && (
          <p className="text-sm text-destructive">{form.formState.errors.nombre.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Input id="descripcion" {...form.register('descripcion')} placeholder="Opcional" />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" {...form.register('activo')} className="h-4 w-4 rounded border-input" />
        <span className="text-sm font-medium">Activo</span>
      </label>
      <div className="space-y-3">
        <div>
          <Label>Acceso a secciones</Label>
          <p className="text-xs text-muted-foreground">
            Marca los módulos que podrán abrir los usuarios con este rol.
          </p>
        </div>
        {lockName ? (
          <p className="rounded-md bg-primary/5 px-3 py-2 text-xs text-primary">
            Super Admin conserva acceso completo a todas las secciones.
          </p>
        ) : null}
        <div className="space-y-5">
          {moduleGroups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h4 className="text-sm font-semibold">{group.label}</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((module) => (
                  <label
                    key={module.key}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      value={module.key}
                      {...form.register('module_keys')}
                      disabled={lockName}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{module.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{module.route}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}
