import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Flag,
  Gauge,
  Layers3,
  Scale,
  ShieldAlert,
  Target,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type ReglamentoNavId =
  | 'objetivo'
  | 'alcance'
  | 'definiciones'
  | 'prioridades'
  | 'crear'
  | 'ciclo'
  | 'daily'
  | 'reprogramacion'
  | 'escalamiento'
  | 'roles'
  | 'indicadores'
  | 'principios'

const navItems: Array<{ id: ReglamentoNavId; label: string; icon: typeof Scale }> = [
  { id: 'objetivo', label: 'Objetivo', icon: Target },
  { id: 'alcance', label: 'Alcance', icon: Layers3 },
  { id: 'definiciones', label: 'Definiciones', icon: ClipboardList },
  { id: 'prioridades', label: 'Prioridades', icon: Flag },
  { id: 'crear', label: 'Crear acción', icon: FilePlus2 },
  { id: 'ciclo', label: 'Ciclo de vida', icon: ArrowRight },
  { id: 'daily', label: 'Daily', icon: Users },
  { id: 'reprogramacion', label: 'Reprogramación', icon: CalendarClock },
  { id: 'escalamiento', label: 'Escalamiento', icon: ShieldAlert },
  { id: 'roles', label: 'Roles', icon: Users },
  { id: 'indicadores', label: 'Indicadores', icon: Gauge },
  { id: 'principios', label: 'Principios', icon: Scale },
]

const scopeItems = [
  'Registran acciones.',
  'Ejecutan acciones.',
  'Dan seguimiento.',
  'Validan resultados.',
  'Participan en la Daily.',
]

const definitions = [
  {
    term: 'Daily',
    definition:
      'Reunión diaria de seguimiento para identificar riesgos, remover bloqueos y asegurar el cumplimiento de los compromisos.',
  },
  {
    term: 'Kanban',
    definition:
      'Tablero visual donde se administran todas las acciones de la organización mediante estados de avance.',
  },
  {
    term: 'Acción',
    definition: 'Solicitud, incidencia, pendiente o compromiso registrado dentro del tablero.',
  },
  {
    term: 'Responsable',
    definition: 'Persona encargada de ejecutar y mantener actualizada la acción.',
  },
  {
    term: 'Solicitante',
    definition: 'Persona que crea la acción y valida que el resultado cumpla con lo solicitado.',
  },
  {
    term: 'Evidencia',
    definition:
      'Documento, comentario, fotografía o archivo que demuestra el cumplimiento del compromiso.',
  },
  {
    term: 'Validación',
    definition:
      'Proceso mediante el cual el solicitante confirma que la evidencia cumple con el resultado esperado antes de cerrar la acción.',
  },
  {
    term: 'Aging',
    definition: 'Tiempo transcurrido desde la creación de una acción hasta su cierre.',
  },
  {
    term: 'Lead Time',
    definition: 'Tiempo promedio requerido para cerrar una acción.',
  },
  {
    term: 'Reprogramación',
    definition: 'Cambio autorizado de la fecha compromiso.',
  },
  {
    term: 'Escalamiento',
    definition:
      'Proceso mediante el cual una acción se notifica automáticamente al siguiente nivel jerárquico cuando requiere intervención.',
  },
  {
    term: 'ICO',
    definition:
      'Índice de Confiabilidad Operativa: mide la confiabilidad en el cumplimiento de los compromisos de cada colaborador.',
  },
]

const priorities = [
  {
    label: 'Roja',
    summary: 'Impacto crítico. Revisar todos los días.',
    dot: 'bg-red-500',
    bar: 'bg-red-500',
    shell: 'border-red-200/80 bg-red-50/50',
    chip: 'bg-red-100 text-red-800',
    uses: [
      'Impacta directamente al cliente.',
      'Impacta ingresos.',
      'Detiene el trabajo de otra área.',
      'Genera un riesgo operativo importante.',
    ],
  },
  {
    label: 'Amarilla',
    summary: 'Impacto moderado. Requiere seguimiento.',
    dot: 'bg-amber-500',
    bar: 'bg-amber-500',
    shell: 'border-amber-200/80 bg-amber-50/50',
    chip: 'bg-amber-100 text-amber-900',
    uses: [
      'Impacto operativo moderado.',
      'Requieren seguimiento.',
      'No representan un riesgo crítico.',
    ],
  },
  {
    label: 'Verde',
    summary: 'Impacto menor. Atiéndela a tiempo.',
    dot: 'bg-emerald-500',
    bar: 'bg-emerald-500',
    shell: 'border-emerald-200/80 bg-emerald-50/50',
    chip: 'bg-emerald-100 text-emerald-900',
    uses: [
      'Impacto menor.',
      'Deben atenderse dentro del tiempo establecido.',
      'Evitan acumulación de pendientes.',
    ],
  },
]

