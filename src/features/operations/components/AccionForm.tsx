/**
 * Formulario de creación/edición de acción diaria.
 * Arquitectura en 2 bloques (acordeón): principal → evidencia/validación.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  accionCreateSchema,
  type AccionCreateInput,
  type AccionFormInput,
} from '../schemas/accion.schema'
import { useUsers } from '@/features/users/hooks/useUsers'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'
import { useDropdownOptionsByKey } from '@/features/catalogs/hooks/useDropdownOptions'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { isAnalystByRole } from '@/features/auth/lib/permissions'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { DEFAULT_PRIORITY_NOMBRE, priorityDisplayLabel } from '../utils/priorityLabels'
import { AccionFormField } from './AccionFormSection'
import { AccionFormBlock } from './form/AccionFormBlock'
import { AccionAsignadorNote } from './form/AccionAsignadorNote'
import { AccionPrioridadSelect, resolveDefaultPrioridadNombre } from './form/AccionPrioridadSelect'
import { resolveAccionPrioridadNombre } from '../utils/resolveAccionPrioridad'
import { EvidenceOptionPicker } from './form/EvidenceOptionPicker'
import { CatalogLoadError } from './form/CatalogLoadError'
import { AccionDescripcionTextarea } from './form/AccionDescripcionTextarea'
import {
  CalendarClock,
  FileCheck,
} from 'lucide-react'

function collectAccionFormErrorMessages(errors: FieldErrors<AccionFormInput>): string[] {
  const found: string[] = []
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.length > 0) found.push(o.message)
    for (const [k, v] of Object.entries(o)) {
      if (k === 'message' || k === 'type' || k === 'ref') continue
      if (v && typeof v === 'object') walk(v)
    }
  }
  walk(errors)
  return [...new Set(found)]
}

const inputBase =
  'flex h-9 w-full rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/50 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50'

const EVIDENCIA_OTRO_SPECIFY_INTERNAL = '__evidencia_otro__'

function catalogHasOtroOption(options: { value: string }[]): boolean {
  return options.some((o) => String(o.value).trim().toLowerCase() === 'otro')
}

function evidenciaNeedsFreeText(selectValue: string, options: { value: string }[]): boolean {
  if (selectValue === EVIDENCIA_OTRO_SPECIFY_INTERNAL) return true
  const opt = options.find((o) => o.value === selectValue)
  return !!opt && String(opt.value).trim().toLowerCase() === 'otro'
}

function ReadonlyValue({
  label,
  value,
}: {
  label: string
  value?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 min-h-5 text-sm font-medium text-foreground whitespace-pre-wrap break-words">
        {value || <span className="text-muted-foreground">Sin dato</span>}
      </div>
    </div>
  )
}

export interface AccionFormProps {
  defaultValues?: Partial<AccionFormInput> | null
  onSubmit: (values: AccionCreateInput) => void
  onCancel: () => void
  isSubmitting?: boolean
  isEdit?: boolean
  readonlyStrategicFields?: boolean
  formId?: string
  onSubmitInvalid?: (messages: string[]) => void
  /** Checklist borrador y adjuntos opcionales (bloque 3, solo creación). */
  validationExtras?: ReactNode
  deadlineExtras?: (values: { fecha: string | undefined; hora_limite: string | undefined }) => ReactNode
  onPrioridadChange?: (prioridad: string | undefined) => void
  accionPrioridadId?: string | null
  userOptions?: Array<{ id: string; nombre: string }>
  /** Área fija aplicada al formulario (p. ej. Kanban por Equipos). */
  lockedAreaName?: string
  /** Quién asigna la acción; por defecto el usuario actual. */
  asignadorNombre?: string | null
}

