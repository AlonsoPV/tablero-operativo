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
  FileBarChart,
  GraduationCap,
  HelpCircle,
  Layers3,
  Lightbulb,
  LineChart,
  Map,
  Route,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ROUTES } from '@/constants'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { canAccessRouteByRole } from '@/features/auth/lib/permissions'
import { GamificationManualSection } from './GamificationManualSection'

type ManualSection = {
  title: string
  route: string
  icon: typeof BookOpen
  value: string
  content: string
  useCases: string[]
  tips: string[]
}

const manualSections: ManualSection[] = [
  {
    title: 'Dashboard',
    route: ROUTES.DASHBOARD,
    icon: BarChart3,
    value: 'Da una lectura rapida del pulso operativo del dia.',
    content:
      'Concentra acciones visibles, avance operativo, score global O2C y semaforo KPI. Es la primera vista para saber que esta estable, que requiere atencion y donde conviene entrar al detalle.',
    useCases: [
      'Revisar acciones totales, completadas, bloqueadas y pendientes de evidencia.',
      'Entender el score global O2C y su evolucion reciente.',
      'Detectar KPIs fuera de meta sin abrir reportes separados.',
    ],
    tips: [
      'Usa filtros para mirar un dia, responsable, area o prioridad especifica.',
      'Si una metrica se ve mal, baja al control de acciones antes de concluir la causa.',
    ],
  },
  {
    title: 'Kanban',
    route: ROUTES.KANBAN,
    icon: Columns3,
    value: 'Convierte el seguimiento en ejecucion visible.',
    content:
      'Organiza las acciones por estado y permite revisar responsables, prioridades, vencimientos, comentarios, checklist y evidencias. Es la vista de trabajo diario para mover acciones hasta cierre y verificacion.',
    useCases: [
      'Crear, editar y dar seguimiento a acciones operativas.',
      'Identificar bloqueos, retrasos y proximos vencimientos.',
      'Revisar el mismo trabajo en vista tablero o en tabla.',
    ],
    tips: [
      'Mantén cada accion con responsable, fecha limite, prioridad y evidencia esperada.',
      'No cierres una accion si falta la evidencia que confirma el resultado.',
    ],
  },
  {
    title: 'KPIs O2C',
    route: ROUTES.DASHBOARD_KPIS,
    icon: LineChart,
    value: 'Explica si el proceso mejora contra metas medibles.',
    content:
      'Muestra el portafolio de indicadores O2C, su valor actual, meta, cumplimiento, peso, tendencia y semaforo. Ayuda a separar actividad de resultado: una accion puede avanzar, pero el KPI solo mejora cuando se registra o actualiza la medicion correspondiente.',
    useCases: [
      'Ver que indicadores estan en meta, en riesgo o fuera de meta.',
      'Comparar avance por area, responsable, horizonte y peso del portafolio.',
      'Registrar mediciones para mantener vigente el calculo de cumplimiento.',
    ],
    tips: [
      'Lee primero el semaforo y luego abre el detalle del KPI que tenga mayor peso.',
      'Recuerda que las acciones vinculadas dan contexto, pero no recalculan por si solas el KPI.',
    ],
  },
  {
    title: 'Gaps O2C',
    route: ROUTES.DASHBOARD_GAPS,
    icon: Layers3,
    value: 'Traduce las brechas del proceso en avance ejecutable.',
    content:
      'Agrupa las brechas operativas y muestra su avance por story points, acciones relacionadas, responsable, estado y KPIs vinculados. Sirve para entender que esta cerrando la brecha entre la situacion actual y la meta.',
    useCases: [
      'Priorizar brechas con mayor impacto sobre el portafolio O2C.',
      'Ver si las acciones realmente estan empujando el cierre del gap.',
      'Conectar brechas con KPIs para explicar causa, accion y resultado.',
    ],
    tips: [
      'Un gap con muchas acciones pero poco avance necesita limpieza de alcance o desbloqueo.',
      'Usa los KPIs vinculados para saber si el avance operativo ya se refleja en resultado.',
    ],
  },
  {
    title: 'Alineacion estrategica',
    route: ROUTES.ESTRATEGIA,
    icon: Map,
    value: 'Conecta vision, factores criticos, procesos, gaps y acciones.',
    content:
      'Presenta el mapa estrategico del programa. Ayuda a que el usuario no vea el tablero como una lista de tareas aisladas, sino como una cadena causa-efecto: norte estrategico, capacidades criticas, brechas, KPIs y ejecucion.',
    useCases: [
      'Explicar por que existe cada iniciativa o brecha.',
      'Alinear conversaciones entre direccion, lideres de area y equipos operativos.',
      'Validar que las acciones del dia apunten a resultados relevantes.',
    ],
    tips: [
      'Usa esta vista al inicio de comites para recordar el objetivo comun.',
      'Si una accion no se conecta a un gap o KPI, revisa si realmente pertenece al plan.',
    ],
  },
  {
    title: 'Matriz de Impacto',
    route: ROUTES.DASHBOARD_IMPACTO,
    icon: Target,
    value: 'Ayuda a decidir donde enfocar energia primero.',
    content:
      'Cruza acciones, gaps y KPIs para leer impacto esperado. Es util para ordenar prioridades cuando hay muchas iniciativas compitiendo por tiempo, recursos o atencion directiva.',
    useCases: [
      'Comparar iniciativas por impacto operativo y relacion con KPIs.',
      'Detectar acciones que aportan poco frente al esfuerzo requerido.',
      'Preparar decisiones de priorizacion con una base comun.',
    ],
    tips: [
      'Prioriza lo que mueve KPIs criticos y desbloquea gaps relevantes.',
      'Evita saturar al equipo con acciones de bajo impacto solo porque son faciles.',
    ],
  },
  {
    title: 'Academia O2C',
    route: ROUTES.ACADEMIA,
    icon: GraduationCap,
    value: 'Estandariza conocimiento y disciplina de adopcion.',
    content:
      'Contiene modulos de aprendizaje, materiales e instructivos para reforzar conceptos O2C, metodologia agil, KPIs, gaps y ejecucion. Su valor esta en crear un lenguaje comun para operar el tablero.',
    useCases: [
      'Onboarding de nuevos usuarios o responsables.',
      'Reforzar conceptos antes de sesiones de trabajo.',
      'Dar seguimiento al progreso de aprendizaje.',
    ],
    tips: [
      'Usala como referencia antes de levantar dudas recurrentes en comite.',
      'Combina aprendizaje con practica: cada modulo debe aterrizarse en acciones reales.',
    ],
  },
  {
    title: 'Asistente IA',
    route: ROUTES.AI_ASSIST,
    icon: Sparkles,
    value: 'Acelera analisis y redaccion con contexto del programa.',
    content:
      'Sirve como apoyo para sintetizar hallazgos, preparar reportes, interpretar informacion operativa y estructurar recomendaciones. No reemplaza el criterio del responsable, pero reduce trabajo manual de analisis.',
    useCases: [
      'Preparar resumenes ejecutivos de seguimiento.',
      'Convertir datos operativos en hallazgos accionables.',
      'Generar borradores para reportes, comites o planes de accion.',
    ],
    tips: [
      'Pide respuestas con formato concreto: hallazgos, riesgos, decisiones y siguientes pasos.',
      'Valida cifras y conclusiones sensibles antes de compartirlas fuera del equipo.',
    ],
  },
  {
    title: 'Disciplina',
    route: ROUTES.DISCIPLINA,
    icon: ShieldCheck,
    value: 'Mide consistencia en ejecucion, no solo intencion.',
    content:
      'Da seguimiento a habitos operativos como cierre de acciones, carga de evidencia, seguimiento a pendientes y registro oportuno. Es una vista para mejorar confiabilidad del sistema.',
    useCases: [
      'Ver cumplimiento de rutinas por usuario o equipo.',
      'Detectar comportamientos que afectan calidad del dato.',
      'Dar retroalimentacion sobre uso del tablero.',
    ],
    tips: [
      'Una buena disciplina mantiene el tablero confiable para tomar decisiones.',
      'Si la informacion no se actualiza, el tablero deja de reflejar la realidad.',
    ],
  },
  {
    title: 'Calendario',
    route: ROUTES.CALENDARIO,
    icon: CalendarDays,
    value: 'Ordena compromisos y fechas clave.',
    content:
      'Permite revisar vencimientos y eventos asociados al seguimiento operativo. Ayuda a anticipar cargas de trabajo y evitar que las acciones se atiendan hasta que ya estan vencidas.',
    useCases: [
      'Visualizar fechas limite de acciones.',
      'Preparar la agenda de seguimiento semanal.',
      'Ubicar compromisos proximos por responsable o prioridad.',
    ],
    tips: [
      'Revisa vencimientos antes de cerrar la planeacion diaria.',
      'Si una accion no tiene fecha clara, dificilmente sera gestionable.',
    ],
  },
  {
    title: 'Reportes',
    route: ROUTES.REPORTES,
    icon: FileBarChart,
    value: 'Convierte seguimiento operativo en comunicacion ejecutiva.',
    content:
      'Reune informacion historica y salidas para compartir avances. Su proposito es contar una historia clara: que cambio, que sigue en riesgo y que decisiones se necesitan.',
    useCases: [
      'Preparar cortes de avance para comites.',
      'Consultar historico de reportes y resultados.',
      'Documentar decisiones y aprendizajes del ciclo.',
    ],
    tips: [
      'Un buen reporte no solo lista datos: explica implicaciones y siguientes decisiones.',
      'Acompana cada riesgo con responsable y fecha de accion.',
    ],
  },
  {
    title: 'Notificaciones',
    route: ROUTES.NOTIFICACIONES,
    icon: Bell,
    value: 'Mantiene visibles alertas y cambios importantes.',
    content:
      'Centraliza avisos sobre acciones, vencimientos, comentarios o eventos relevantes. Ayuda a que el equipo no dependa solo de reuniones para enterarse de lo importante.',
    useCases: [
      'Revisar cambios que requieren atencion.',
      'Entrar rapido a una accion mencionada en una alerta.',
      'Distinguir pendientes leidos de no leidos.',
    ],
    tips: [
      'Atiende primero notificaciones vinculadas a bloqueos o vencimientos.',
      'Mantener la bandeja limpia ayuda a no perder alertas criticas.',
    ],
  },
  {
    title: 'Distancias',
    route: ROUTES.DISTANCIAS,
    icon: Route,
    value: 'Apoya calculos logisticos de ruta y duracion.',
    content:
      'Permite consultar distancias, tiempos estimados y rutas guardadas para decisiones operativas. Es util cuando el proceso O2C depende de origen, destino, traslado o compromisos de entrega.',
    useCases: [
      'Calcular una ruta nueva entre origen y destino.',
      'Reutilizar rutas frecuentes guardadas.',
      'Soportar decisiones con duracion y distancia estimadas.',
    ],
    tips: [
      'Guarda rutas recurrentes para evitar capturas repetidas.',
      'Usa el resultado como referencia operativa, no como sustituto de validacion logistica.',
    ],
  },
  {
    title: 'Configuracion',
    route: ROUTES.SETTINGS,
    icon: Settings,
    value: 'Administra usuarios, catalogos y reglas base del tablero.',
    content:
      'Concentra ajustes de perfil, usuarios, areas, roles, prioridades, estatus, dropdowns, KPIs y gaps. Debe usarse con cuidado porque alimenta las opciones y calculos que ven los demas modulos.',
    useCases: [
      'Actualizar datos de usuarios y permisos.',
      'Mantener catalogos activos, claros y sin duplicados.',
      'Administrar KPIs y gaps que soportan el modelo O2C.',
    ],
    tips: [
      'Antes de desactivar un catalogo, confirma que no afecte reportes o acciones abiertas.',
      'Nombra KPIs y gaps de forma entendible para usuarios no tecnicos.',
    ],
  },
]