const actionCreateFields = [
  {
    field: 'Título',
    required: true,
    detail: 'Nombre corto y claro del compromiso. Debe permitir entender la acción sin abrir el detalle.',
  },
  {
    field: 'Descripción',
    required: true,
    detail: 'Contexto y resultado esperado. Explica qué se debe lograr y por qué importa.',
  },
  {
    field: 'Responsable',
    required: true,
    detail: 'Única persona encargada de ejecutar y mantener actualizada la acción.',
  },
  {
    field: 'Prioridad',
    required: true,
    detail: 'Roja, amarilla o verde según el impacto operativo y el nivel de atención requerido.',
  },
  {
    field: 'Fecha y hora límite',
    required: true,
    detail: 'Fecha compromiso con hora. Representa el acuerdo de entrega; solo cambia con causa documentada.',
  },
  {
    field: 'Evidencia',
    required: false,
    detail:
      'Opcional. Si se activa, indica qué se espera como prueba de cumplimiento: documento, captura, archivo o comentario verificable.',
  },
  {
    field: 'Validaciones',
    required: false,
    detail:
      'Puntos a cumplir para cerrar la acción. Pueden tener responsable asignado cuando sea necesario.',
  },
  {
    field: 'Apoyo documental',
    required: false,
    detail: 'Referencias, archivos o contexto adicional que faciliten la ejecución sin sustituir la evidencia.',
  },
]

const lifecycle = [
  {
    status: 'Asignado',
    detail: 'La acción fue creada y cuenta con responsable, prioridad y fecha compromiso.',
  },
  {
    status: 'Hoy',
    detail:
      'La fecha compromiso corresponde al día actual. El responsable debe cerrar, actualizar o reportar un bloqueo.',
  },
  {
    status: 'Retraso',
    detail:
      'La acción superó la fecha compromiso. El responsable deberá registrar la causa, actualizar el plan o solicitar apoyo.',
  },
  {
    status: 'Por verificar',
    detail: 'El responsable concluyó la ejecución y solicita validación del resultado.',
  },
  {
    status: 'Verificado',
    detail:
      'El solicitante valida que el resultado cumple con el objetivo y la acción se considera cerrada.',
  },
]

const dailyResponsibilities = [
  'Actualizar previamente sus acciones.',
  'Registrar comentarios, evidencias y avances.',
  'Mantener actualizada la información durante la reunión cuando sea necesario.',
]

const rescheduleCauses = [
  {
    category: 'Planeación del trabajo',
    when: 'La estimación inicial o la fecha acordada no fueron realistas.',
  },
  {
    category: 'Dependencias',
    when: 'Se esperaba información, autorización o apoyo de otra persona, área, cliente o proveedor.',
  },
  {
    category: 'Recursos o capacidad',
    when: 'Existió un bloqueo técnico, falta de herramientas, recursos o sobrecarga de trabajo.',
  },
  {
    category: 'Cambios en el compromiso',
    when: 'El alcance, prioridad o contexto del compromiso cambió después de iniciado.',
  },
]

const activitySignals = [
  'Actualización de estatus',
  'Comentario',
  'Checklist',
  'Evidencia',
  'Cambio autorizado de fecha',
  'Modificación relevante de la acción',
]

