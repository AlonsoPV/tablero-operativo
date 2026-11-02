import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bot,
  CircleSlash,
  HelpCircle,
  LayoutGrid,
  ListChecks,
  Loader2,
  Heart,
  Mic,
  MessagesSquare,
  ScanSearch,
  Send,
  Target,
  Trash2,
  X,
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
import { UNIFIED_ASSISTANT_MODE, assistantProfile } from '@/lib/assistantModes'
import type { AiChatMessage } from '@/features/ai-support/types'
import { buildBoardAssistantContext } from '@/features/ai-support/buildBoardAssistantContext'
import { buildOkrAssistantContext } from '@/features/ai-support/buildOkrAssistantContext'
import { serializeAssistantKanbanContext } from '@/features/ai-support/assistantKanbanContext'
import { AssistantVoicePanel } from '@/features/ai-support/components/AssistantVoicePanel'
import { GuidePanel } from '@/features/guide/components/GuidePanel'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { canViewAllBoardData } from '@/features/auth/lib/permissions'
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
const OPEN_ACTION_STATES = ['Pendiente', 'Hoy', 'En_Ejecucion', 'Bloqueado', 'Retraso'] as const
const ANALYSIS_PROMPT =
  'Analiza mis acciones abiertas y OKRs. Dime que conviene optimizar primero y dame 3 recomendaciones ejecutivas.'