const operatingFlow = [
  {
    title: '1. Mira el pulso',
    text: 'Entra al Dashboard para ubicar volumen de acciones, bloqueos, evidencia pendiente, score global y semaforo KPI.',
  },
  {
    title: '2. Baja a la ejecucion',
    text: 'Abre Kanban para revisar responsables, estados, vencimientos, checklist, comentarios y evidencias.',
  },
  {
    title: '3. Conecta con resultado',
    text: 'Consulta KPIs O2C y Gaps O2C para saber si la actividad operativa esta cerrando brechas y moviendo indicadores.',
  },
  {
    title: '4. Prioriza y comunica',
    text: 'Usa Alineacion estrategica, Matriz de Impacto y Reportes para enfocar decisiones y explicar avances.',
  },
]

const actionStatusLifecycle = [
  {
    status: 'Asignado',
    purpose: 'La accion ya fue creada, tiene responsable definido y esta visible para iniciar el trabajo.',
    signal: 'Debe tener responsable, fecha compromiso y prioridad claras.',
    next: 'El responsable revisa la indicacion, confirma entendimiento y comienza la ejecucion.',
    tone: 'border-sky-200 bg-sky-50 text-sky-900',
  },
  {
    status: 'Hoy',
    purpose: 'La fecha compromiso llega al dia actual; es la ventana natural para cerrar o actualizar la accion.',
    signal: 'Requiere atencion durante el dia para evitar retraso.',
    next: 'Cerrar si ya se cumplio, comentar avance si falta algo o ajustar con motivo si el compromiso cambio.',
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  {
    status: 'Retraso',
    purpose: 'La accion paso su fecha compromiso sin quedar cerrada; tambien puede indicar bloqueo operativo.',
    signal: 'Debe revisarse causa, responsable del bloqueo y nuevo compromiso si aplica.',
    next: 'Desbloquear, registrar motivo de cambio de fecha o escalar si la dependencia impide avanzar.',
    tone: 'border-orange-200 bg-orange-50 text-orange-950',
  },
  {
    status: 'Por verificar',
    purpose: 'El responsable asignado completo la tarea; quien asigno debe validar que el resultado cumple.',
    signal: 'La evidencia se revisa antes de declarar la accion terminada.',
    next: 'Verificar evidencia, pedir ajuste si falta sustento o pasar a Verificado cuando cumple.',
    tone: 'border-violet-200 bg-violet-50 text-violet-950',
  },
  {
    status: 'Verificado',
    purpose: 'Es el definition of done: el resultado fue validado y permite cerrar el ciclo operativo.',
    signal: 'La accion ya no es solo trabajo realizado; es trabajo aceptado.',
    next: 'Usar como referencia para reportes, disciplina operativa y lectura ejecutiva.',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  },
]

const glossary = [
  {
    term: 'Accion',
    definition: 'Trabajo concreto con responsable, fecha, prioridad, estado y evidencia esperada.',
  },
  {
    term: 'Gap',
    definition: 'Brecha entre la situacion actual del proceso y el nivel objetivo que se quiere alcanzar.',
  },
  {
    term: 'KPI',
    definition: 'Indicador cuantitativo que mide desempeno contra una meta definida.',
  },
  {
    term: 'Score global O2C',
    definition: 'Promedio ponderado del cumplimiento de KPIs elegibles del portafolio.',
  },
  {
    term: 'Semaforo',
    definition: 'Clasificacion visual del cumplimiento: en meta, en riesgo o fuera de meta.',
  },
  {
    term: 'Story points',
    definition: 'Unidad de esfuerzo usada para medir avance relativo de acciones y gaps.',
  },
  {
    term: 'Evidencia',
    definition: 'Archivo, comentario o confirmacion que respalda que una accion fue realizada.',
  },
  {
    term: 'Responsable',
    definition: 'Persona encargada de ejecutar, actualizar o destrabar una accion, KPI o gap.',
  },
]

const commitmentDateChangeCategories = [
  {
    title: '📅 Planeación del trabajo',
    classification: 'La estimación o la fecha acordada no fueron realistas.',
    when: 'La fecha o el esfuerzo se calcularon mal desde el inicio.',
    includes: 'Tiempo insuficiente, demasiadas actividades asignadas, mala estimación.',
  },
  {
    title: '🤝 Dependencias',
    classification: 'Se esperaba a otra persona, área, cliente o proveedor.',
    when: 'No pudiste continuar porque dependías de otra persona, área, cliente o proveedor.',
    includes: 'Otra área, cliente, proveedor, autorizaciones o información pendiente.',
  },
  {
    title: '🛠️ Recursos o capacidad',
    classification: 'Faltaban herramientas, accesos, personal o existió una sobrecarga de trabajo.',
    when: 'Tenías la intención de avanzar, pero algo te lo impidió.',
    includes: 'Fallas técnicas, herramientas, accesos, materiales, sistemas o recursos.',
  },
  {
    title: '🔄 Cambios en el compromiso',
    classification: 'El alcance o la prioridad cambiaron después de iniciado.',
    when: 'El compromiso original cambió después de haber iniciado.',
    includes: 'Cambio de alcance, nueva prioridad o cualquier otra causa con comentario obligatorio.',
  },
]

export function ManualPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<'tablero' | 'gamificacion'>(
    searchParams.get('seccion') === 'gamificacion' ? 'gamificacion' : 'tablero'
  )
  const { data: currentUser } = useCurrentUser()
  const visibleSections = manualSections.filter((section) =>
    canAccessRouteByRole(currentUser?.rol, section.route)
  )
  const flowSteps = operatingFlow.map((step, index) => {
    if (index !== 3 || canAccessRouteByRole(currentUser?.rol, ROUTES.DASHBOARD_IMPACTO)) {
      return step
    }
    return {
      ...step,
      text: 'Usa Alineacion estrategica y Reportes para enfocar decisiones y explicar avances.',
    }
  })

  useEffect(() => {
    const section = searchParams.get('seccion')
    setActiveTab(section === 'gamificacion' ? 'gamificacion' : 'tablero')
  }, [searchParams])

  const selectTab = (tab: 'tablero' | 'gamificacion') => {
    setActiveTab(tab)
    setSearchParams(tab === 'gamificacion' ? { seccion: 'gamificacion' } : {}, {
      replace: false,
    })
  }

  return (
    <div id="manual-page" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 py-5 sm:px-6 sm:py-6">
      <header className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.09] via-background to-amber-500/[0.08] px-5 py-7 shadow-sm sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-8">
          <div className="max-w-4xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-1.5 border-primary/20 bg-primary/10 text-primary hover:bg-primary/10">
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                Centro de ayuda
              </Badge>
              <Badge variant="outline" className="bg-background/70">Operación O2C</Badge>
            </div>
            <div className="space-y-3">
              <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Manual operativo del tablero
              </h1>
              <p className="max-w-3xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
                Aprende a usar cada módulo y consulta las reglas de gamificación desde una guía organizada,
                clara y disponible para toda la organización.
              </p>
            </div>
          </div>
          <div className="hidden h-28 w-28 shrink-0 items-center justify-center rounded-3xl border border-primary/15 bg-background/70 text-primary shadow-sm backdrop-blur lg:flex">
            <BookOpen className="h-12 w-12" strokeWidth={1.5} aria-hidden />
          </div>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Secciones del manual"
        className="grid w-full gap-3 sm:grid-cols-2"
      >
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
            <span className="block font-semibold">Uso del tablero</span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:text-sm">
              Flujo, módulos y buenas prácticas
            </span>
          </span>
          <ArrowRight className={`h-4 w-4 shrink-0 transition-transform ${activeTab === 'tablero' ? 'text-primary' : 'opacity-40 group-hover:translate-x-0.5'}`} aria-hidden />
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
              Actividades, reconocimientos y puntos
            </span>
          </span>
          <ArrowRight className={`h-4 w-4 shrink-0 transition-transform ${activeTab === 'gamificacion' ? 'text-amber-600' : 'opacity-40 group-hover:translate-x-0.5'}`} aria-hidden />
        </button>
      </div>

      {activeTab === 'tablero' ? (
        <div
          id="manual-panel-tablero"
          role="tabpanel"
          aria-labelledby="manual-tab-tablero"
          className="flex flex-col gap-6"
        >
      <section className="space-y-4" aria-labelledby="manual-flow-title">
        <div className="space-y-1.5">
          <h2 id="manual-flow-title" className="text-xl font-semibold tracking-tight sm:text-2xl">Ruta de uso recomendada</h2>
          <p className="text-sm leading-6 text-muted-foreground">Cuatro pasos para pasar de la lectura operativa a una decisión respaldada por evidencia.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {flowSteps.map((step, index) => (
            <Card key={step.title} className="group relative overflow-hidden rounded-xl border-border/70 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/80 to-primary/20" />
              <CardHeader className="gap-3 p-5 pb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
                <CardTitle className="text-base">{step.title.replace(/^\d+\.\s*/, '')}</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-0">
                <p className="text-sm leading-6 text-muted-foreground">{step.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="manual-action-lifecycle-title">
        <div className="max-w-3xl space-y-2">
          <Badge variant="outline" className="bg-background">Lectura pedagogica</Badge>
          <h2 id="manual-action-lifecycle-title" className="text-2xl font-semibold tracking-tight">
            Ciclo de vida de una accion
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            El tablero no solo muestra tarjetas: ensena en que momento esta cada compromiso y que decision toca tomar.
            Lee los estados como una secuencia de trabajo, validacion y cierre.
          </p>
        </div>

        <Card className="overflow-hidden rounded-xl border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden />
              Estados operativos que deben mantenerse
            </CardTitle>
            <CardDescription>
              Asignado, Hoy, Retraso, Por verificar y Verificado explicados desde el comportamiento esperado del usuario.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-5">
              {actionStatusLifecycle.map((item, index) => (
                <article key={item.status} className="flex min-h-full flex-col rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${item.tone}`}>
                      {index + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">{item.status}</h3>
                  </div>
                  <div className="mt-3 space-y-3 text-sm leading-6">
                    <p className="text-muted-foreground">{item.purpose}</p>
                    <div className="rounded-lg bg-muted/30 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Senal</p>
                      <p className="mt-1 text-muted-foreground">{item.signal}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Siguiente accion</p>
                      <p className="mt-1 text-muted-foreground">{item.next}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-4 text-sm leading-6 md:grid-cols-3">
              <div>
                <p className="font-semibold text-foreground">Regla 1: asignar bien</p>
                <p className="mt-1 text-muted-foreground">Una accion sin responsable claro no puede gestionarse con disciplina.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Regla 2: cerrar con evidencia</p>
                <p className="mt-1 text-muted-foreground">La evidencia permite validar que el avance reportado corresponde al resultado esperado.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Regla 3: verificar para cerrar</p>
                <p className="mt-1 text-muted-foreground">Verificado es el cierre real: quien asigno confirma que el definition of done se cumplio.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="manual-fecha-compromiso-title">
        <div className="max-w-3xl space-y-2">
          <h2 id="manual-fecha-compromiso-title" className="text-2xl font-semibold tracking-tight">
            Cambio de fecha compromiso
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Cuando una acción necesita cambiar su fecha compromiso, registra el motivo con una categoría clara. Esto
            permite distinguir entre mala planeación, dependencias externas, falta de recursos o cambios reales del
            compromiso.
          </p>
        </div>

        <Card className="overflow-hidden rounded-xl border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/20 p-5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
              Catálogo de motivos
            </CardTitle>
            <CardDescription>
              Selecciona la categoría que mejor explique por qué cambió la fecha acordada.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-[28%] px-5 py-3 font-semibold">Categoría</th>
                    <th scope="col" className="w-[36%] px-5 py-3 font-semibold">¿Cuándo seleccionarla?</th>
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
                  <dl className="mt-3 space-y-2 text-sm">
                    <div>
                      <dt className="font-medium text-foreground">¿Cuándo seleccionarla?</dt>
                      <dd className="mt-0.5 text-muted-foreground">{category.when}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Incluye</dt>
                      <dd className="mt-0.5 text-muted-foreground">{category.includes}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>

            <div className="border-t bg-amber-500/[0.06] px-5 py-4 text-sm leading-6 text-muted-foreground">
              Si el motivo es <strong className="text-foreground">Cambios en el compromiso</strong>, agrega un
              comentario obligatorio explicando qué cambió en alcance, prioridad o contexto.
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4" aria-labelledby="manual-sections-title">
        <div className="max-w-3xl space-y-2">
          <h2 id="manual-sections-title" className="text-2xl font-semibold tracking-tight">
            Secciones del tablero
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Cada modulo tiene un papel dentro del ciclo de gestion: diagnosticar, ejecutar, medir, aprender y
            reportar. Usa esta guia como mapa rapido cuando un usuario nuevo necesite ubicarse.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {visibleSections.map((section) => {
            const Icon = section.icon
            return (
              <Card key={section.title} className="group rounded-xl border-border/70 shadow-sm transition-all hover:border-primary/20 hover:shadow-md">
                <CardHeader className="gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="text-lg leading-6">{section.title}</CardTitle>
                      <CardDescription className="leading-6">{section.value}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 px-5 pb-5 pt-0">
                  <p className="text-sm leading-6 text-muted-foreground">{section.content}</p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden />
                        Para que usarlo
                      </h3>
                      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                        {section.useCases.map((item) => (
                          <li key={item} className="flex gap-2">
                            <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Lightbulb className="h-4 w-4 text-amber-600" aria-hidden />
                        Buen uso
                      </h3>
                      <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                        {section.tips.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <Link
                    to={section.route}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    Abrir {section.title}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]" aria-label="Criterios de lectura">
        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="p-5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <HelpCircle className="h-5 w-5 text-primary" aria-hidden />
              Como interpretar el tablero
            </CardTitle>
            <CardDescription>
              Tres reglas practicas para evitar lecturas equivocadas y tomar mejores decisiones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-5 pb-5 pt-0 text-sm leading-6 text-muted-foreground">
            <p>
              <strong className="text-foreground">Accion no es resultado.</strong> Una accion cerrada indica
              ejecucion; el KPI confirma si esa ejecucion mejoro el desempeno.
            </p>
            <p>
              <strong className="text-foreground">El gap explica la brecha.</strong> Si un KPI esta fuera de
              meta, busca el gap relacionado para entender que capacidad, proceso o disciplina falta cerrar.
            </p>
            <p>
              <strong className="text-foreground">La evidencia protege la confianza.</strong> Sin evidencia,
              comentario o medicion, el tablero pierde valor como fuente para decisiones ejecutivas.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="p-5">
            <CardTitle className="text-lg">Glosario rapido</CardTitle>
            <CardDescription>Terminos frecuentes del tablero explicados sin tecnicismos.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 px-5 pb-5 pt-0 sm:grid-cols-2 lg:grid-cols-1">
            {glossary.map((item) => (
              <div key={item.term} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-sm font-semibold text-foreground">{item.term}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.definition}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
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