const escalationSteps = [
  {
    priority: 'Verde',
    rule: 'Si permanece más de 3 días sin actividad',
    result: 'Cambia automáticamente a Prioridad Amarilla.',
    tone: 'border-emerald-200 bg-emerald-50',
  },
  {
    priority: 'Amarilla',
    rule: 'Si permanece 2 días adicionales sin actividad',
    result: 'Cambia automáticamente a Prioridad Roja.',
    tone: 'border-amber-200 bg-amber-50',
  },
  {
    priority: 'Roja',
    rule: 'Si permanece 24 horas sin actividad',
    result: 'Se escala automáticamente al siguiente responsable definido en el organigrama.',
    tone: 'border-red-200 bg-red-50',
  },
]

const roles = [
  {
    title: 'Responsable',
    items: [
      'Ejecuta la acción.',
      'Mantiene actualizada la información.',
      'Registra bloqueos y causas de retraso.',
      'Solicita validación cuando concluye.',
    ],
  },
  {
    title: 'Solicitante',
    items: [
      'Define claramente el resultado esperado.',
      'Valida la evidencia presentada.',
      'Autoriza el cierre.',
    ],
  },
  {
    title: 'Líder',
    items: [
      'Da seguimiento a las acciones de su equipo.',
      'Atiende acciones escaladas.',
      'Remueve bloqueos.',
      'Prioriza la operación.',
    ],
  },
  {
    title: 'Moderador de Daily',
    items: [
      'Mantiene el orden de la reunión.',
      'Facilita la conversación.',
      'Promueve el cumplimiento del reglamento.',
      'No registra información por los participantes.',
    ],
  },
]

const indicators = [
  'ICO (Índice de Confiabilidad Operativa)',
  'Lead Time',
  'Aging',
  'Acciones vencidas',
  'Acciones bloqueadas',
  'Acciones escaladas',
  'Backlog por responsable',
  'Cumplimiento por área',
  'Cumplimiento de acciones rojas',
  'Distribución por prioridades',
]

const principles = [
  'Cada acción tiene un único responsable.',
  'Toda acción debe mantenerse actualizada por quien la ejecuta.',
  'Lo que no está registrado en el tablero no forma parte del seguimiento operativo.',
  'Las fechas compromiso representan acuerdos y sólo podrán modificarse con una causa documentada.',
  'El escalamiento es un mecanismo de apoyo, no una sanción.',
  'La información registrada debe permitir reconstruir la historia completa de la acción.',
]