const PORTFOLIO_PROMPTS = [
  ANALYSIS_PROMPT,
  'Que acciones retrasadas o bloqueadas deberia atacar hoy?',
  'Que OKRs conviene corregir para que midan resultado y no actividad?',
  'Donde se desconectan mis acciones de los OKRs y que haria con ellas?',
  'Donde hay cuellos de botella logisticos u operativos y que KPI moveria primero?',
]
const ACTION_PROMPTS = [
  'Valida si esta accion esta lista para cerrarse y dime que falta.',
  'Que evidencia seria suficiente para cerrar esta accion con calidad?',
  'Dame un plan corto para cerrar esta accion hoy.',
  'Como puedo desbloquear esta accion y a quien debo involucrar?',
]
const OKR_PROMPTS = [
  'Evalua la calidad de este OKR y dime que conviene corregir primero.',
  'Que KRs estan redactados como tareas y como los convertiria en resultado?',
  'Las iniciativas mueven el KR o solo documentan actividad?',
  'Que datos faltan para validar linea base y meta sin inventar X o Y?',
]
const ALL_KRS_VALUE = '__all_krs__'
const NO_INITIATIVE_VALUE = '__no_initiative__'
const NO_ACTION_VALUE = '__no_action__'
const NO_OBJECTIVE_VALUE = '__no_objective__'

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
  boardContext,
}: {
  mode: typeof UNIFIED_ASSISTANT_MODE
  messages: AiChatMessage[]
  actionContext?: ActionContext
  okrContext?: ReturnType<typeof buildOkrAssistantContext>
  boardContext?: ReturnType<typeof buildBoardAssistantContext>
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
      boardContext,
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

type AiAssistPageProps = {
  /** `popup` = panel flotante compacto; `page` = pantalla completa. */
  variant?: 'page' | 'popup'
}

type FocusKind = 'portfolio' | 'action' | 'okr'
type SurfaceKind = 'chat' | 'voice' | 'guide'

export function AiAssistPage({ variant = 'page' }: AiAssistPageProps = {}) {
  const isPopup = variant === 'popup'
  const [surface, setSurface] = useState<SurfaceKind>('chat')
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [actionContextEnabled, setActionContextEnabled] = useState(true)
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(null)
  const [selectedKrId, setSelectedKrId] = useState<string | null>(null)
  const [selectedInitiativeId, setSelectedInitiativeId] = useState<string | null>(null)
  const [okrContextEnabled, setOkrContextEnabled] = useState(true)
  const [focusKind, setFocusKind] = useState<FocusKind>('portfolio')
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const { data: currentUser } = useCurrentUser()
  const { data: appRole } = useAppRole()
  const canSeeOkrs = useCanSeeOkrTags()
  const seesAllBoard = canViewAllBoardData(currentUser?.rol, appRole)
  const { data: priorities = [] } = usePriorities({ activo: true })
  const { data: userOpenActions = [], isLoading: actionsLoading } = useAcciones(
    {
      ...(seesAllBoard ? {} : { responsable: currentUser?.id }),
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

  const selectableActions = useMemo(() => {
    const hotIds = new Set(redOpenActions.map((action) => action.id))
    return [...userOpenActions].sort((a, b) => {
      const aHot = hotIds.has(a.id) || a.estado === 'Bloqueado'
      const bHot = hotIds.has(b.id) || b.estado === 'Bloqueado'
      if (aHot !== bHot) return aHot ? -1 : 1
      return `${a.fecha} ${a.hora_limite}`.localeCompare(`${b.fecha} ${b.hora_limite}`)
    })
  }, [redOpenActions, userOpenActions])

  const selectedAction = useMemo(
    () => selectableActions.find((action) => action.id === selectedActionId) ?? null,
    [selectableActions, selectedActionId]
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
  const boardContext = useMemo(
    () =>
      buildBoardAssistantContext(
        userOpenActions,
        priorities,
        canSeeOkrs ? okrDashboard.data : null,
        todayWallClockCDMX()
      ),
    [canSeeOkrs, okrDashboard.data, priorities, userOpenActions]
  )
  const voiceContext = useMemo(
    () => serializeAssistantKanbanContext(userOpenActions, boardContext),
    [boardContext, userOpenActions]
  )
  const voiceContextHints = useMemo(() => {
    const hints = ['Kanban']
    if (userOpenActions.length > 0) hints.push(`${userOpenActions.length} abiertas`)
    if (activeActionContext) hints.push('Accion')
    if (activeOkrContext) hints.push('OKR')
    return hints
  }, [activeActionContext, activeOkrContext, userOpenActions.length])
  const suggestionChips = activeOkrContext
    ? [...OKR_PROMPTS, PORTFOLIO_PROMPTS[0]]
    : activeActionContext
      ? [...ACTION_PROMPTS, PORTFOLIO_PROMPTS[0]]
      : PORTFOLIO_PROMPTS

  const welcomeMessage = isPopup
    ? focusKind === 'action'
      ? selectedAction
        ? `Analizando la accion "${selectedAction.titulo_accion}". Que quieres validar?`
        : 'Elige una accion abierta. Puedo ayudarte a cerrarla, desbloquearla o priorizarla.'
      : focusKind === 'okr'
        ? selectedObjective
          ? `Analizando el OKR "${selectedObjective.nombre_okr}". Que quieres diagnosticar?`
          : 'Elige un OKR. Puedo evaluar objetivo, KRs e iniciativas.'
        : 'Listo para priorizar el tablero, validar acciones, diagnosticar OKRs y revisar logistica. Usa Analizar o elige Accion/OKR.'
    : assistantProfile.welcome

  const visibleMessages = useMemo(
    () => [{ role: 'assistant' as const, content: welcomeMessage }, ...messages],
    [messages, welcomeMessage]
  )

  const clearChat = () => {
    setMessages([])
    setInput('')
  }

  const clearOkrSelection = () => {
    setSelectedObjectiveId(null)
    setSelectedKrId(null)
    setSelectedInitiativeId(null)
  }

  const clearActionSelection = () => {
    setSelectedActionId(null)
  }

  /** Solo un foco a la vez: portafolio, accion u OKR. */
  const selectActionFocus = (actionId: string | null) => {
    setSelectedActionId(actionId)
    if (actionId) {
      clearOkrSelection()
      setActionContextEnabled(true)
      setFocusKind('action')
    } else if (focusKind === 'action') {
      setFocusKind('portfolio')
    }
  }

  const selectOkrFocus = (objectiveId: string | null) => {
    setSelectedObjectiveId(objectiveId)
    setSelectedKrId(null)
    setSelectedInitiativeId(null)
    if (objectiveId) {
      clearActionSelection()
      setOkrContextEnabled(true)
      setFocusKind('okr')
    } else if (focusKind === 'okr') {
      setFocusKind('portfolio')
    }
  }

  const switchFocusKind = (kind: FocusKind) => {
    setFocusKind(kind)
    if (kind === 'portfolio') {
      clearActionSelection()
      clearOkrSelection()
      return
    }
    if (kind === 'action') {
      clearOkrSelection()
      setActionContextEnabled(true)
      return
    }
    clearActionSelection()
    setOkrContextEnabled(true)
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, welcomeMessage])

  const handleSend = async (prompt = input) => {
    const trimmed = prompt.trim()
    if (!trimmed || loading) return

    const nextMessages = [...messages, { role: 'user' as const, content: trimmed }].slice(
      -MAX_MESSAGES
    )

    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const answer = await sendMessage({
        mode: UNIFIED_ASSISTANT_MODE,
        messages: nextMessages,
        actionContext: activeActionContext
          ? toActionContext(selectedAction!, selectedCheckpoints, selectedComments)
          : undefined,
        okrContext: activeOkrContextPayload ?? undefined,
        boardContext,
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
  const popupQuickChips = activeOkrContext
    ? [
        { label: 'Calidad OKR', prompt: OKR_PROMPTS[0] },
        { label: 'KRs vs tareas', prompt: OKR_PROMPTS[1] },
      ]
    : activeActionContext
      ? [
          { label: 'Listo para cerrar?', prompt: ACTION_PROMPTS[0] },
          { label: 'Plan de hoy', prompt: ACTION_PROMPTS[2] },
        ]
      : focusKind === 'portfolio'
        ? [
            { label: 'Priorizar hoy', prompt: ANALYSIS_PROMPT },
            { label: 'Atacar bloqueos', prompt: PORTFOLIO_PROMPTS[1] },
          ]
        : []
  const inputId = isPopup ? 'ai-assistant-popup-input' : 'ai-assistant-input'
  const canAnalyze = !loading && (userOpenActions.length > 0 || canSeeOkrs)

  const surfaceTabs = (
    <div
      className={cn(
        'flex shrink-0 gap-1 rounded-lg border border-border/70 bg-muted/30 p-1',
        isPopup && 'rounded-md p-0.5'
      )}
      role="tablist"
      aria-label="Modo del asistente"
    >
      {(
        [
          { id: 'chat' as const, label: 'Chat', icon: MessagesSquare },
          { id: 'voice' as const, label: 'Voz / acciones', icon: Mic },
          { id: 'guide' as const, label: 'Guia', icon: Heart },
        ] as const
      ).map((option) => {
        const active = surface === option.id
        const Icon = option.icon
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setSurface(option.id)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isPopup ? 'min-h-8 px-1.5 text-[11px]' : 'min-h-9 px-2 text-xs',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {option.label}
          </button>
        )
      })}
    </div>
  )

  const analyzePrompt = activeOkrContext
    ? OKR_PROMPTS[0]
    : activeActionContext
      ? ACTION_PROMPTS[0]
      : ANALYSIS_PROMPT

  const analyzeDisabled =
    !canAnalyze ||
    (focusKind === 'action' && !selectedAction) ||
    (focusKind === 'okr' && !selectedObjective)

  const runAnalyze = () => {
    if (surface !== 'chat') setSurface('chat')
    void handleSend(analyzePrompt)
  }

  const popupComposerTools = (
    <>
      <div className="min-w-0 flex-1">{surfaceTabs}</div>
      <Button
        type="button"
        size="sm"
        className="h-8 shrink-0 gap-1 px-2 text-[11px] shadow-sm"
        onClick={runAnalyze}
        disabled={analyzeDisabled}
      >
        <ScanSearch className="h-3.5 w-3.5" aria-hidden />
        Analizar
      </Button>
    </>
  )

  const voicePanel = (
    <AssistantVoicePanel
      context={voiceContext}
      contextHints={voiceContextHints}
      compact={isPopup}
      createdBy={currentUser?.id ?? null}
      className="min-h-0 flex-1"
      composerLead={isPopup ? popupComposerTools : undefined}
    />
  )

  const guidePanel = (
    <GuidePanel
      usuarioId={currentUser?.id ?? null}
      compact={isPopup}
      className="min-h-0 flex-1"
      composerLead={isPopup ? popupComposerTools : undefined}
    />
  )

  const chatThread = (
    <div
      className={cn(
        'min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/15',
        isPopup ? 'px-2.5 py-2' : 'px-3 py-3'
      )}
      aria-live="polite"
    >
      {visibleMessages.map((message, index) => (
        <div
          key={`${message.role}-${index}`}
          className={cn(
            'rounded-lg border whitespace-pre-wrap',
            isPopup
              ? 'max-w-[96%] px-2.5 py-1.5 text-[13px] leading-snug shadow-sm'
              : 'max-w-[94%] px-3 py-2 text-sm leading-5 sm:max-w-[85%]',
            message.role === 'user'
              ? 'ml-auto border-primary/20 bg-primary/10 text-foreground'
              : 'mr-auto border-border/70 bg-background text-foreground'
          )}
        >
          {message.content}
        </div>
      ))}
      {loading ? (
        <div
          className={cn(
            'mr-auto flex items-center gap-2 rounded-lg border border-border/70 bg-background text-muted-foreground',
            isPopup
              ? 'max-w-[96%] px-2.5 py-1.5 text-[13px]'
              : 'max-w-[94%] px-3 py-2 text-sm'
          )}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Analizando...
        </div>
      ) : null}
      <div ref={chatEndRef} />
    </div>
  )

  const composer = (
    <div className={cn('shrink-0 space-y-2 border-t border-border/70 bg-card', isPopup ? 'p-2' : 'p-3')}>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:thin]">
        {(isPopup ? popupQuickChips.map((chip) => chip.label) : suggestionChips).map((suggestion, index) => {
          const prompt = isPopup ? popupQuickChips[index]!.prompt : suggestion
          const label = suggestion
          return (
          <button
            key={`${label}-${index}`}
            type="button"
            onClick={() => (isPopup ? void handleSend(prompt) : setInput(suggestion))}
            className={cn(
              'shrink-0 truncate rounded-full border bg-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isPopup ? 'max-w-none px-2 py-1 text-[10px]' : 'max-w-[16rem] px-2.5 py-1 text-[11px]',
              activeOkrContext
                ? 'border-primary/30 text-primary hover:bg-primary/10'
                : activeActionContext
                  ? 'border-red-500/30 text-red-800 hover:bg-red-500/10 dark:text-red-200'
                  : 'border-border text-muted-foreground hover:text-foreground'
            )}
            disabled={loading}
          >
            {label}
          </button>
          )
        })}
      </div>
      <Label htmlFor={inputId} className="sr-only">
        {activeOkrContext
          ? 'Pregunta sobre el OKR seleccionado'
          : activeActionContext
            ? 'Pregunta sobre la accion seleccionada'
            : 'Analiza acciones y OKRs'}
      </Label>
      <div className="flex flex-wrap items-end gap-2">
        {isPopup ? <div className="flex w-full min-w-0 items-center gap-1">{popupComposerTools}</div> : null}
        <textarea
          id={inputId}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            activeOkrContext
              ? 'Este KR mide resultado o actividad?'
              : activeActionContext
                ? 'Que falta para cerrar?'
                : 'Que optimizo primero?'
          }
          rows={isPopup ? 1 : 2}
          className={cn(
            'flex-1 resize-none rounded-lg border border-input bg-background outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70',
            isPopup
              ? 'max-h-20 min-h-9 px-2.5 py-2 text-[13px]'
              : 'max-h-28 min-h-11 px-3 py-2 text-sm'
          )}
          disabled={loading}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              if (isPopup || event.ctrlKey || event.metaKey) {
                event.preventDefault()
                void handleSend()
              }
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void handleSend()}
          disabled={loading || !input.trim()}
          className={cn('shrink-0 gap-1.5', isPopup ? 'h-9 w-9 px-0' : 'h-11 px-3')}
          aria-label="Enviar"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="h-4 w-4" aria-hidden />
          )}
          {!isPopup ? <span className="hidden sm:inline">Enviar</span> : null}
        </Button>
      </div>
    </div>
  )

  if (isPopup) {
    const focusOptions: Array<{
      id: FocusKind
      label: string
      icon: typeof LayoutGrid
      disabled?: boolean
    }> = [
      { id: 'portfolio', label: 'Tablero', icon: LayoutGrid },
      {
        id: 'action',
        label: 'Accion',
        icon: ListChecks,
        disabled: actionsLoading || selectableActions.length === 0,
      },
      {
        id: 'okr',
        label: 'OKR',
        icon: Target,
        disabled: !canSeeOkrs || okrDashboard.isLoading || (okrDashboard.data?.objectives.length ?? 0) === 0,
      },
    ]

    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-gradient-to-b from-muted/40 to-background">
        {surface === 'voice' ? voicePanel : null}
        {surface === 'guide' ? guidePanel : null}

        {surface === 'chat' ? (
        <>
        <div className="shrink-0 space-y-1.5 border-b border-border/60 px-2 py-1.5">
          <div className="flex items-center gap-1">
            <div
              className="grid min-w-0 flex-1 grid-cols-3 gap-0.5 rounded-lg bg-muted/70 p-0.5"
              role="tablist"
              aria-label="Que analizar"
            >
            {focusOptions.map((option) => {
              const active = focusKind === option.id
              const Icon = option.icon
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  disabled={option.disabled}
                  onClick={() => switchFocusKind(option.id)}
                  className={cn(
                    'inline-flex min-h-7 items-center justify-center gap-1 rounded-md px-1 text-[11px] font-medium transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
                    active
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" aria-hidden />
                  {option.label}
                </button>
              )
            })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={clearChat}
              disabled={loading || messages.length === 0}
              aria-label="Limpiar chat"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          {focusKind === 'portfolio' ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background/80 px-2 py-1.5">
              <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                {userOpenActions.length} abiertas
                {redOpenActions.length > 0 ? ` · ${redOpenActions.length} criticas` : ''}
                {canSeeOkrs ? ` · ${okrDashboard.data?.objectives.length ?? 0} OKRs` : ''}
              </p>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Portafolio
              </span>
            </div>
          ) : null}

          {focusKind === 'action' ? (
            <div className="space-y-1.5">
              <Select
                value={selectedActionId ?? NO_ACTION_VALUE}
                onValueChange={(value) =>
                  selectActionFocus(value === NO_ACTION_VALUE ? null : value)
                }
                disabled={actionsLoading || selectableActions.length === 0}
              >
                <SelectTrigger className="h-8 bg-background text-[11px]">
                  <SelectValue
                    placeholder={
                      actionsLoading
                        ? 'Cargando...'
                        : selectableActions.length > 0
                          ? 'Elegir accion'
                          : 'Sin acciones'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACTION_VALUE}>Sin accion</SelectItem>
                  {selectableActions.map((action) => (
                    <SelectItem key={action.id} value={action.id}>
                      {formatActionOption(action)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAction ? (
                <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <AccionPriorityBadge
                        prioridad={selectedAction.prioridad}
                        catalogColor={findPriorityForAccion(selectedAction, priorities)?.color}
                        compact
                      />
                      <span className="text-[10px] text-muted-foreground">{selectedAction.estado}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[11px] font-medium leading-4">
                      {selectedAction.titulo_accion}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label="Quitar accion"
                    onClick={() => selectActionFocus(null)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ) : (
                <p className="px-0.5 text-[10px] text-muted-foreground">
                  Elige una accion abierta para analizarla.
                </p>
              )}
            </div>
          ) : null}

          {focusKind === 'okr' ? (
            <div className="space-y-1.5">
              <Select
                value={selectedObjectiveId ?? NO_OBJECTIVE_VALUE}
                onValueChange={(value) =>
                  selectOkrFocus(value === NO_OBJECTIVE_VALUE ? null : value)
                }
                disabled={
                  okrDashboard.isLoading || (okrDashboard.data?.objectives.length ?? 0) === 0
                }
              >
                <SelectTrigger className="h-8 bg-background text-[11px]">
                  <SelectValue
                    placeholder={
                      okrDashboard.isLoading
                        ? 'Cargando...'
                        : (okrDashboard.data?.objectives.length ?? 0) > 0
                          ? 'Elegir OKR'
                          : 'Sin OKRs'
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
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[11px] font-medium leading-4">
                        {selectedObjective.nombre_okr}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {objectiveKeyResults.length} KR · {objectiveInitiatives.length} iniciativas
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label="Quitar OKR"
                      onClick={() => selectOkrFocus(null)}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <Select
                    value={selectedKrId ?? ALL_KRS_VALUE}
                    onValueChange={(value) => {
                      setSelectedKrId(value === ALL_KRS_VALUE ? null : value)
                      setSelectedInitiativeId(null)
                    }}
                  >
                    <SelectTrigger className="h-7 bg-background text-[11px]">
                      <SelectValue placeholder="KR" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_KRS_VALUE}>Todos los KR</SelectItem>
                      {objectiveKeyResults.map((kr) => (
                        <SelectItem key={kr.id} value={kr.id}>
                          {kr.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="px-0.5 text-[10px] text-muted-foreground">
                  Elige un OKR para diagnosticarlo.
                </p>
              )}
            </div>
          ) : null}
        </div>

        {chatThread}
        {composer}
        </>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <Bot className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">Asistente IA</h2>
        <p className="hidden min-w-0 text-xs text-muted-foreground sm:block">
          {surface === 'voice'
            ? 'Dicta un pendiente, escucha instrucciones y crea acciones.'
            : surface === 'guide'
              ? 'Acompanamiento reflexivo de 15 minutos y diario privado.'
              : 'Ejecucion, logistica y OKRs en una sola atencion.'}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {surface === 'chat' ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 gap-1 px-2 text-xs"
            onClick={() => void handleSend(analyzePrompt)}
            disabled={!canAnalyze}
          >
            <ScanSearch className="h-3.5 w-3.5" aria-hidden />
            Analizar
          </Button>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
            {userOpenActions.length} abiertas
          </span>
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

      {surfaceTabs}

      {surface === 'voice' || surface === 'guide' ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/70 bg-card">
          {surface === 'voice' ? voicePanel : guidePanel}
        </div>
      ) : (
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
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {userOpenActions.length}
                </span>
              )}
            </div>
            <Select
              value={selectedActionId ?? NO_ACTION_VALUE}
              onValueChange={(value) =>
                selectActionFocus(value === NO_ACTION_VALUE ? null : value)
              }
              disabled={
                Boolean(selectedObjectiveId) ||
                actionsLoading ||
                selectableActions.length === 0
              }
            >
              <SelectTrigger className="h-9 bg-background text-xs">
                <SelectValue
                  placeholder={
                    selectedObjectiveId
                      ? 'Quita el OKR para elegir accion'
                      : actionsLoading
                        ? 'Cargando...'
                        : selectableActions.length > 0
                          ? 'Elegir accion abierta'
                          : 'Sin acciones abiertas'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACTION_VALUE}>Sin accion</SelectItem>
                {selectableActions.map((action) => (
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
            ) : selectedObjectiveId ? (
              <p className="text-[11px] text-muted-foreground">
                Solo un foco por mensaje: limpia el OKR para analizar una accion.
              </p>
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
                onValueChange={(value) =>
                  selectOkrFocus(value === NO_OBJECTIVE_VALUE ? null : value)
                }
                disabled={
                  Boolean(selectedActionId) ||
                  okrDashboard.isLoading ||
                  (okrDashboard.data?.objectives.length ?? 0) === 0
                }
              >
                <SelectTrigger className="h-9 bg-background text-xs">
                  <SelectValue
                    placeholder={
                      selectedActionId
                        ? 'Quita la accion para elegir OKR'
                        : okrDashboard.isLoading
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
              {selectedActionId && !selectedObjective ? (
                <p className="text-[11px] text-muted-foreground">
                  Solo un foco por mensaje: limpia la accion para analizar un OKR.
                </p>
              ) : null}
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
            <Bot className="h-4 w-4 text-primary" aria-hidden />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{assistantProfile.title}</h3>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                {assistantProfile.description}
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

          {chatThread}
          {composer}
        </section>
      </div>
      )}
    </div>
  )
}
