import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bot,
  CircleSlash,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  Target,
  Trash2,
  Truck,
} from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { assistantModes, type AssistantModeId } from '@/lib/assistantModes'
import type { AiChatMessage } from '@/features/ai-support/types'
import { buildOkrAssistantContext } from '@/features/ai-support/buildOkrAssistantContext'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useAcciones } from '@/features/operations/hooks/useAcciones'
import { useAccionCheckpoints } from '@/features/operations/hooks/useAccionCheckpoints'
import { useAccionComentarios } from '@/features/operations/hooks/useAccionComentarios'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'
import { AccionPriorityBadge } from '@/features/operations/components/AccionPriorityBadge'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import { priorityColorFor } from '@/features/operations/utils/priorityColors'
import { useCanSeeOkrTags } from '@/features/okrs/useCanSeeOkrTags'
import { okrService } from '@/features/okrs/service'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import type { AccionCheckpoint, AccionDiaria } from '@/types'
import type { AccionComentario } from '@/types/accionComentario'

const MAX_MESSAGES = 24
const DEFAULT_MODE: AssistantModeId = 'agile_eos_scalingup'
const OPEN_ACTION_STATES = ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso'] as const
const ACTION_PROMPTS = [
  'Valida si esta accion esta lista para cerrarse y dime que falta.',
  'Que evidencia seria suficiente para cerrar esta accion con calidad?',
  'Dame un plan corto para cerrar esta accion hoy.',
  'Que riesgo hay si cierro esta accion con la informacion actual?',
  'Como puedo desbloquear esta accion y a quien debo involucrar?',
]
const OKR_PROMPTS = [
  'Evalua la calidad de este OKR y dime que conviene corregir primero.',
  'Que KRs estan redactados como tareas y como los convertiria en resultado?',
  'Las iniciativas mueven el KR o solo documentan actividad?',
  'Que datos faltan para validar linea base y meta sin inventar X o Y?',
  'El conjunto de KRs demuestra que el objetivo se consiguio?',
]
const ALL_KRS_VALUE = '__all_krs__'
const NO_INITIATIVE_VALUE = '__no_initiative__'
const NO_ACTION_VALUE = '__no_action__'
const NO_OBJECTIVE_VALUE = '__no_objective__'

const MODE_ICONS = {
  agile_eos_scalingup: Sparkles,
  logistics: Truck,
  okr_strategy: Target,
} as const

type ActionContext = {
  id: string
  titulo: string
  descripcion: string
  checklist: Array<{
    texto: string
    completado: boolean
    obligatorio: boolean
  }>
  comentarios: Array<{
    contenido: string
    created_at: string
  }>
  estado: string
  prioridad: string
  fechaCompromiso: string
  horaLimite: string
  evidenciaEsperada: string
  kpiAfectado?: string | null
  okrImpactado?: string | null
  proceso?: string | null
  area?: string | null
  causaRaiz?: string | null
  notasEscalamiento?: string | null
}

async function readChatResponse(response: Response) {
  const text = await response.text()
  if (!text.trim()) return {} as { answer?: string; error?: string }

  try {
    return JSON.parse(text) as { answer?: string; error?: string }
  } catch {
    return { error: text.trim().slice(0, 220) }
  }
}

async function sendMessage({
  mode,
  messages,
  actionContext,
  okrContext,
}: {
  mode: AssistantModeId
  messages: AiChatMessage[]
  actionContext?: ActionContext
  okrContext?: ReturnType<typeof buildOkrAssistantContext>
}) {
  const response = await fetch('/api/gemini-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode,
      messages,
      actionContext,
      okrContext,
    }),
  })

  const data = await readChatResponse(response)

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'No se encontro el endpoint /api/gemini-chat. En local usa Vercel dev o prueba desde el despliegue de Vercel.'
      )
    }

    throw new Error(data?.error || 'No se pudo generar una respuesta.')
  }

  return data.answer || 'No pude generar una respuesta en este momento.'
}

function formatActionOption(action: AccionDiaria) {
  const title = action.titulo_accion || action.descripcion_accion || 'Accion sin titulo'
  return `${title} - ${action.estado} - ${action.fecha}`
}