function SectionShell({
  id,
  title,
  subtitle,
  children,
}: {
  id: ReglamentoNavId
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section id={`reglamento-${id}`} className="scroll-mt-24 space-y-4" aria-labelledby={`reglamento-${id}-title`}>
      <div className="max-w-3xl space-y-2">
        <h2 id={`reglamento-${id}-title`} className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {subtitle ? <p className="text-sm leading-6 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

export function ReglamentoManualSection() {
  const [activeId, setActiveId] = useState<ReglamentoNavId>('objetivo')

  useEffect(() => {
    const sections = navItems
      .map((item) => document.getElementById(`reglamento-${item.id}`))
      .filter((el): el is HTMLElement => Boolean(el))

    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]
        if (!top?.target.id) return
        const id = top.target.id.replace('reglamento-', '') as ReglamentoNavId
        if (navItems.some((item) => item.id === id)) setActiveId(id)
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0.15, 0.35, 0.6] }
    )

    for (const section of sections) observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: ReglamentoNavId) => {
    setActiveId(id)
    document.getElementById(`reglamento-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex flex-col gap-6">
      <nav
        aria-label="Índice del reglamento"
        className="sticky top-2 z-10 -mx-1 overflow-x-auto rounded-xl border border-border/70 bg-card/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80"
      >
        <div className="flex min-w-max gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = activeId === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm',
                  active
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {item.label}
              </button>
            )
          })}
        </div>
      </nav>

      <SectionShell id="objetivo" title="1. Objetivo">
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <p className="text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Establecer las reglas para administrar solicitudes, incidencias y compromisos mediante
              SCRUMBAN, garantizando que toda acción tenga un responsable, una fecha compromiso,
              seguimiento oportuno y cierre verificable.
            </p>
            <p className="text-sm font-medium leading-6 text-foreground sm:text-base sm:leading-7">
              El objetivo no es administrar tareas, sino asegurar que los compromisos se ejecuten con
              visibilidad, trazabilidad y responsabilidad.
            </p>
          </CardContent>
        </Card>
      </SectionShell>

      <SectionShell
        id="alcance"
        title="2. Alcance"
        subtitle="Este reglamento aplica a todas las personas que participan en el ciclo operativo."
      >
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
            {scopeItems.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-lg bg-muted/25 p-3 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-sm leading-6 text-muted-foreground">
          Toda acción registrada deberá cumplir con los lineamientos establecidos en este documento.
        </p>
      </SectionShell>

      <SectionShell
        id="definiciones"
        title="3. Definiciones"
        subtitle="Glosario rápido del modelo operativo."
      >
        <Card className="overflow-hidden rounded-xl border-border/70 shadow-sm">
          <CardContent className="p-0">
            <dl className="grid gap-px bg-border/50 sm:grid-cols-2">
              {definitions.map((item) => (
                <div key={item.term} className="bg-card px-4 py-3.5 sm:px-5">
                  <dt className="mb-1.5">
                    <span className="inline-flex rounded-md bg-slate-800/90 px-2 py-0.5 text-xs font-semibold text-white">
                      {item.term}
                    </span>
                  </dt>
                  <dd className="text-sm leading-5 text-muted-foreground">{item.definition}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </SectionShell>

      <SectionShell
        id="prioridades"
        title="4. Prioridades"
        subtitle="La prioridad indica el impacto operativo y el nivel de atención que requiere la acción."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {priorities.map((item) => (
            <article
              key={item.label}
              className={cn(
                'overflow-hidden rounded-xl border shadow-sm',
                item.shell
              )}
            >
              <div className={cn('h-1.5 w-full', item.bar)} />
              <div className="space-y-3 p-4">
                <div className="flex items-start gap-3">
                  <span className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-full', item.dot)} aria-hidden />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">{item.label}</h3>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', item.chip)}>
                        Prioridad
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium leading-5 text-foreground/80">
                      {item.summary}
                    </p>
                  </div>
                </div>
                <ul className="space-y-1.5 rounded-lg border border-black/5 bg-white/70 p-3 text-sm leading-5 text-muted-foreground">
                  {item.uses.map((use) => (
                    <li key={use} className="flex gap-2">
                      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', item.dot)} aria-hidden />
                      <span>{use}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </SectionShell>

      <SectionShell
        id="crear"
        title="5. Crear una acción"
        subtitle="Toda acción debe nacer completa: compromiso claro, responsable único y criterios de cierre verificables."
      >
        <Card className="overflow-hidden rounded-xl border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="grid gap-px bg-border/50 sm:grid-cols-2">
              {actionCreateFields.map((item, index) => (
                <article key={item.field} className="bg-card px-4 py-3.5 sm:px-5">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">{item.field}</h3>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        item.required
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {item.required ? 'Obligatorio' : 'Opcional'}
                    </span>
                  </div>
                  <p className="text-sm leading-5 text-muted-foreground">{item.detail}</p>
                </article>
              ))}
            </div>
            <div className="border-t border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
              <p className="text-sm leading-6 text-muted-foreground">
                Al guardar, la acción queda en <span className="font-medium text-foreground">Asignado</span> y
                entra al seguimiento operativo. Sin estos datos mínimos, el compromiso no es gestionable.
              </p>
            </div>
          </CardContent>
        </Card>
      </SectionShell>

      <SectionShell id="ciclo" title="6. Ciclo de vida de una acción">
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            {lifecycle.map((item, index) => (
              <div
                key={item.status}
                className="grid gap-2 rounded-xl border border-border/70 bg-muted/15 p-4 sm:grid-cols-[8rem_1fr] sm:items-start"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="font-semibold text-foreground">{item.status}</p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </SectionShell>

      <SectionShell
        id="daily"
        title="7. Daily operativa"
        subtitle="Las reuniones diarias tendrán una duración máxima de 30 minutos y comenzarán a las 9:00 a.m."
      >
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-xl border-border/70 shadow-sm">
            <CardContent className="space-y-3 p-4 sm:p-5">
              <p className="text-sm font-semibold text-foreground">Su objetivo es</p>
              <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                {[
                  'Dar seguimiento a acciones críticas.',
                  'Identificar bloqueos.',
                  'Remover impedimentos.',
                  'Coordinar apoyos.',
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                La Daily no es un espacio para resolver problemas técnicos ni para actualizar el tablero
                por terceros.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-xl border-border/70 shadow-sm">
            <CardContent className="space-y-3 p-4 sm:p-5">
              <p className="text-sm font-semibold text-foreground">Responsabilidades del participante</p>
              <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                {dailyResponsibilities.map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Pregunta guía
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-foreground">
                  ¿Qué necesitamos hacer hoy para que mañana no existan acciones vencidas?
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          El moderador facilita la conversación, pero no captura información por los responsables. La
          información debe registrarse directamente por quien ejecuta la acción.
        </p>
      </SectionShell>

      <SectionShell
        id="reprogramacion"
        title="8. Reprogramación de fechas"
        subtitle="Toda modificación de la fecha compromiso deberá registrar obligatoriamente una causa. No se permitirá cambiar fechas sin documentar el motivo."
      >
        <Card className="overflow-hidden rounded-xl border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-[34%] px-5 py-3 font-semibold">
                      Categoría
                    </th>
                    <th scope="col" className="px-5 py-3 font-semibold">
                      Cuándo utilizarla
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {rescheduleCauses.map((item) => (
                    <tr key={item.category} className="align-top odd:bg-muted/[0.12]">
                      <td className="px-5 py-4 font-semibold text-foreground">{item.category}</td>
                      <td className="px-5 py-4 text-muted-foreground">{item.when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 md:hidden">
              {rescheduleCauses.map((item) => (
                <article key={item.category} className="rounded-lg border border-border/70 bg-muted/10 p-4">
                  <h3 className="font-semibold text-foreground">{item.category}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.when}</p>
                </article>
              ))}
            </div>
          </CardContent>
        </Card>
      </SectionShell>

      <SectionShell
        id="escalamiento"
        title="9. Reglas de escalamiento"
        subtitle="El tablero realizará escalamientos automáticos cuando no exista actividad registrada, para evitar que las acciones permanezcan sin atención."
      >
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div>
              <p className="text-sm font-semibold text-foreground">Se considera actividad</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {activitySignals.map((item) => (
                  <Badge key={item} variant="outline" className="bg-background font-normal">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {escalationSteps.map((item) => (
                <article key={item.priority} className={cn('rounded-xl border p-4', item.tone)}>
                  <p className="text-sm font-semibold text-foreground">Prioridad {item.priority}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.rule}</p>
                  <p className="mt-3 text-sm font-medium text-foreground">{item.result}</p>
                </article>
              ))}
            </div>
            <p className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
              El objetivo del escalamiento no es sancionar, sino asegurar que el responsable reciba apoyo
              oportuno para cumplir el compromiso.
            </p>
          </CardContent>
        </Card>
      </SectionShell>

      <SectionShell id="roles" title="10. Roles y responsabilidades">
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((role) => (
            <Card key={role.title} className="rounded-xl border-border/70 shadow-sm">
              <CardContent className="space-y-3 p-4">
                <p className="font-semibold text-foreground">{role.title}</p>
                <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                  {role.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </SectionShell>

      <SectionShell
        id="indicadores"
        title="11. Indicadores de seguimiento"
        subtitle="El tablero mostrará de forma permanente estos indicadores para sostener la disciplina operativa."
      >
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5">
            {indicators.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-sm text-muted-foreground"
              >
                <Gauge className="h-4 w-4 shrink-0 text-slate-700" aria-hidden />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </SectionShell>

      <SectionShell
        id="principios"
        title="12. Principios del modelo"
        subtitle="Todo usuario deberá considerar las siguientes reglas."
      >
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="space-y-3 p-4 sm:p-5">
            {principles.map((item, index) => (
              <div
                key={item}
                className="flex gap-3 rounded-xl border border-border/70 bg-muted/15 p-4 text-sm leading-6 text-muted-foreground"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </SectionShell>
    </div>
  )
}
