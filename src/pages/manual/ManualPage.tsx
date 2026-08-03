import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Columns3,
  GraduationCap,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ROUTES } from '@/constants'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { canAccessRouteByRole } from '@/features/auth/lib/permissions'
import { GamificationManualSection } from './GamificationManualSection'
import { ReglamentoManualSection } from './ReglamentoManualSection'

type ManualTab = 'tablero' | 'gamificacion' | 'reglamento'

type ManualSection = {
  title: string
  route: string
  icon: typeof BookOpen
  value: string
}

const manualSections: ManualSection[] = [
  {
    title: 'Dashboard',
    route: ROUTES.DASHBOARD,
    icon: BarChart3,
    value: 'Ve la salud operativa.',
  },
  {
    title: 'Kanban',
    route: ROUTES.KANBAN,
    icon: Columns3,
    value: 'Gestiona acciones.',
  },
  {
    title: 'Academia O2C',
    route: ROUTES.ACADEMIA,
    icon: GraduationCap,
    value: 'Aprende la metodología.',
  },
  {
    title: 'Asistente IA',
    route: ROUTES.AI_ASSIST,
    icon: Sparkles,
    value: 'Consulta dudas y redacta.',
  },
  {
    title: 'Disciplina',
    route: ROUTES.DISCIPLINA,
    icon: ShieldCheck,
    value: 'Mide consistencia.',
  },
  {
    title: 'Calendario',
    route: ROUTES.CALENDARIO,
    icon: CalendarDays,
    value: 'Ordena compromisos.',
  },
  {
    title: 'Notificaciones',
    route: ROUTES.NOTIFICACIONES,
    icon: Bell,
    value: 'Revisa alertas.',
  },
  {
    title: 'Configuración',
    route: ROUTES.SETTINGS,
    icon: Settings,
    value: 'Administra reglas base.',
  },
]

const academyTopics = [
  {
    title: 'Crear acciones',
    description: 'Responsable, fecha, prioridad y compromiso claro.',
    icon: Columns3,
    summary: 'Crear una acción significa convertir una conversación o pendiente en un compromiso gestionable.',
    steps: ['Define qué se debe lograr.', 'Asigna un responsable real.', 'Agrega fecha compromiso, prioridad y evidencia esperada.'],
    outcome: 'La acción queda en Asignado y ya puede entrar al seguimiento diario.',
  },
  {
    title: 'Actualizar acciones',
    description: 'Comentarios, avance, bloqueos y seguimiento diario.',
    icon: ClipboardCheck,
    summary: 'Actualizar una acción mantiene confiable el tablero. Sirve para que otros sepan si va en tiempo, está bloqueada o requiere apoyo.',
    steps: ['Comenta avance relevante.', 'Marca bloqueos si impiden continuar.', 'Sube evidencia cuando el avance ya pueda comprobarse.'],
    outcome: 'El tablero refleja la realidad operativa y evita sorpresas al cierre.',
  },
  {
    title: 'Cambiar fecha',
    description: 'Motivo claro y trazabilidad del compromiso.',
    icon: CalendarDays,
    summary: 'Cambiar una fecha no es solo mover un vencimiento. Debe explicar por qué cambió el compromiso.',
    steps: ['Selecciona el motivo correcto.', 'Explica el cambio si afecta alcance o prioridad.', 'Define la nueva fecha con responsabilidad.'],
    outcome: 'Queda trazabilidad para distinguir retraso, dependencia, capacidad o cambio real.',
  },
  {
    title: 'Cerrar acciones',
    description: 'Realizado no es cierre: falta verificación.',
    icon: ShieldCheck,
    summary: 'Cerrar una acción requiere validación. Realizado significa que el responsable terminó; Verificado significa que el resultado fue aceptado.',
    steps: ['El responsable pasa la acción a Por verificar.', 'Quien asignó revisa evidencia.', 'Si cumple, se marca como Verificado.'],
    outcome: 'Verificado se vuelve el definition of done del sistema.',
  },
  {
    title: 'IA',
    description: 'Consulta dudas y redacta seguimiento operativo.',
    icon: Sparkles,
    summary: 'La IA ayuda a explicar, resumir y redactar, pero no reemplaza el criterio operativo.',
    steps: ['Pide resúmenes de acciones o riesgos.', 'Solicita redacción de comentarios ejecutivos.', 'Valida datos sensibles antes de compartir.'],
    outcome: 'Reduce trabajo manual y mejora claridad en seguimiento.',
  },
  {
    title: 'Gamificación',
    description: 'Hábitos, puntos y disciplina cultural.',
    icon: GraduationCap,
    summary: 'La gamificación traduce hábitos operativos en señales visibles de disciplina.',
    steps: ['Suma por actualizar, cerrar y participar.', 'Pierde fuerza cuando hay retrasos o falta de seguimiento.', 'Úsala para reforzar cultura, no para castigar.'],
    outcome: 'Ayuda a que el tablero se use todos los días, no solo antes de reuniones.',
  },
]