export function AccionForm({
  defaultValues,
  onSubmit,
  onCancel: _onCancel,
  isSubmitting: _isSubmitting = false,
  isEdit = false,
  readonlyStrategicFields = false,
  formId,
  onSubmitInvalid,
  validationExtras,
  deadlineExtras,
  onPrioridadChange,
  accionPrioridadId,
  userOptions,
  lockedAreaName,
  asignadorNombre,
}: AccionFormProps) {
  void _onCancel

  const {
    data: queriedUsers = [],
    isLoading: usersLoading,
    isError: usersError,
    error: usersErrorObj,
    refetch: retryUsers,
  } = useUsers({ activo: true })
  const users = userOptions ?? queriedUsers
  const effectiveUsersLoading = userOptions ? false : usersLoading
  const effectiveUsersError = userOptions ? false : usersError
  const {
    data: priorities = [],
    isLoading: prioritiesLoading,
  } = usePriorities()
  const { data: currentUser } = useCurrentUser()
  const isAnalyst = isAnalystByRole(currentUser?.rol)
  const assignerName = asignadorNombre?.trim() || currentUser?.nombre?.trim() || null
  const showAsignadorNote = !lockedAreaName
  const {
    data: evidenciaOpciones = [],
    isLoading: evidenciaLoading,
    isFetching: evidenciaFetching,
    isError: evidenciaError,
    refetch: retryEvidenciaCatalog,
  } = useDropdownOptionsByKey('evidencia_esperada')
  const isEditProtectedReadonly = readonlyStrategicFields || (isEdit && isAnalyst)

  const [evidenciaSelect, setEvidenciaSelect] = useState<string>('__none__')

  const [blocksOpen, setBlocksOpen] = useState({
    principal: true,
    validacion: isEdit,
  })

  const form = useForm<AccionFormInput, unknown, AccionCreateInput>({
    resolver: zodResolver(accionCreateSchema) as Resolver<AccionFormInput, unknown, AccionCreateInput>,
    defaultValues: {
      titulo_accion: '',
      descripcion_modo: 'simple',
      descripcion_simple: '',
      descripcion_como: '',
      descripcion_quiero: '',
      descripcion_para_que: '',
      responsable: '',
      fecha: todayWallClockCDMX(),
      hora_limite: '17:00',
      evidencia_esperada: '',
      prioridad: DEFAULT_PRIORITY_NOMBRE,
      area: undefined,
      gap_ids: [],
      catalog_kpi_ids: [],
      tipo_accion: 'operativa',
      story_points: 0,
      sprint_id: null,
      responsable_bloqueo: null,
      ...defaultValues,
    },
  })

  useEffect(() => {
    if (lockedAreaName) form.setValue('area', lockedAreaName)
  }, [form, lockedAreaName])

  const watchedFecha = form.watch('fecha')
  const watchedHoraLimite = form.watch('hora_limite')
  const prioridadSeleccionada = form.watch('prioridad')

  const priorityOptions = useMemo((): { id: string; nombre: string }[] => {
    const sorted = [...priorities].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
    const nombre = (prioridadSeleccionada ?? '').trim()
    if (nombre && !sorted.some((p) => p.nombre === nombre)) {
      return [{ id: `legacy-${nombre}`, nombre }, ...sorted.map((p) => ({ id: p.id, nombre: p.nombre }))]
    }
    return sorted.map((p) => ({ id: p.id, nombre: p.nombre }))
  }, [priorities, prioridadSeleccionada])

  const defaultPrioridadNombre = useMemo(() => resolveDefaultPrioridadNombre(priorities), [priorities])

  const principalSummary = useMemo(() => {
    const titulo = (form.watch('titulo_accion') ?? '').trim()
    const resp = users.find((u) => u.id === form.watch('responsable'))?.nombre
    const fecha = form.watch('fecha')
    const prioridad = (form.watch('prioridad') ?? '').trim()
    if (!titulo && !resp) return undefined
    return [titulo || 'Sin título', resp, prioridad ? priorityDisplayLabel(prioridad) : null, fecha]
      .filter(Boolean)
      .join(' · ')
  }, [form, users])

  useEffect(() => {
    if (prioritiesLoading || priorities.length === 0) return
    if (isEdit) return
    const current = form.getValues('prioridad')
    if (!current || !priorityOptions.some((p) => p.nombre === current)) {
      form.setValue('prioridad', defaultPrioridadNombre, { shouldValidate: true })
    }
  }, [isEdit, prioritiesLoading, priorities.length, defaultPrioridadNombre, priorityOptions, form])

  useEffect(() => {
    if (!defaultValues?.prioridad && !accionPrioridadId) return
    if (prioritiesLoading || priorities.length === 0) return
    const resolved = resolveAccionPrioridadNombre(
      {
        prioridad: defaultValues?.prioridad ?? form.getValues('prioridad') ?? '',
        prioridad_id: accionPrioridadId,
      },
      priorities
    )
    if (resolved && resolved !== form.getValues('prioridad')) {
      form.setValue('prioridad', resolved, { shouldValidate: true })
    }
  }, [
    accionPrioridadId,
    defaultValues?.prioridad,
    form,
    priorities,
    prioritiesLoading,
  ])

  useEffect(() => {
    onPrioridadChange?.(prioridadSeleccionada?.trim() || undefined)
  }, [onPrioridadChange, prioridadSeleccionada])

  useEffect(() => {
    form.setValue('descripcion_modo', 'simple')
  }, [form])

  /** Por ahora todas las acciones nuevas/editadas en formulario son RUN (operativa). */
  useEffect(() => {
    form.setValue('tipo_accion', 'operativa')
    form.setValue('sprint_id', null)
    form.setValue('responsable_bloqueo', null)
  }, [form])

  const evidenciaSignature = evidenciaOpciones.map((o) => `${o.id}:${o.value}:${o.label}`).join('|')
  const hasCatalogOtro = catalogHasOtroOption(evidenciaOpciones)

  useEffect(() => {
    const val = (defaultValues?.evidencia_esperada ?? form.getValues('evidencia_esperada'))?.trim() ?? ''
    if (evidenciaOpciones.length === 0) {
      setEvidenciaSelect(val ? EVIDENCIA_OTRO_SPECIFY_INTERNAL : '__none__')
      return
    }
    const matchByLabel = evidenciaOpciones.find((o) => o.label === val)
    if (matchByLabel) {
      setEvidenciaSelect(matchByLabel.value)
      return
    }
    if (!val) {
      setEvidenciaSelect('__none__')
      return
    }
    const otroOpt = evidenciaOpciones.find((o) => String(o.value).trim().toLowerCase() === 'otro')
    setEvidenciaSelect(otroOpt ? otroOpt.value : EVIDENCIA_OTRO_SPECIFY_INTERNAL)
  }, [evidenciaSignature, evidenciaOpciones, defaultValues?.evidencia_esperada, form])

  const fid = formId ?? 'accion-form'
  const fieldId = (name: string) => `${fid}-${name}`

  const evidenceCards = useMemo(
    () =>
      evidenciaOpciones.map((o) => ({
        id: o.id,
        value: o.value,
        label: o.label,
      })),
    [evidenciaOpciones]
  )
  const readonlyResponsableNombre =
    users.find((u) => u.id === form.watch('responsable'))?.nombre ??
    form.watch('responsable') ??
    ''
  return (
    <form
      id={fid}
      onSubmit={(event) => {
        if (_isSubmitting) {
          event.preventDefault()
          return
        }
        void form.handleSubmit(onSubmit, (errors) => {
          const msgs = collectAccionFormErrorMessages(errors)
          onSubmitInvalid?.(msgs.length > 0 ? msgs : ['Revisa los campos obligatorios.'])
        })(event)
      }}
      className="accion-form space-y-3 sm:space-y-4"
      data-accion-form-mode={isEdit ? 'edit' : 'create'}
    >
      <AccionFormBlock
        blockId={`${fid}-block-principal`}
        step={1}
        title="Información principal"
        subtitle="¿Qué se hará, quién lo hará y para cuándo?"
        icon={CalendarClock}
        expanded={blocksOpen.principal}
        onToggle={() => setBlocksOpen((b) => ({ ...b, principal: !b.principal }))}
        collapsedSummary={principalSummary}
        editProtected={isEditProtectedReadonly}
      >
        {isEditProtectedReadonly ? (
          <div className="space-y-4">
            {showAsignadorNote ? <AccionAsignadorNote nombre={assignerName} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <ReadonlyValue label="Título de la acción" value={form.watch('titulo_accion')} />
            <ReadonlyValue label="Responsable de ejecutar" value={readonlyResponsableNombre} />
            <AccionFormField
              label="Prioridad"
              htmlFor={fieldId('prioridad')}
              hint="Sincronizada con el catálogo O2C."
              hintAsIcon
              required
              error={form.formState.errors.prioridad?.message}
            >
              <AccionPrioridadSelect
                id={fieldId('prioridad')}
                value={form.watch('prioridad')}
                onChange={(v) => form.setValue('prioridad', v, { shouldValidate: true })}
                disabled={isAnalyst}
                prioridadId={accionPrioridadId}
              />
            </AccionFormField>
            <ReadonlyValue
              label="Fecha y hora límite"
              value={[form.watch('fecha'), form.watch('hora_limite')].filter(Boolean).join(' · ')}
            />
            <div className="sm:col-span-2">
              {isEdit ? (
                <AccionFormField label="Descripción" htmlFor={fieldId('descripcion_simple')} required>
                  <AccionDescripcionTextarea
                    id={fieldId('descripcion_simple')}
                    register={form.register('descripcion_simple')}
                    value={form.watch('descripcion_simple') ?? ''}
                    placeholder="Describe la acción: qué implica, qué buscas lograr y para qué (mín. 15 caracteres)."
                  />
                  {form.formState.errors.descripcion_simple && (
                    <p className="text-xs text-destructive">{form.formState.errors.descripcion_simple.message}</p>
                  )}
                </AccionFormField>
              ) : (
                <ReadonlyValue label="Descripción" value={form.watch('descripcion_simple')} />
              )}
            </div>
          </div>
          </div>
        ) : (
        <fieldset className="space-y-4">
        {showAsignadorNote ? <AccionAsignadorNote nombre={assignerName} /> : null}
        <AccionFormField label="Título de la acción" htmlFor={fieldId('titulo_accion')} required>
          <Input
            id={fieldId('titulo_accion')}
            {...form.register('titulo_accion', {
              maxLength: { value: 70, message: 'Máximo 70 caracteres' },
              onChange: () => form.trigger('titulo_accion'),
            })}
            placeholder="Ej: Revisar informe mensual"
            maxLength={70}
            disabled={isEditProtectedReadonly}
            className={`${inputBase} h-10`}
          />
          <p className="text-xs text-muted-foreground">
            {(form.watch('titulo_accion') ?? '').length}/70
          </p>
          {form.formState.errors.titulo_accion && (
            <p className="text-xs text-destructive">{form.formState.errors.titulo_accion.message}</p>
          )}
        </AccionFormField>

        <AccionFormField label="Descripción" htmlFor={fieldId('descripcion_simple')} required>
          <AccionDescripcionTextarea
            id={fieldId('descripcion_simple')}
            register={form.register('descripcion_simple')}
            value={form.watch('descripcion_simple') ?? ''}
            placeholder="Describe la acción: qué implica, qué buscas lograr y para qué (mín. 15 caracteres)."
          />
          {form.formState.errors.descripcion_simple && (
            <p className="text-xs text-destructive">{form.formState.errors.descripcion_simple.message}</p>
          )}
        </AccionFormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        <AccionFormField
          label="Responsable de ejecutar"
          htmlFor={fieldId('responsable')}
          hint="Persona que ejecuta y cierra la acción."
          hintAsIcon
          required
          error={form.formState.errors.responsable?.message}
        >
          {effectiveUsersLoading && <p className="text-xs text-muted-foreground">Cargando responsables…</p>}
          {effectiveUsersError && (
            <CatalogLoadError
              message={`No se pudo cargar responsables.${usersErrorObj instanceof Error ? ` ${usersErrorObj.message}` : ''}`}
              onRetry={() => void retryUsers()}
            />
          )}
          <Select
            value={form.watch('responsable') ?? '__none__'}
            onValueChange={(v) => form.setValue('responsable', v === '__none__' ? '' : v)}
            disabled={isEditProtectedReadonly || (effectiveUsersLoading && users.length === 0)}
          >
            <SelectTrigger id={fieldId('responsable')} className={`${inputBase} h-10`}>
              <SelectValue placeholder="Seleccionar responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Seleccionar responsable</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </AccionFormField>

        <AccionFormField
          label="Prioridad"
          htmlFor={fieldId('prioridad')}
          hint="Urgencia según el catálogo O2C."
          hintAsIcon
          required
          error={form.formState.errors.prioridad?.message}
        >
          <AccionPrioridadSelect
            id={fieldId('prioridad')}
            value={form.watch('prioridad')}
            onChange={(v) => form.setValue('prioridad', v, { shouldValidate: true })}
            disabled={isEditProtectedReadonly}
          />
        </AccionFormField>
        </div>

        <AccionFormField
          label="Fecha y hora límite"
          htmlFor={fieldId('fecha')}
          required
          error={form.formState.errors.fecha?.message ?? form.formState.errors.hora_limite?.message}
        >
          <div className="grid gap-2 min-[380px]:grid-cols-[minmax(0,1fr)_8.5rem]">
            <Input
              id={fieldId('fecha')}
              type="date"
              min={todayWallClockCDMX()}
              {...form.register('fecha')}
              disabled={isEditProtectedReadonly}
              className={`${inputBase} h-10`}
            />
            <Input
              id={fieldId('hora_limite')}
              type="time"
              {...form.register('hora_limite')}
              step={60}
              disabled={isEditProtectedReadonly}
              className={`${inputBase} h-10`}
            />
          </div>
          {deadlineExtras?.({ fecha: watchedFecha, hora_limite: watchedHoraLimite })}
        </AccionFormField>
        </fieldset>
        )}
      </AccionFormBlock>

      <AccionFormBlock
        blockId={`${fid}-block-validacion`}
        step={2}
        title="Evidencia y validación"
        subtitle="Qué comprobará el cierre."
        icon={FileCheck}
        expanded={blocksOpen.validacion}
        onToggle={() => setBlocksOpen((b) => ({ ...b, validacion: !b.validacion }))}
        editProtected={isEditProtectedReadonly}
      >
        {isEditProtectedReadonly ? (
          <ReadonlyValue
            label="Evidencia esperada"
            value={form.watch('evidencia_esperada')}
          />
        ) : (
        <>
        {(evidenciaLoading || evidenciaFetching) && (
          <p className="text-xs text-muted-foreground">Cargando catálogo de evidencia…</p>
        )}
        {evidenciaError && (
          <CatalogLoadError
            message="No se pudo cargar el catálogo de evidencia."
            onRetry={() => void retryEvidenciaCatalog()}
          />
        )}

        <AccionFormField
          label="¿Qué evidencia comprobará que se hizo?"
          required
          error={form.formState.errors.evidencia_esperada?.message}
        >
          {evidenceCards.length > 0 ? (
            <EvidenceOptionPicker
              options={evidenceCards}
              selectedValue={evidenciaSelect === '__none__' ? '' : evidenciaSelect}
              otherInternalValue={hasCatalogOtro ? undefined : EVIDENCIA_OTRO_SPECIFY_INTERNAL}
              disabled={evidenciaLoading && evidenciaOpciones.length === 0}
              onSelect={(value, label) => {
                setEvidenciaSelect(value)
                if (value === EVIDENCIA_OTRO_SPECIFY_INTERNAL) form.setValue('evidencia_esperada', '')
                else form.setValue('evidencia_esperada', label, { shouldValidate: true })
              }}
            />
          ) : (
            !evidenciaLoading &&
            !evidenciaError && (
              <p className="text-xs text-muted-foreground">
                Sin opciones en catálogo; describe la evidencia abajo.
              </p>
            )
          )}
          {evidenciaNeedsFreeText(evidenciaSelect, evidenciaOpciones) && (
            <Input
              id={fieldId('evidencia_esperada_texto')}
              placeholder="Especificar (mín. 5 caracteres)"
              className={`${inputBase} mt-2 h-10`}
              {...form.register('evidencia_esperada')}
            />
          )}
        </AccionFormField>

        {validationExtras ? <div className="space-y-4 border-t border-border/50 pt-4">{validationExtras}</div> : null}
        </>
        )}
      </AccionFormBlock>
    </form>
  )
}
