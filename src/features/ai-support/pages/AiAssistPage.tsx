import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleSlash,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useAcciones } from '@/features/operations/hooks/useAcciones'
import { useAccionCheckpoints } from '@/features/operations/hooks/useAccionCheckpoints'
import { useAccionComentarios } from '@/features/operations/hooks/useAccionComentarios'
import { usePriorities } from '@/features/catalogs/hooks/usePriorities'
import { AccionPriorityBadge } from '@/features/operations/components/AccionPriorityBadge'
import { findPriorityForAccion } from '@/features/operations/utils/resolveAccionPrioridad'
import { priorityColorFor } from '@/features/operations/utils/priorityColors'
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
}: {
  mode: AssistantModeId
  messages: AiChatMessage[]
  actionContext?: ActionContext
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

export function AiAssistPage() {
  const [selectedMode, setSelectedMode] = useState<AssistantModeId>(DEFAULT_MODE)
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [actionContextEnabled, setActionContextEnabled] = useState(true)
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const { data: currentUser } = useCurrentUser()
  const { data: priorities = [] } = usePriorities({ activo: true })
  const { data: userOpenActions = [], isLoading: actionsLoading } = useAcciones(
    {
      responsable: currentUser?.id,
      estado: [...OPEN_ACTION_STATES],
    },
    { enabled: Boolean(currentUser?.id) }
  )

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
    if (!selectedAction) {
      toast.warning('Selecciona una accion roja abierta para validarla.')
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

  return (
    <div className="max-w-7xl space-y-5 pb-12">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" aria-hidden />
            <h2 className="text-2xl font-bold tracking-tight">Asistente IA</h2>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Selecciona una accion roja abierta y usa la asesoria para validarla, desbloquearla o
            cerrarla con evidencia suficiente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex w-fit items-center gap-2 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-red-600" aria-hidden />
            <span>{redOpenActions.length} rojas abiertas</span>
          </div>
          <Button
            type="button"
            variant={actionContextEnabled ? 'outline' : 'default'}
            size="sm"
            onClick={() => setActionContextEnabled((value) => !value)}
            className="h-9 gap-2"
          >
            {actionContextEnabled ? (
              <HelpCircle className="h-4 w-4" aria-hidden />
            ) : (
              <CircleSlash className="h-4 w-4" aria-hidden />
            )}
            {actionContextEnabled ? 'Contexto activo' : 'Pregunta limpia'}
          </Button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section
            className="space-y-3 rounded-lg border border-border/70 bg-card p-4"
            aria-labelledby="assistant-actions-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="assistant-actions-title" className="text-sm font-semibold text-foreground">
                  Accion a validar
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  El asistente usara solo esta accion como contexto operativo.
                </p>
              </div>
              <span className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-700 dark:text-red-300">
                Rojo
              </span>
            </div>

            <Select
              value={selectedActionId ?? ''}
              onValueChange={(value) => setSelectedActionId(value || null)}
              disabled={actionsLoading || redOpenActions.length === 0}
            >
              <SelectTrigger className="bg-background">
                <SelectValue
                  placeholder={
                    actionsLoading
                      ? 'Cargando acciones...'
                      : redOpenActions.length > 0
                        ? 'Elegir accion roja abierta'
                        : 'Sin acciones rojas abiertas'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {redOpenActions.map((action) => (
                  <SelectItem key={action.id} value={action.id}>
                    {formatActionOption(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedAction ? (
              <div className="space-y-3 rounded-md border border-border/70 bg-muted/20 px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5">
                  <span className="text-xs font-medium text-foreground">
                    {actionContextEnabled ? 'Usando contexto de accion' : 'Contexto pausado'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActionContextEnabled((value) => !value)}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      actionContextEnabled
                        ? 'bg-primary/10 text-primary hover:bg-primary/15'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {actionContextEnabled ? 'Quitar' : 'Activar'}
                  </button>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <AccionPriorityBadge
                      prioridad={selectedAction.prioridad}
                      catalogColor={findPriorityForAccion(selectedAction, priorities)?.color}
                      compact
                    />
                    <span className="rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
                      {selectedAction.estado}
                    </span>
                  </div>
                  <p className="font-medium leading-5 text-foreground">{selectedAction.titulo_accion}</p>
                  <p className="line-clamp-4 text-xs leading-5 text-muted-foreground">
                    {selectedAction.descripcion_accion}
                  </p>
                </div>
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">Checklist</span>
                    <span className="text-xs text-muted-foreground">
                      {checkpointsLoading
                        ? 'Cargando...'
                        : `${selectedCheckpoints.filter((item) => item.completado).length}/${selectedCheckpoints.length}`}
                    </span>
                  </div>
                  {selectedCheckpoints.length > 0 ? (
                    <ul className="space-y-1.5">
                      {selectedCheckpoints.slice(0, 4).map((checkpoint) => (
                        <li
                          key={checkpoint.id}
                          className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-xs leading-5 text-muted-foreground"
                        >
                          <span
                            className={cn(
                              'mt-1 h-2 w-2 rounded-full',
                              checkpoint.completado ? 'bg-emerald-500' : 'bg-amber-500'
                            )}
                            aria-hidden
                          />
                          <span className="line-clamp-2">{checkpoint.texto}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Sin puntos activos en el checklist.
                    </p>
                  )}
                </div>
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">Comentarios</span>
                    <span className="text-xs text-muted-foreground">
                      {commentsLoading ? 'Cargando...' : selectedComments.length}
                    </span>
                  </div>
                  {selectedComments.length > 0 ? (
                    <ul className="space-y-1.5">
                      {selectedComments.slice(-3).map((comentario) => (
                        <li
                          key={comentario.id}
                          className="rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs leading-5 text-muted-foreground"
                        >
                          <span className="line-clamp-2">{comentario.contenido}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Sin comentarios registrados.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-xs">
                  <div>
                    <span className="block text-muted-foreground">Compromiso</span>
                    <span className="font-medium text-foreground">{selectedAction.fecha}</span>
                  </div>
                  <div>
                    <span className="block text-muted-foreground">Hora limite</span>
                    <span className="font-medium text-foreground">{selectedAction.hora_limite}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Elige una accion para activar la validacion guiada.
              </div>
            )}
          </section>

          <section
            className="space-y-3 rounded-lg border border-border/70 bg-card p-4 shadow-sm"
            aria-labelledby="assistant-mode-title"
          >
            <div className="flex items-start gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 id="assistant-mode-title" className="text-sm font-semibold text-foreground">
                  Enfoque de asesoria
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Ajusta el criterio con el que se analiza la accion seleccionada.
                </p>
              </div>
            </div>

            <div className="grid gap-1 rounded-lg border border-border/70 bg-muted/25 p-1">
              {assistantModes.map((mode) => {
                const active = selectedMode === mode.id

                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => selectMode(mode.id)}
                    className={cn(
                      'group grid min-h-[74px] grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-primary/50 bg-background text-foreground shadow-sm ring-1 ring-primary/15'
                        : 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-background/70 hover:text-foreground'
                    )}
                    aria-pressed={active}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition',
                        active
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border/70 bg-background text-muted-foreground group-hover:text-foreground'
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <span className="min-w-0 truncate">{mode.title}</span>
                        {active ? (
                          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            Activo
                          </span>
                        ) : null}
                      </span>
                      <span className="line-clamp-2 text-xs leading-5">{mode.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
              El enfoque cambia el tipo de recomendacion, pero la respuesta sigue acotada a la accion.
            </p>
          </section>
        </aside>

        <Card className="min-w-0">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-col gap-2 border-b border-border/70 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Validacion y cierre</h3>
                  <p className="text-xs text-muted-foreground">
                    Pregunta sobre evidencia, bloqueo, prioridad, riesgo o pasos de cierre.
                  </p>
                </div>
              </div>
              {selectedAction ? (
                <span
                  className={cn(
                    'inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                    actionContextEnabled
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {actionContextEnabled ? (
                    <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <CircleSlash className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {actionContextEnabled ? 'Contexto activo' : 'Pregunta limpia'}
                </span>
              ) : null}
            </div>

            <div
              className="min-h-[340px] max-h-[560px] space-y-3 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 p-4"
              aria-live="polite"
            >
              {visibleMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    'max-w-[92%] rounded-lg border px-3 py-2 text-sm leading-6 whitespace-pre-wrap',
                    message.role === 'user'
                      ? 'ml-auto border-primary/20 bg-primary/10 text-foreground'
                      : 'mr-auto border-border/70 bg-card text-foreground'
                  )}
                >
                  {message.content}
                </div>
              ))}

              {loading ? (
                <div className="mr-auto flex max-w-[92%] items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Analizando...
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {(activeActionContext ? ACTION_PROMPTS : currentMode.suggestions).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    if (activeActionContext) handleActionPrompt(suggestion)
                    else handleSuggestion(suggestion)
                  }}
                  className={cn(
                    'rounded-full border bg-background px-3 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activeActionContext
                      ? 'border-red-500/30 text-red-800 hover:border-red-500/60 hover:bg-red-500/10 dark:text-red-200'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  )}
                  disabled={loading}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-assistant-input">
                {activeActionContext ? 'Pregunta sobre la accion seleccionada' : 'Pregunta limpia'}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <textarea
                  id="ai-assistant-input"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={
                    selectedAction
                      ? actionContextEnabled
                        ? 'Ej. Que evidencia debo adjuntar para cerrarla sin riesgo?'
                        : 'Pregunta sin usar el contexto de la accion seleccionada...'
                      : 'Describe el proceso, problema, objetivo y restricciones...'
                  }
                  className="min-h-[88px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={loading}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                />
                <div className="flex gap-2 sm:flex-col">
                  <Button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={loading || !input.trim()}
                    className="gap-2"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden />
                    )}
                    Enviar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearChat}
                    disabled={loading || messages.length === 0}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Limpiar
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