const actionStatusLifecycle = [
  {
    status: 'Asignado',
    meaning: 'Acción creada con responsable definido y visible para iniciar.',
    action: 'Confirma responsable, fecha compromiso y prioridad.',
    when: 'Cuando el compromiso apenas entra al tablero.',
    detail: 'Quién lo mueve: quien crea o asigna. Qué pasa: el responsable ya puede verla, comentarla y comenzar ejecución.',
    tone: 'border-sky-200 bg-sky-50 text-sky-900',
    bar: 'bg-sky-500',
  },
  {
    status: 'Hoy',
    meaning: 'La fecha compromiso llega hoy.',
    action: 'Cierra, actualiza avance o registra bloqueo.',
    when: 'Para enfocar el seguimiento diario.',
    detail: 'Quién lo mueve: responsable o quien da seguimiento. Qué pasa: se decide si se completa o requiere intervención.',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
    bar: 'bg-amber-500',
  },
  {
    status: 'Retraso',
    meaning: 'La acción pasó su fecha compromiso sin cerrar.',
    action: 'Identifica causa, bloqueo y nuevo compromiso.',
    when: 'Cuando ya requiere atención correctiva.',
    detail: 'Quién lo mueve: responsable, líder o quien asignó. Qué pasa: se documenta motivo y se desbloquea, cambia fecha o escala.',
    tone: 'border-orange-200 bg-orange-50 text-orange-950',
    bar: 'bg-orange-500',
  },
  {
    status: 'Por verificar',
    meaning: 'El responsable completó la tarea y pide validación.',
    action: 'Quien asignó revisa evidencia y confirma si cumple.',
    when: 'Antes de cerrar una acción como terminada.',
    detail: 'Quién lo mueve: responsable al completar; quien asignó al validar. Qué pasa: se acepta, ajusta o devuelve a seguimiento.',
    tone: 'border-violet-200 bg-violet-50 text-violet-950',
    bar: 'bg-violet-500',
  },
  {
    status: 'Verificado',
    meaning: 'Definition of done: tarea realizada y aceptada.',
    action: 'Cierra el ciclo como ejecución confiable.',
    when: 'Cuando el resultado ya fue validado.',
    detail: 'Quién lo mueve: quien asignó, dirección o rol autorizado. Qué pasa: sale del seguimiento activo y queda como cierre formal.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    bar: 'bg-emerald-500',
  },
]

const commitmentDateChangeCategories = [
  {
    title: 'Planeación del trabajo',
    classification: 'La estimación o la fecha acordada no fueron realistas.',
    when: 'La fecha o el esfuerzo se calcularon mal desde el inicio.',
    includes: 'Tiempo insuficiente, demasiadas actividades asignadas, mala estimación.',
  },
  {
    title: 'Dependencias',
    classification: 'Se esperaba a otra persona, área, cliente o proveedor.',
    when: 'No pudiste continuar porque dependías de otra persona, área, cliente o proveedor.',
    includes: 'Otra área, cliente, proveedor, autorizaciones o información pendiente.',
  },
  {
    title: 'Recursos o capacidad',
    classification: 'Faltaban herramientas, accesos, personal o existió una sobrecarga de trabajo.',
    when: 'Tenías la intención de avanzar, pero algo te lo impidió.',
    includes: 'Fallas técnicas, herramientas, accesos, materiales, sistemas o recursos.',
  },
  {
    title: 'Cambios en el compromiso',
    classification: 'El alcance o la prioridad cambiaron después de iniciado.',
    when: 'El compromiso original cambió después de haber iniciado.',
    includes: 'Cambio de alcance, nueva prioridad o cualquier otra causa con comentario obligatorio.',
  },
]

function tabFromSearchParam(value: string | null): ManualTab {
  if (value === 'gamificacion') return 'gamificacion'
  if (value === 'reglamento') return 'reglamento'
  return 'tablero'
}