function toActionContext(
  action: AccionDiaria,
  checkpoints: AccionCheckpoint[],
  comentarios: AccionComentario[]
): ActionContext {
  return {
    id: action.id,
    titulo: action.titulo_accion,
    descripcion: action.descripcion_accion,
    checklist: checkpoints.map((checkpoint) => ({
      texto: checkpoint.texto,
      completado: checkpoint.completado,
      obligatorio: checkpoint.obligatorio,
    })),
    comentarios: comentarios.map((comentario) => ({
      contenido: comentario.contenido,
      created_at: comentario.created_at,
    })),
    estado: action.estado,
    prioridad: action.prioridad,
    fechaCompromiso: action.fecha,
    horaLimite: action.hora_limite,
    evidenciaEsperada: action.evidencia_esperada,
    kpiAfectado: action.kpi_afectado,
    okrImpactado: action.okr_impactado,
    proceso: action.proceso,
    area: action.area,
    causaRaiz: action.causa_raiz,
    notasEscalamiento: action.notas_escalamiento,
  }
}

function CompactToggle({
  active,
  onToggle,
}: {
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary/10 text-primary hover:bg-primary/15'
          : 'bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {active ? 'Usando' : 'Pausado'}
    </button>
  )
}

export function AiAssistPage() {
  const [selectedMode, setSelectedMode] = useState<AssistantModeId>(DEFAULT_MODE)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [actionContextEnabled, setActionContextEnabled] = useState(true)
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null)
  const [selectedKrId, setSelectedKrId] = useState<string | null>(null)
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null)
  const [okrContextEnabled, setOkrContextEnabled] = useState(true)
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const { data: currentUser } = useCurrentUser()
  const canSeeOkrs = useCanSeeOkrTags()
  const { data: priorities = [] } = usePriorities({ activo: true })
  const { data: userOpenActions = [], isLoading: actionsLoading } = useAcciones(
    {
      responsable: currentUser?.id,
      estado: [...OPEN_ACTION_STATES],
    },
    { enabled: Boolean(currentUser?.id) }
  )
  const okrDashboard = useQuery({
    queryKey: ['okrs'],
    queryFn: okrService.dashboard,
    enabled: canSeeOkrs,
  })
  const okrActions = useQuery({
    queryKey: ['okr-actions'],
    queryFn: okrService.actions,
    enabled: canSeeOkrs,
  })

  const currentMode = useMemo(
    () => assistantModes.find((mode) => mode.id === selectedMode) ?? assistantModes[0],
    [selectedMode]
  )

  const redOpenActions = useMemo(() => {
    return userOpenActions
      .filter((action) => {
        const priority = findPriorityForAccion(action, priorities)
        const color = priorityColorFor(priority?.nombre ?? action.prioridad, priority?.color)
        return color === 'rojo' || action.estado === 'Retraso'
      })
      .sort((a, b) => {
        if (a.estado === 'Retraso' && b.estado !== 'Retraso') return -1
        if (a.estado !== 'Retraso' && b.estado === 'Retraso') return 1
        return `${a.fecha} ${a.hora_limite}`.localeCompare(`${b.fecha} ${b.hora_limite}`)
      })
  }, [priorities, userOpenActions])

  const selectedAction = useMemo(
    () => redOpenActions.find((action) => action.id === selectedActionId) ?? null,
    [redOpenActions, selectedActionId]
  )
  const { data: selectedCheckpoints = [], isLoading: checkpointsLoading } = useAccionCheckpoints(
    selectedAction?.id
  )
  const { data: selectedComments = [], isLoading: commentsLoading } = useAccionComentarios(
    selectedAction?.id
  )
  const activeActionContext = Boolean(selectedAction && actionContextEnabled)
  const selectedObjective = useMemo(
    () => okrDashboard.data?.objectives.find((item) => item.id === selectedObjectiveId) ?? null,
    [okrDashboard.data?.objectives, selectedObjectiveId]
  )
  const objectiveKeyResults = useMemo(
    () =>
      selectedObjective
        ? (okrDashboard.data?.keyResults ?? []).filter((item) => item.okr_id === selectedObjective.id)
        : [],
    [okrDashboard.data?.keyResults, selectedObjective]
  )
  const objectiveInitiatives = useMemo(() => {
    if (!selectedObjective) return []
    const krIds = new Set(
      (selectedKrId
        ? objectiveKeyResults.filter((item) => item.id === selectedKrId)
        : objectiveKeyResults
      ).map((item) => item.id)
    )
    return (okrDashboard.data?.initiatives ?? []).filter((item) => krIds.has(item.key_result_id))
  }, [okrDashboard.data?.initiatives, objectiveKeyResults, selectedKrId, selectedObjective])
  const activeOkrContextPayload = useMemo(() => {
    if (!selectedObjective || !okrDashboard.data || !okrContextEnabled) return null
    return buildOkrAssistantContext(okrDashboard.data, okrActions.data ?? [], {
      objectiveId: selectedObjective.id,
      keyResultId: selectedKrId,
      initiativeId: selectedInitiativeId,
      today: todayWallClockCDMX(),
    })
  }, [
    okrActions.data,
    okrContextEnabled,
    okrDashboard.data,
    selectedInitiativeId,
    selectedKrId,
    selectedObjective,
  ])
  const activeOkrContext = Boolean(activeOkrContextPayload)
  const suggestionChips = activeOkrContext
    ? [...OKR_PROMPTS, ...(activeActionContext ? ACTION_PROMPTS.slice(0, 2) : [])]
    : activeActionContext
      ? ACTION_PROMPTS
      : currentMode.suggestions

  const visibleMessages = useMemo(
    () => [{ role: 'assistant' as const, content: currentMode.welcome }, ...messages],
    [currentMode.welcome, messages]
  )

  const selectMode = (mode: AssistantModeId) => {
    setSelectedMode(mode)
    setMessages([])
    setInput('')
  }

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion)
  }

  const handleActionPrompt = (prompt: string) => {
    if (!selectedAction && !selectedObjective) {
      toast.warning('Selecciona una accion roja abierta o un OKR para validarlo.')
      return
    }
    setInput(prompt)
  }

  const clearChat = () => {
    setMessages([])
    setInput('')
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const nextMessages = [...messages, { role: 'user' as const, content: trimmed }].slice(
      -MAX_MESSAGES
    )

    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const answer = await sendMessage({
        mode: selectedMode,
        messages: nextMessages,
        actionContext: activeActionContext
          ? toActionContext(selectedAction!, selectedCheckpoints, selectedComments)
          : undefined,
        okrContext: activeOkrContextPayload ?? undefined,
      })

      setMessages([...nextMessages, { role: 'assistant' as const, content: answer }].slice(-MAX_MESSAGES))
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No pude conectar con el asistente. Intenta nuevamente.'
      toast.error(message)
      setMessages([
        ...nextMessages,
        {
          role: 'assistant' as const,
          content:
            'No pude procesar tu solicitud en este momento. Revisa la configuracion o intenta nuevamente en unos minutos.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const checklistDone = selectedCheckpoints.filter((item) => item.completado).length
  const ModeIcon = MODE_ICONS[currentMode.id]

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <Bot className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Asistente IA</h2>
        <p className="hidden min-w-0 text-xs text-muted-foreground sm:block">
          Valida acciones, evidencias y OKRs.
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {redOpenActions.length} rojas
          </span>
          {activeActionContext || activeOkrContext ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden />
              Contexto
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              <CircleSlash className="h-3.5 w-3.5" aria-hidden />
              Libre
            </span>
          )}
        </div>
      </header>

      <div
        className="flex shrink-0 gap-1 overflow-x-auto rounded-lg border border-border/70 bg-muted/30 p-1"
        role="tablist"
        aria-label="Enfoque de asesoria"
      >
        {assistantModes.map((mode) => {
          const active = selectedMode === mode.id
          const Icon = MODE_ICONS[mode.id]
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={mode.description}
              onClick={() => selectMode(mode.id)}
              className={cn(
                'inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {mode.shortTitle}
            </button>
          )
        })}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(12rem,1fr)] gap-3 md:grid-cols-[minmax(15.5rem,18.5rem)_minmax(0,1fr)] md:grid-rows-none">
        <aside className="grid max-h-[38%] min-h-0 content-start gap-2 overflow-y-auto sm:grid-cols-2 sm:max-h-none md:grid-cols-1 md:max-h-none">
          <section
            className="space-y-2 rounded-lg border border-border/70 bg-card p-3"
            aria-labelledby="assistant-actions-title"
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id="assistant-actions-title"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Accion
              </h3>
              {selectedAction ? (
                <CompactToggle
                  active={actionContextEnabled}
                  onToggle={() => setActionContextEnabled((value) => !value)}
                />
              ) : (
                <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
                  Rojo
                </span>
              )}
            </div>
            <Select
              value={selectedActionId ?? NO_ACTION_VALUE}
              onValueChange={(value) =>
                setSelectedActionId(value === NO_ACTION_VALUE ? null : value)
              }
              disabled={actionsLoading || redOpenActions.length === 0}
            >
              <SelectTrigger className="h-9 bg-background text-xs">
                <SelectValue
                  placeholder={
                    actionsLoading
                      ? 'Cargando...'
                      : redOpenActions.length > 0
                        ? 'Elegir accion roja'
                        : 'Sin acciones rojas'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACTION_VALUE}>Sin accion</SelectItem>
                {redOpenActions.map((action) => (
                  <SelectItem key={action.id} value={action.id}>
                    {formatActionOption(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAction ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <AccionPriorityBadge
                    prioridad={selectedAction.prioridad}
                    catalogColor={findPriorityForAccion(selectedAction, priorities)?.color}
                    compact
                  />
                  <span className="text-muted-foreground">{selectedAction.estado}</span>
                  <span className="text-muted-foreground">
                    {selectedAction.fecha} {selectedAction.hora_limite}
                  </span>
                </div>
                <p className="line-clamp-2 font-medium leading-4 text-foreground">
                  {selectedAction.titulo_accion}
                </p>
                <p className="text-muted-foreground">
                  Checklist{' '}
                  {checkpointsLoading ? '…' : `${checklistDone}/${selectedCheckpoints.length}`}
                  {commentsLoading ? '' : ` · ${selectedComments.length} comentarios`}
                </p>
              </div>
            ) : null}
          </section>

          {canSeeOkrs ? (
            <section
              className="space-y-2 rounded-lg border border-border/70 bg-card p-3"
              aria-labelledby="assistant-okr-title"
            >
              <div className="flex items-center justify-between gap-2">
                <h3
                  id="assistant-okr-title"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  OKR
                </h3>
                {selectedObjective ? (
                  <CompactToggle
                    active={okrContextEnabled}
                    onToggle={() => setOkrContextEnabled((value) => !value)}
                  />
                ) : (
                  <Target className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                )}
              </div>
              <Select
                value={selectedObjectiveId ?? NO_OBJECTIVE_VALUE}
                onValueChange={(value) => {
                  setSelectedObjectiveId(value === NO_OBJECTIVE_VALUE ? null : value)
                  setSelectedKrId(null)
                  setSelectedInitiativeId(null)
                }}
                disabled={okrDashboard.isLoading || (okrDashboard.data?.objectives.length ?? 0) === 0}
              >
                <SelectTrigger className="h-9 bg-background text-xs">
                  <SelectValue
                    placeholder={
                      okrDashboard.isLoading
                        ? 'Cargando...'
                        : (okrDashboard.data?.objectives.length ?? 0) > 0
                          ? 'Elegir objetivo'
                          : 'Sin objetivos'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_OBJECTIVE_VALUE}>Sin objetivo</SelectItem>
                  {(okrDashboard.data?.objectives ?? []).map((objective) => (
                    <SelectItem key={objective.id} value={objective.id}>
                      {objective.nombre_okr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedObjective ? (
                <div className="grid gap-2">
                  <Select
                    value={selectedKrId ?? ALL_KRS_VALUE}
                    onValueChange={(value) => {
                      setSelectedKrId(value === ALL_KRS_VALUE ? null : value)
                      setSelectedInitiativeId(null)
                    }}
                  >
                    <SelectTrigger className="h-9 bg-background text-xs">
                      <SelectValue placeholder="Todo el objetivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_KRS_VALUE}>Todo el objetivo</SelectItem>
                      {objectiveKeyResults.map((kr) => (
                        <SelectItem key={kr.id} value={kr.id}>
                          {kr.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={selectedInitiativeId ?? NO_INITIATIVE_VALUE}
                    onValueChange={(value) =>
                      setSelectedInitiativeId(value === NO_INITIATIVE_VALUE ? null : value)
                    }
                    disabled={objectiveInitiatives.length === 0}
                  >
                    <SelectTrigger className="h-9 bg-background text-xs">
                      <SelectValue
                        placeholder={
                          objectiveInitiatives.length > 0 ? 'Iniciativa' : 'Sin iniciativas'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_INITIATIVE_VALUE}>Sin iniciativa</SelectItem>
                      {objectiveInitiatives.map((initiative) => {
                        const actionId = initiative.action_id ?? initiative.team_action_id
                        const option = (okrActions.data ?? []).find(
                          (action) => action.id === actionId
                        )
                        return (
                          <SelectItem key={initiative.id} value={initiative.id}>
                            {option?.title || 'Iniciativa sin titulo'}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {objectiveKeyResults.length} KR · {objectiveInitiatives.length} iniciativas
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-3 py-2">
            <ModeIcon className="h-4 w-4 text-primary" aria-hidden />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{currentMode.title}</h3>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {currentMode.description}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearChat}
              disabled={loading || messages.length === 0}
              className="ml-auto h-8 gap-1 px-2 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Limpiar</span>
            </Button>
          </div>

          <div
            className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/15 px-3 py-3"
            aria-live="polite"
          >
            {visibleMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  'max-w-[94%] rounded-lg border px-3 py-2 text-sm leading-5 whitespace-pre-wrap sm:max-w-[85%]',
                  message.role === 'user'
                    ? 'ml-auto border-primary/20 bg-primary/10 text-foreground'
                    : 'mr-auto border-border/70 bg-background text-foreground'
                )}
              >
                {message.content}
              </div>
            ))}
            {loading ? (
              <div className="mr-auto flex max-w-[94%] items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Analizando...
              </div>
            ) : null}
          </div>

          <div className="shrink-0 space-y-2 border-t border-border/70 bg-card p-3">
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
              {suggestionChips.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    if (activeActionContext || activeOkrContext) handleActionPrompt(suggestion)
                    else handleSuggestion(suggestion)
                  }}
                  className={cn(
                    'max-w-[16rem] shrink-0 truncate rounded-full border bg-background px-2.5 py-1 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeOkrContext
                      ? 'border-primary/30 text-primary hover:bg-primary/10'
                      : activeActionContext
                        ? 'border-red-500/30 text-red-800 hover:bg-red-500/10 dark:text-red-200'
                        : 'border-border text-muted-foreground hover:text-foreground'
                  )}
                  disabled={loading}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <Label htmlFor="ai-assistant-input" className="sr-only">
              {activeOkrContext
                ? 'Pregunta sobre el OKR seleccionado'
                : activeActionContext
                  ? 'Pregunta sobre la accion seleccionada'
                  : 'Pregunta limpia'}
            </Label>
            <div className="flex items-end gap-2">
              <textarea
                id="ai-assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  activeOkrContext
                    ? 'Este KR mide un resultado o una actividad?'
                    : activeActionContext
                      ? 'Que evidencia falta para cerrar?'
                      : 'Escribe tu pregunta…  Ctrl+Enter para enviar'
                }
                rows={2}
                className="max-h-28 min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
                disabled={loading}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={loading || !input.trim()}
                className="h-11 shrink-0 gap-1.5 px-3"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
                <span className="hidden sm:inline">Enviar</span>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