export function ManualPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<ManualTab>(
    tabFromSearchParam(searchParams.get('seccion'))
  )
  const [activeTopicIndex, setActiveTopicIndex] = useState(0)
  const [activeStatusIndex, setActiveStatusIndex] = useState(0)
  const { data: currentUser } = useCurrentUser()
  const visibleSections = manualSections.filter((section) =>
    canAccessRouteByRole(currentUser?.rol, section.route)
  )
  const selectedTopic = academyTopics[activeTopicIndex]
  const selectedStatus = actionStatusLifecycle[activeStatusIndex]

  useEffect(() => {
    setActiveTab(tabFromSearchParam(searchParams.get('seccion')))
  }, [searchParams])

  const selectTab = (tab: ManualTab) => {
    setActiveTab(tab)
    if (tab === 'tablero') {
      setSearchParams({}, { replace: false })
      return
    }
    setSearchParams({ seccion: tab }, { replace: false })
  }

  return (
    <div id="manual-page" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 py-5 sm:px-6 sm:py-6">
      <header className="rounded-2xl border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="gap-1.5 border-primary/20 bg-primary/10 text-primary hover:bg-primary/10">
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              Academia SCRUMBAN
            </Badge>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Aprende SCRUMBAN sin leer un manual completo
              </h1>
              <p className="mt-3 text-base leading-7 text-muted-foreground">
                SCRUMBAN es un sistema de gestión operativa que centraliza compromisos, responsables, fechas,
                evidencia y seguimiento hasta el cierre. Su objetivo no es administrar tareas: es asegurar claridad,
                responsabilidad y visibilidad.
              </p>
            </div>
          </div>
          <Card className="w-full rounded-xl border-primary/15 bg-primary/[0.04] shadow-none lg:w-80">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-foreground">Primer recorrido</p>
              <p className="mt-1 text-xs text-muted-foreground">Duración sugerida: 4 minutos</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {['Crear una acción', 'Dar seguimiento', 'Cerrar con verificación'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </header>

      <div role="tablist" aria-label="Secciones del manual" className="grid w-full gap-3 lg:grid-cols-3">
        <button
          type="button"
          role="tab"
          id="manual-tab-tablero"
          aria-selected={activeTab === 'tablero'}
          aria-controls="manual-panel-tablero"
          onClick={() => selectTab('tablero')}
          className={`group flex min-h-20 items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all sm:px-5 ${
            activeTab === 'tablero'
              ? 'border-primary/40 bg-primary/[0.07] text-foreground shadow-sm ring-1 ring-primary/10'
              : 'bg-card text-muted-foreground hover:border-primary/25 hover:bg-muted/30 hover:text-foreground'
          }`}
        >
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${activeTab === 'tablero' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
            <BookOpen className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Aprender SCRUMBAN</span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:text-sm">
              Índice rápido, ciclo y reglas prácticas
            </span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          id="manual-tab-reglamento"
          aria-selected={activeTab === 'reglamento'}
          aria-controls="manual-panel-reglamento"
          onClick={() => selectTab('reglamento')}
          className={`group flex min-h-20 items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all sm:px-5 ${
            activeTab === 'reglamento'
              ? 'border-slate-500/40 bg-slate-500/[0.08] text-foreground shadow-sm ring-1 ring-slate-500/10'
              : 'bg-card text-muted-foreground hover:border-slate-500/25 hover:bg-muted/30 hover:text-foreground'
          }`}
        >
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${activeTab === 'reglamento' ? 'bg-slate-800 text-white' : 'bg-muted text-foreground'}`}>
            <Scale className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Reglamento</span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:text-sm">
              Normas internas del modelo operativo
            </span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          id="manual-tab-gamificacion"
          aria-selected={activeTab === 'gamificacion'}
          aria-controls="manual-panel-gamificacion"
          onClick={() => selectTab('gamificacion')}
          className={`group flex min-h-20 items-center gap-4 rounded-xl border px-4 py-3 text-left transition-all sm:px-5 ${
            activeTab === 'gamificacion'
              ? 'border-amber-500/40 bg-amber-500/[0.08] text-foreground shadow-sm ring-1 ring-amber-500/10'
              : 'bg-card text-muted-foreground hover:border-amber-500/25 hover:bg-muted/30 hover:text-foreground'
          }`}
        >
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${activeTab === 'gamificacion' ? 'bg-amber-500 text-white' : 'bg-muted text-foreground'}`}>
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Gamificación</span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:text-sm">
              Cultura, puntos y hábitos operativos
            </span>
          </span>
        </button>
      </div>

      {activeTab === 'tablero' ? (
        <div
          id="manual-panel-tablero"
          role="tabpanel"
          aria-labelledby="manual-tab-tablero"
          className="flex flex-col gap-6"
        >
          <section className="space-y-4" aria-labelledby="manual-learn-title">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="manual-learn-title" className="text-2xl font-semibold tracking-tight">¿Qué quieres aprender?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Elige una duda frecuente y ve directo al punto.</p>
              </div>
              <Badge variant="outline" className="w-fit bg-background">Resuelve en 30 segundos</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {academyTopics.map((topic, index) => {
                const Icon = topic.icon
                const active = activeTopicIndex === index
                return (
                  <button
                    key={topic.title}
                    type="button"
                    onClick={() => setActiveTopicIndex(index)}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left shadow-sm transition ${
                      active
                        ? 'border-primary/40 bg-primary/[0.07] ring-1 ring-primary/10'
                        : 'bg-card hover:border-primary/25 hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{topic.title}</p>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">{topic.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <Card className="rounded-xl border-border/70 shadow-sm">
              <CardContent className="grid gap-4 p-4 lg:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-lg bg-muted/30 p-4">
                  <p className="text-sm font-semibold text-foreground">{selectedTopic.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedTopic.summary}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_0.85fr]">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cómo hacerlo</p>
                    <ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
                      {selectedTopic.steps.map((step) => (
                        <li key={step} className="flex gap-2">
                          <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Resultado esperado</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedTopic.outcome}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4" aria-labelledby="manual-action-lifecycle-title">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Badge variant="outline" className="mb-2 bg-background">Corazón del sistema</Badge>
                <h2 id="manual-action-lifecycle-title" className="text-2xl font-semibold tracking-tight">
                  Ciclo de vida de una acción
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Da clic en un estado para ver quién lo mueve y qué pasa.
                </p>
              </div>
            </div>

            <Card className="overflow-hidden rounded-xl border-border/70 shadow-sm">
              <CardContent className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-2">
                  {actionStatusLifecycle.map((item, index) => (
                    <button
                      key={item.status}
                      type="button"
                      onClick={() => setActiveStatusIndex(index)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        activeStatusIndex === index
                          ? `${item.tone} shadow-sm`
                          : 'border-border/70 bg-background hover:border-primary/25'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 rounded-full ${item.bar}`} />
                        <span className="font-semibold">{item.status}</span>
                        <span className="ml-auto text-xs text-muted-foreground">Ver detalle</span>
                      </div>
                    </button>
                  ))}
                </div>

                <article className="rounded-xl border border-border/70 bg-background p-4">
                  <div className={`mb-4 h-1.5 rounded-full ${selectedStatus.bar}`} />
                  <h3 className="text-xl font-semibold text-foreground">{selectedStatus.status}</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qué significa</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedStatus.meaning}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Qué debes hacer</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedStatus.action}</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cuándo usarla</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{selectedStatus.when}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-border/70 p-3 text-sm leading-6 text-muted-foreground">
                    {selectedStatus.detail}
                  </div>
                </article>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4" aria-labelledby="manual-fecha-compromiso-title">
            <div className="max-w-3xl space-y-2">
              <h2 id="manual-fecha-compromiso-title" className="text-2xl font-semibold tracking-tight">
                Catálogo de motivos
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Cuando cambie una fecha compromiso, registra el motivo para distinguir planeación, dependencias,
                capacidad o cambios reales del compromiso.
              </p>
            </div>

            <Card className="overflow-hidden rounded-xl border-border/70 shadow-sm">
              <CardContent className="p-0">
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th scope="col" className="w-[28%] px-5 py-3 font-semibold">Categoría</th>
                        <th scope="col" className="w-[36%] px-5 py-3 font-semibold">Cuándo seleccionarla</th>
                        <th scope="col" className="px-5 py-3 font-semibold">Incluye</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {commitmentDateChangeCategories.map((category) => (
                        <tr key={category.title} className="align-top odd:bg-muted/[0.12]">
                          <td className="px-5 py-4">
                            <p className="font-semibold text-foreground">{category.title}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{category.classification}</p>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground">{category.when}</td>
                          <td className="px-5 py-4 text-muted-foreground">{category.includes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 p-4 md:hidden">
                  {commitmentDateChangeCategories.map((category) => (
                    <article key={category.title} className="rounded-lg border border-border/70 bg-muted/10 p-4">
                      <h3 className="font-semibold text-foreground">{category.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{category.classification}</p>
                      <p className="mt-3 text-sm text-muted-foreground">{category.when}</p>
                    </article>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4" aria-labelledby="manual-sections-title">
            <div className="max-w-3xl space-y-2">
              <h2 id="manual-sections-title" className="text-2xl font-semibold tracking-tight">
                Módulos de la academia
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Accesos rápidos. El detalle vive dentro de cada módulo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {visibleSections.map((section) => {
                const Icon = section.icon
                return (
                  <Card key={section.title} className="rounded-xl border-border/70 shadow-sm">
                    <CardContent className="flex h-full flex-col gap-4 p-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 text-primary">
                          <Icon className="h-5 w-5" aria-hidden />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">{section.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{section.value}</p>
                        </div>
                      </div>
                      <Link
                        to={section.route}
                        className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                      >
                        Abrir
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        </div>
      ) : activeTab === 'reglamento' ? (
        <div
          id="manual-panel-reglamento"
          role="tabpanel"
          aria-labelledby="manual-tab-reglamento"
        >
          <ReglamentoManualSection />
        </div>
      ) : (
        <div
          id="manual-panel-gamificacion"
          role="tabpanel"
          aria-labelledby="manual-tab-gamificacion"
        >
          <GamificationManualSection />
        </div>
      )}
    </div>
  )
}
