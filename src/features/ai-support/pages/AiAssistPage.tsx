import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  AtSign,
  Bot,
  ChevronDown,
  LayoutGrid,
  Link2,
  ListChecks,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquareText,
  Mic,
  MicOff,
  PenLine,
  Plus,
  RotateCcw,
  Send,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { CompactToggle, FilterMultiSelect } from '@/features/ai-support/components/FilterMultiSelect'
import { AssistantMessageBody, NumberedSteps } from '@/features/ai-support/components/AssistantMessageBody'
import { OkrScopeSelectors } from '@/features/ai-support/components/OkrScopeSelectors'
import { AssistantSurface, SectionEyebrow } from '@/features/ai-support/components/ui'
import { UNIFIED_ASSISTANT_MODE } from '@/lib/assistantModes'
import type { AiChatMessage } from '@/features/ai-support/types'
import type { BoardAssistantContextPayload } from '@/features/ai-support/buildBoardAssistantContext'
import {
  buildOkrAssistantContext,
  buildOkrAssistantContexts,
} from '@/features/ai-support/buildOkrAssistantContext'
import { serializeAssistantKanbanContext } from '@/features/ai-support/assistantKanbanContext'
import {
  buildOperationalSnapshot,
  detectAssistantIntent,
  sliceContextForIntent,
} from '@/features/ai-support/operationalContext'
import { resolveAssistantTurn } from '@/features/ai-support/consultation/answerConsultation'
import { type ConversationQueryState } from '@/features/ai-support/conversation'
import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import { assistantOperationalContextService } from '@/features/ai-support/services/assistantOperationalContext.service'
import {
  buildAssistantBriefing,
  buildAssistantQuickActions,
  resolveAssistantAudience,
  type AssistantQuickAction,
} from '@/features/ai-support/assistantBriefing'
import { AssistantWelcome } from '@/features/ai-support/components/AssistantWelcome'
import {
  AssistantActivity,
  type AssistantActivityStage,
} from '@/features/ai-support/components/AssistantActivity'
import { friendlyAssistantError } from '@/features/ai-support/assistantErrors'
import { StructuredAssistantReply } from '@/features/ai-support/components/StructuredAssistantReply'
import { AssistantReplyViews } from '@/features/ai-support/chatViews'
import { AssistantProposalCard } from '@/features/ai-support/components/AssistantProposalCard'
import { AssistantClarificationChips } from '@/features/ai-support/components/AssistantClarificationChips'
import { ActionDraftList } from '@/features/ai-support/components/ActionDraftList'
import {
  AssistantLaneChooser,
  AssistantLaneSwitch,
} from '@/features/ai-support/components/AssistantLaneChooser'
import { GuidePanel } from '@/features/guide/components/GuidePanel'
import { useSpeechRecognition } from '@/features/ai-support/useSpeechRecognition'
import { getAssistantAuthHeaders } from '@/lib/assistantApiAuth'
import { requestAssistantTextAnalysis } from '@/lib/assistantAudioClient'
import {
  looksLikeCommsPrepare,
  looksLikeCreateWork,
  looksLikeDraftCorrection,
  resolveWriteIntent,
  type AssistantLane,
  type WriteIntent,
} from '@/features/ai-support/writeIntent'
import { buildCreateApprovalMessage } from '@/features/ai-support/createWorkReply'
import { groundActionDrafts } from '@/features/ai-support/groundActionDrafts'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import {
  canViewAllBoardData,
  isDirectionByRole,
  isLeaderByRole,
} from '@/features/auth/lib/permissions'
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
const PORTFOLIO_PROMPTS = [
  'Cuales he asignado yo?',
  'Cuantas hay en el tablero?',
  'Que acciones llevan dias sin actualizar?',
]
const CONVERSATION_FILTER_CHIPS = [
  'Asignadas a mi',
  'Asignadas por mi',
  'Tablero',
  'Vencidas',
  'Enlistalas',
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

type GeminiChatResponse = {
  answer?: string
  error?: string
  proposals?: AiChatMessage['proposals']
  clarification?: AiChatMessage['clarification']
  ui?: AiChatMessage['ui']
}

async function readChatResponse(response: Response): Promise<GeminiChatResponse> {
  const text = await response.text()
  if (!text.trim()) return {}

  try {
    return JSON.parse(text) as GeminiChatResponse
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
  actionContext?: ActionContext | ActionContext[]
  okrContext?:
    | ReturnType<typeof buildOkrAssistantContext>
    | NonNullable<ReturnType<typeof buildOkrAssistantContext>>[]
  boardContext?: BoardAssistantContextPayload
}) {
  const headers = await getAssistantAuthHeaders()
  const response = await fetch('/api/gemini-chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      mode,
      requestId: messages.at(-1)?.requestId,
      messages: messages
        .filter((message) => !message.failed)
        .map(({ role, content }) => ({ role, content })),
      actionContext,
      okrContext,
      boardContext,
    }),
  })

  const data = await readChatResponse(response)

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(data?.error || 'No autorizado para usar el Asistente IA.')
    }
    if (response.status === 429) {
      throw new Error(data?.error || 'Demasiadas consultas. Espera un momento e intenta de nuevo.')
    }
    if (response.status === 404) {
      throw new Error(
        'No se encontro el endpoint /api/gemini-chat. En local usa Vercel dev o prueba desde el despliegue de Vercel.'
      )
    }

    throw new Error(data?.error || 'No se pudo generar una respuesta.')
  }

  return {
    answer: data.answer || 'No pude generar una respuesta en este momento.',
    proposals: data.proposals,
    clarification: data.clarification,
    ui: data.ui ?? undefined,
  }
}

type SendOptions = {
  /** Corrige la intencion detectada (chip «Tratar como accion/consulta»). */
  forceIntent?: WriteIntent
  /** Reemplaza el ultimo turno en lugar de agregar uno nuevo (reintento o correccion). */
  replay?: boolean
}

function isFlatAssistantMessage(message: AiChatMessage) {
  return Boolean(message.ui?.views?.length || message.analysis || message.proposals?.length)
}

function messagesBeforeLastUser(messages: AiChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.role === 'user') return messages.slice(0, index)
  }
  return messages
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

type AiAssistPageProps = {
  /** `popup` = panel flotante compacto; `page` = pantalla completa. */
  variant?: 'page' | 'popup'
}

type FocusKind = 'portfolio' | 'action' | 'okr'

function laneFromSearch(value: string | null): AssistantLane | null {
  if (value === 'talk' || value === 'write') return value
  return null
}

export function AiAssistPage({ variant = 'page' }: AiAssistPageProps = {}) {
  const isPopup = variant === 'popup'
  const [searchParams, setSearchParams] = useSearchParams()
  const [lane, setLane] = useState<AssistantLane | null>(() => laneFromSearch(searchParams.get('lane')))

  const [pendingVoiceStart, setPendingVoiceStart] = useState(false)

  useEffect(() => {
    if (isPopup) return
    const fromUrl = laneFromSearch(searchParams.get('lane'))
    if (fromUrl) setLane(fromUrl)
  }, [isPopup, searchParams])

  const chooseLane = (next: AssistantLane, options?: { voice?: boolean }) => {
    setLane(next)
    if (options?.voice) setPendingVoiceStart(true)
    // El popup vive sobre otras rutas: no reescribe la URL de la pagina anfitriona.
    if (isPopup) return
    const params = new URLSearchParams(searchParams)
    params.set('lane', next)
    if (options?.voice) params.set('channel', 'voice')
    setSearchParams(params, { replace: true })
  }
  const [activityStage, setActivityStage] = useState<AssistantActivityStage | null>(null)
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([])
  const [actionContextEnabled, setActionContextEnabled] = useState(true)
  const [selectedObjectiveIds, setSelectedObjectiveIds] = useState<string[]>([])
  const [selectedKrIds, setSelectedKrIds] = useState<string[]>([])
  const [selectedInitiativeIds, setSelectedInitiativeIds] = useState<string[]>([])
  const [okrContextEnabled, setOkrContextEnabled] = useState(true)
  const [focusKind, setFocusKind] = useState<FocusKind>('portfolio')
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [conversationState, setConversationState] = useState<ConversationQueryState | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
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
  const operationalLoad = useQuery({
    queryKey: ['assistant-operational-context', currentUser?.id, seesAllBoard],
    queryFn: () =>
      assistantOperationalContextService.loadForUser({
        usuarioId: currentUser!.id,
        seesAllBoard,
      }),
    enabled: Boolean(currentUser?.id),
    staleTime: 30_000,
  })
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

  const selectedActions = useMemo(
    () => selectableActions.filter((action) => selectedActionIds.includes(action.id)),
    [selectableActions, selectedActionIds]
  )
  const primarySelectedAction = selectedActions[0] ?? null
  const { data: selectedCheckpoints = [], isLoading: checkpointsLoading } = useAccionCheckpoints(
    selectedActions.length === 1 ? primarySelectedAction?.id : undefined
  )
  const { data: selectedComments = [] } = useAccionComentarios(
    selectedActions.length === 1 ? primarySelectedAction?.id : undefined
  )
  const activeActionContext = Boolean(selectedActions.length > 0 && actionContextEnabled)
  const selectedObjectives = useMemo(
    () =>
      (okrDashboard.data?.objectives ?? []).filter((item) =>
        selectedObjectiveIds.includes(item.id)
      ),
    [okrDashboard.data?.objectives, selectedObjectiveIds]
  )
  const objectiveKeyResults = useMemo(() => {
    if (selectedObjectives.length === 0) return []
    const objectiveIds = new Set(selectedObjectives.map((item) => item.id))
    return (okrDashboard.data?.keyResults ?? []).filter((item) => objectiveIds.has(item.okr_id))
  }, [okrDashboard.data?.keyResults, selectedObjectives])
  const objectiveInitiatives = useMemo(() => {
    if (selectedObjectives.length === 0) return []
    const krIds = new Set(
      (selectedKrIds.length > 0
        ? objectiveKeyResults.filter((item) => selectedKrIds.includes(item.id))
        : objectiveKeyResults
      ).map((item) => item.id)
    )
    return (okrDashboard.data?.initiatives ?? []).filter((item) => krIds.has(item.key_result_id))
  }, [
    okrDashboard.data?.initiatives,
    objectiveKeyResults,
    selectedKrIds,
    selectedObjectives,
  ])
  const activeOkrContextPayload = useMemo(() => {
    if (selectedObjectives.length === 0 || !okrDashboard.data || !okrContextEnabled) return null
    const items = buildOkrAssistantContexts(okrDashboard.data, okrActions.data ?? [], {
      objectiveIds: selectedObjectives.map((item) => item.id),
      keyResultIds: selectedKrIds,
      initiativeIds: selectedInitiativeIds,
      today: todayWallClockCDMX(),
    })
    if (items.length === 0) return null
    return items.length === 1 ? items[0]! : items
  }, [
    okrActions.data,
    okrContextEnabled,
    okrDashboard.data,
    selectedInitiativeIds,
    selectedKrIds,
    selectedObjectives,
  ])
  const activeOkrContext = Boolean(activeOkrContextPayload)
  const operationalSnapshot = useMemo(() => {
    if (!currentUser?.id) return null
    const openActions = operationalLoad.data?.openActions ?? userOpenActions
    const areas = [
      ...(currentUser.area ? [currentUser.area] : []),
      ...(currentUser.areas ?? []),
    ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)
    return buildOperationalSnapshot({
      usuarioId: currentUser.id,
      rol: currentUser.rol ?? null,
      areas,
      seesAllBoard,
      canSeeOkrs,
      openActions,
      pendingVerificationActions: operationalLoad.data?.pendingVerificationActions ?? [],
      usuarioNombreById: operationalLoad.data?.usuarioNombreById,
      priorities,
      okrData: canSeeOkrs ? okrDashboard.data : null,
      today: todayWallClockCDMX(),
      fetchedAt: operationalLoad.data?.fetchedAt,
    })
  }, [
    canSeeOkrs,
    currentUser,
    okrDashboard.data,
    operationalLoad.data,
    priorities,
    seesAllBoard,
    userOpenActions,
  ])
  const boardContext = operationalSnapshot?.board ?? null
  const conversationPeople = useMemo((): NamedPerson[] => {
    const map = operationalLoad.data?.usuarioNombreById ?? {}
    return Object.entries(map).map(([id, nombre]) => ({ id, nombre }))
  }, [operationalLoad.data?.usuarioNombreById])
  const voiceContext = useMemo(
    () =>
      serializeAssistantKanbanContext(
        operationalLoad.data?.openActions ?? userOpenActions,
        boardContext
      ),
    [boardContext, operationalLoad.data?.openActions, userOpenActions]
  )
  const suggestionChips = activeOkrContext
    ? [...OKR_PROMPTS, PORTFOLIO_PROMPTS[0]]
    : activeActionContext
      ? [...ACTION_PROMPTS, PORTFOLIO_PROMPTS[0]]
      : conversationState?.entity === 'kanban_action'
        ? CONVERSATION_FILTER_CHIPS
        : PORTFOLIO_PROMPTS

  const briefing = useMemo(
    () =>
      buildAssistantBriefing({
        userName: currentUser?.nombre,
        snapshot: operationalSnapshot,
        loading: operationalLoad.isLoading || actionsLoading,
      }),
    [actionsLoading, currentUser?.nombre, operationalLoad.isLoading, operationalSnapshot]
  )
  const quickActions = useMemo(
    () =>
      buildAssistantQuickActions({
        audience: resolveAssistantAudience({
          isDirection: isDirectionByRole(currentUser?.rol),
          isLeader: isLeaderByRole(currentUser?.rol),
          canSeeTeam: seesAllBoard,
        }),
        canSeeOkrs,
      }),
    [canSeeOkrs, currentUser?.rol, seesAllBoard]
  )

  const focusWelcome = useMemo(() => {
    if (focusKind === 'action') {
      if (selectedActions.length === 1) {
        return `Analizando la accion "${selectedActions[0]!.titulo_accion}". Dime que quieres validar o cerrar.`
      }
      if (selectedActions.length > 1) {
        return `Analizando ${selectedActions.length} acciones. Dime que quieres validar, priorizar o cerrar.`
      }
      return 'Elige una o varias acciones abiertas arriba. Puedo ayudarte a cerrarlas, desbloquearlas o priorizarlas.'
    }
    if (focusKind === 'okr') {
      if (selectedObjectives.length === 1) {
        return `Analizando el OKR "${selectedObjectives[0]!.nombre_okr}". Dime que quieres diagnosticar.`
      }
      if (selectedObjectives.length > 1) {
        return `Analizando ${selectedObjectives.length} OKRs. Dime que quieres diagnosticar o priorizar.`
      }
      return 'Elige uno o varios OKRs arriba. Puedo evaluar objetivos, KRs e iniciativas.'
    }
    return null
  }, [focusKind, selectedActions, selectedObjectives])

  const showBriefing = messages.length === 0 && !focusWelcome
  const visibleMessages = useMemo(() => {
    if (messages.length > 0) return messages
    if (focusWelcome) {
      return [{ role: 'assistant' as const, content: focusWelcome }]
    }
    return []
  }, [focusWelcome, messages])

  const clearChat = () => {
    setMessages([])
    setConversationState(null)
    setInput('')
  }

  const clearFilters = () => {
    setSelectedActionIds([])
    setSelectedObjectiveIds([])
    setSelectedKrIds([])
    setSelectedInitiativeIds([])
    setFocusKind('portfolio')
  }

  const hasActiveFilters =
    selectedActionIds.length > 0 ||
    selectedObjectiveIds.length > 0 ||
    selectedKrIds.length > 0 ||
    selectedInitiativeIds.length > 0

  const clearFiltersOrChat = () => {
    if (hasActiveFilters) {
      clearFilters()
      return
    }
    clearChat()
  }

  const setActionSelection = (ids: string[]) => {
    setSelectedActionIds(ids)
    if (ids.length > 0) {
      setActionContextEnabled(true)
      if (focusKind === 'portfolio') setFocusKind('action')
    } else if (focusKind === 'action' && selectedObjectiveIds.length === 0) {
      setFocusKind('portfolio')
    }
  }

  const setObjectiveSelection = (ids: string[]) => {
    setSelectedObjectiveIds(ids)
    setSelectedKrIds((prev) =>
      prev.filter((id) =>
        (okrDashboard.data?.keyResults ?? []).some(
          (kr) => kr.id === id && ids.includes(kr.okr_id)
        )
      )
    )
    setSelectedInitiativeIds((prev) =>
      prev.filter((id) => {
        const initiative = (okrDashboard.data?.initiatives ?? []).find((item) => item.id === id)
        if (!initiative) return false
        const kr = (okrDashboard.data?.keyResults ?? []).find(
          (item) => item.id === initiative.key_result_id
        )
        return Boolean(kr && ids.includes(kr.okr_id))
      })
    )
    if (ids.length > 0) {
      setOkrContextEnabled(true)
      if (focusKind === 'portfolio') setFocusKind('okr')
    } else if (focusKind === 'okr' && selectedActionIds.length === 0) {
      setFocusKind('portfolio')
      setSelectedKrIds([])
      setSelectedInitiativeIds([])
    }
  }

  const switchFocusKind = (kind: FocusKind) => {
    setFocusKind(kind)
    if (kind === 'portfolio') {
      clearFilters()
      return
    }
    if (kind === 'action') {
      setActionContextEnabled(true)
      return
    }
    setOkrContextEnabled(true)
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, showBriefing])

  const handleSend = async (prompt = input, options: SendOptions = {}) => {
    const trimmed = prompt.trim()
    if (!trimmed || loading) return

    const activeLinkedReply = !options.replay ? linkedChatReply : null
    const effectivePrompt =
      activeLinkedReply && looksLikeCommsPrepare(trimmed)
        ? `${trimmed}\n\nUsa como base esta información del chat:\n${activeLinkedReply.slice(0, 1200)}`
        : trimmed

    const history = options.replay ? messagesBeforeLastUser(messages) : messages
    const nextMessages = [
      ...history,
      { role: 'user' as const, content: effectivePrompt, requestId: crypto.randomUUID() },
    ].slice(-MAX_MESSAGES)

    setMessages(nextMessages)
    if (!options.replay) {
      setInput('')
      setLinkedChatReply(null)
      setMentionQuery(null)
    }
    setLoading(true)
    const previousAnalysis = [...history]
      .reverse()
      .find((message) => message.role === 'assistant' && (message.analysis?.actionDrafts.length ?? 0) > 0)
      ?.analysis
    const isCorrection = Boolean(
      !options.forceIntent &&
        previousAnalysis &&
        !looksLikeCreateWork(trimmed) &&
        !looksLikeCommsPrepare(trimmed) &&
        looksLikeDraftCorrection(trimmed)
    )
    const turnIntent: WriteIntent =
      options.forceIntent ?? (isCorrection ? 'create' : resolveWriteIntent(trimmed, 'consult'))
    setActivityStage(turnIntent === 'create' ? 'preparing' : 'querying')

    try {
      if (turnIntent === 'create') {
        const today = todayWallClockCDMX()
        const sourceText = isCorrection ? previousAnalysis!.transcript || trimmed : trimmed
        const correctionText = isCorrection ? trimmed : ''
        const previousHint = previousAnalysis?.actionDrafts[0]?.dueDateHint ?? null
        let result = isCorrection
          ? groundActionDrafts(previousAnalysis!, sourceText, correctionText, today)
          : null
        const dateCorrected =
          Boolean(result) && result!.actionDrafts[0]?.dueDateHint !== previousHint

        if (!dateCorrected) {
          const linkedContext = activeLinkedReply
            ? `Información reciente devuelta por el chat (úsalas para redactar y ligar la tarea):\n${activeLinkedReply.slice(0, 1500)}\n\n${voiceContext}`
            : voiceContext
          const raw = await requestAssistantTextAnalysis({
            text: sourceText,
            context: linkedContext,
            clarifications: correctionText || undefined,
            intent: 'plan_actions',
          })
          result = groundActionDrafts(raw, sourceText, correctionText, today)
        }

        const analysis = {
          ...result!,
          transcript: sourceText,
        }
        const content = buildCreateApprovalMessage(analysis)
        setMessages(
          [...nextMessages, { role: 'assistant' as const, content, analysis, intent: turnIntent }].slice(
            -MAX_MESSAGES
          )
        )
      } else {
        const priorUserMessages = nextMessages
          .filter((row) => row.role === 'user')
          .map((row) => row.content)
          .slice(0, -1)
        const resolved = resolveAssistantTurn({
          message: trimmed,
          snapshot: operationalSnapshot,
          priorUserMessages,
          previousConversation: conversationState,
          people: conversationPeople,
        })
        setConversationState(resolved.conversationState)
        if (resolved.handled && resolved.content) {
          setMessages(
            [
              ...nextMessages,
              {
                role: 'assistant' as const,
                content: resolved.content,
                ui: resolved.ui,
                clarification: resolved.clarification,
                intent: turnIntent,
              },
            ].slice(-MAX_MESSAGES)
          )
          return
        }

        const intent = detectAssistantIntent(trimmed, {
          hasSelectedAction: activeActionContext,
          hasSelectedOkr: activeOkrContext,
          priorUserMessages,
        })
        const hasExplicitFocus = activeActionContext || activeOkrContext
        if (intent === 'concept') {
          setMessages(
            [
              ...nextMessages,
              {
                role: 'assistant' as const,
                content: resolved.content ?? 'Puedo explicarlo sin consultar tus datos. Dime el término.',
                ui: resolved.ui ?? { views: [] },
                intent: turnIntent,
              },
            ].slice(-MAX_MESSAGES)
          )
          return
        }

        const sliced = operationalSnapshot
          ? sliceContextForIntent(operationalSnapshot, intent, { hasExplicitFocus })
          : null
        const reply = await sendMessage({
          mode: UNIFIED_ASSISTANT_MODE,
          messages: nextMessages,
          actionContext:
            activeActionContext || intent === 'selected_action'
              ? selectedActions.length === 1
                ? toActionContext(
                    selectedActions[0]!,
                    selectedCheckpoints,
                    selectedComments
                  )
                : selectedActions.length > 1
                  ? selectedActions.map((action) => toActionContext(action, [], []))
                  : undefined
              : undefined,
          okrContext:
            activeOkrContext || intent === 'selected_okr' || (intent === 'okrs' && sliced?.includeOkrs)
              ? activeOkrContextPayload ?? undefined
              : undefined,
          boardContext: sliced?.boardContext ?? boardContext ?? undefined,
        })
        setMessages(
          [
            ...nextMessages,
            {
              role: 'assistant' as const,
              content: reply.answer,
              proposals: reply.proposals,
              clarification: reply.clarification,
              ui: reply.ui,
              intent: turnIntent,
            },
          ].slice(-MAX_MESSAGES)
        )
      }
    } catch (error) {
      setMessages(
        [
          ...nextMessages,
          { role: 'assistant' as const, content: friendlyAssistantError(error), failed: true },
        ].slice(-MAX_MESSAGES)
      )
    } finally {
      setLoading(false)
      setActivityStage(null)
    }
  }

  const replayLastTurn = (forceIntent?: WriteIntent) => {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user')
    if (lastUser) void handleSend(lastUser.content, { replay: true, forceIntent })
  }

  const dictationPrefixRef = useRef('')
  const speech = useSpeechRecognition({
    onTranscript: (transcript) => {
      const heard = transcript.trim()
      if (!heard) return
      setInput(`${dictationPrefixRef.current}${heard}`)
    },
    onFinalTranscript: (transcript) => {
      const heard = transcript.trim()
      if (!heard) return
      setInput(`${dictationPrefixRef.current}${heard}`)
    },
  })

  const checklistDone = selectedCheckpoints.filter((item) => item.completado).length
  const inputId = isPopup ? 'ai-assistant-popup-input' : 'ai-assistant-input'
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [linkedChatReply, setLinkedChatReply] = useState<string | null>(null)
  const [mentionQuery, setMentionQuery] = useState<{ start: number; end: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const createMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!createMenuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCreateMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [createMenuOpen])

  const sortedPeople = useMemo(
    () => [...conversationPeople].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [conversationPeople]
  )

  const filteredMentionPeople = useMemo(() => {
    if (!mentionQuery) return []
    const q = mentionQuery.query
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
    const matches = q
      ? sortedPeople.filter((person) =>
          person.nombre
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .includes(q)
        )
      : sortedPeople
    return matches.slice(0, 6)
  }, [mentionQuery, sortedPeople])

  const updateMentionFromCursor = (value: string, cursorPos: number | null) => {
    const pos = cursorPos ?? value.length
    const before = value.slice(0, pos)
    const match = before.match(/(?:^|\s)@([^\s@]*)$/)
    if (!match) {
      setMentionQuery(null)
      return
    }
    const atIndex = before.lastIndexOf('@')
    setMentionQuery({ start: atIndex, end: pos, query: match[1] ?? '' })
    setMentionIndex(0)
  }

  const handleSelectMention = (person: NamedPerson) => {
    if (!mentionQuery) return
    const before = input.slice(0, mentionQuery.start)
    const after = input.slice(mentionQuery.end)
    const inserted = `@${person.nombre} `
    const nextValue = `${before}${inserted}${after}`
    const nextCursor = before.length + inserted.length
    setInput(nextValue)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const lastAssistantReply = useMemo(() => {
    const last = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && !message.failed && message.content.trim())
    return last?.content.trim() ?? null
  }, [messages])

  const CREATE_QUICK_OPTIONS = [
    { id: 'tarea', label: 'Tarea', prefix: 'Crea una tarea para @', icon: ListChecks },
    { id: 'whatsapp', label: 'WhatsApp', prefix: 'Envía un WhatsApp a @', icon: MessageCircle },
    { id: 'correo', label: 'Correo', prefix: 'Envía un correo a @', icon: Mail },
  ] as const

  const handleSelectCreateOption = (prefix: string) => {
    setCreateMenuOpen(false)
    setInput(prefix)
    if (lastAssistantReply) {
      setLinkedChatReply(lastAssistantReply)
    }
    updateMentionFromCursor(prefix, prefix.length)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(prefix.length, prefix.length)
    })
  }

  const handleQuickAction = (action: AssistantQuickAction) => {
    void handleSend(action.prompt)
  }

  const guidePanel = (
    <GuidePanel
      usuarioId={currentUser?.id ?? null}
      compact={isPopup}
      className="min-h-0 flex-1"
      autoStartVoice={pendingVoiceStart || (!isPopup && searchParams.get('channel') === 'voice')}
      onAutoStartVoice={() => {
        setPendingVoiceStart(false)
        if (isPopup || searchParams.get('channel') !== 'voice') return
        const next = new URLSearchParams(searchParams)
        next.delete('channel')
        setSearchParams(next, { replace: true })
      }}
    />
  )

  const okrScopeSelectors = (
    <OkrScopeSelectors
      keyResults={objectiveKeyResults.map((kr) => ({ value: kr.id, label: kr.title }))}
      initiatives={objectiveInitiatives.map((initiative) => {
        const actionId = initiative.action_id ?? initiative.team_action_id
        const option = (okrActions.data ?? []).find((action) => action.id === actionId)
        return {
          id: initiative.id,
          key_result_id: initiative.key_result_id,
          value: initiative.id,
          label: option?.title || 'Iniciativa sin titulo',
        }
      })}
      selectedKrIds={selectedKrIds}
      selectedInitiativeIds={selectedInitiativeIds}
      onKrChange={setSelectedKrIds}
      onInitiativeChange={setSelectedInitiativeIds}
    />
  )

  const chatThread = (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain',
        isPopup
          ? 'space-y-3 bg-[linear-gradient(180deg,hsl(var(--muted)/0.35)_0%,hsl(var(--background))_48%)] px-3 py-3'
          : 'relative px-3 py-3 sm:px-6 sm:py-5'
      )}
      aria-live="polite"
    >
      <div className={cn('mx-auto w-full space-y-3', !isPopup && 'max-w-3xl')}>
        {showBriefing ? (
          <div className={cn('w-full', isPopup ? 'px-0.5' : 'pt-1 sm:pt-2')}>
            <AssistantWelcome
              briefing={briefing}
              counts={operationalSnapshot?.counts ?? null}
              actions={quickActions}
              loading={operationalLoad.isLoading || actionsLoading}
              compact={isPopup}
              onAsk={(prompt) => void handleSend(prompt)}
              onAction={handleQuickAction}
            />
          </div>
        ) : null}

        {visibleMessages.map((message, index) => (
        <div key={`${message.role}-${index}`} className="space-y-2">
          <div
            className={cn(
              'flex items-end gap-2',
              message.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            {message.role === 'assistant' && !isPopup ? (
              <span className="mb-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Bot className="h-3.5 w-3.5" aria-hidden />
              </span>
            ) : null}
            <div
              className={cn(
                message.role === 'user'
                  ? isPopup
                    ? 'max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3 py-2 text-[13px] leading-5 text-primary-foreground shadow-sm'
                    : 'max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-5 text-primary-foreground shadow-[0_10px_24px_-14px_hsl(var(--primary)/0.65)] sm:max-w-[80%]'
                  : message.failed
                    ? cn(
                        'w-full rounded-2xl rounded-bl-md bg-destructive/[0.06] text-foreground ring-1 ring-destructive/25',
                        isPopup ? 'max-w-[95%] px-3 py-2.5' : 'max-w-[90%] px-3.5 py-3 sm:max-w-[82%]'
                      )
                    : isFlatAssistantMessage(message)
                      ? cn('w-full text-foreground', isPopup ? 'max-w-full' : 'max-w-[90%] sm:max-w-[82%]')
                      : isPopup
                        ? 'w-full max-w-[95%] rounded-2xl rounded-bl-md bg-card px-3 py-2.5 text-foreground shadow-sm ring-1 ring-border/45'
                        : 'w-full max-w-[90%] rounded-2xl rounded-bl-md bg-card px-3.5 py-3 text-foreground shadow-sm ring-1 ring-border/50 sm:max-w-[82%]'
              )}
            >
              {message.role === 'assistant' && message.failed ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={cn('leading-5', isPopup ? 'text-[13px]' : 'text-sm')}>{message.content}</p>
                  {index === visibleMessages.length - 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full"
                      disabled={loading}
                      onClick={() => replayLastTurn()}
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Reintentar
                    </Button>
                  ) : null}
                </div>
              ) : message.role === 'assistant' ? (
                message.ui?.views?.length ? (
                  <AssistantReplyViews
                    ui={message.ui}
                    narrative={message.structured ? undefined : message.content}
                    compact={isPopup}
                    onFollowUp={
                      index === visibleMessages.length - 1
                        ? (followUp) => void handleSend(followUp)
                        : undefined
                    }
                  />
                ) : message.structured ? (
                  <StructuredAssistantReply reply={message.structured} compact={isPopup} />
                ) : message.proposals?.some(
                    (proposal) => proposal.summary.trim() === message.content.trim()
                  ) ? null : (
                  <AssistantMessageBody content={message.content} compact={isPopup} />
                )
              ) : (
                message.content
              )}
              {message.role === 'assistant' && message.clarification ? (
                <AssistantClarificationChips
                  clarification={message.clarification}
                  compact={isPopup}
                  onSelect={(label) => void handleSend(label)}
                />
              ) : null}
              {message.role === 'assistant' && message.proposals?.length
                ? message.proposals.map((proposal) => (
                    <AssistantProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      compact={isPopup}
                      onResolved={(status) => {
                        if (status === 'confirmed') {
                          void queryClient.invalidateQueries({ queryKey: ['acciones'] })
                          void queryClient.invalidateQueries({
                            queryKey: ['assistant-operational-context'],
                          })
                        }
                      }}
                    />
                  ))
                : null}
              {message.role === 'assistant' && message.analysis ? (
                <div className="mt-3 space-y-2">
                  {message.analysis.nextSteps.length > 0 && message.analysis.actionDrafts.length === 0 ? (
                    <div className="space-y-1.5">
                      <SectionEyebrow>Proximos pasos</SectionEyebrow>
                      <NumberedSteps items={message.analysis.nextSteps.slice(0, 3)} />
                    </div>
                  ) : null}
                  <ActionDraftList
                    result={message.analysis}
                    createdBy={currentUser?.id ?? null}
                    compact={isPopup}
                  />
                </div>
              ) : null}
            </div>
          </div>
          {message.role === 'assistant' &&
          message.intent &&
          !message.clarification &&
          !loading &&
          index === visibleMessages.length - 1 ? (
            <div className={cn('flex', !isPopup && 'pl-9')}>
              <button
                type="button"
                onClick={() => replayLastTurn(message.intent === 'create' ? 'consult' : 'create')}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition duration-150',
                  'hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                )}
              >
                {message.intent === 'create' ? (
                  <MessageSquareText className="h-3 w-3" aria-hidden />
                ) : (
                  <PenLine className="h-3 w-3" aria-hidden />
                )}
                {message.intent === 'create' ? 'Tratar como consulta' : 'Tratar como acción'}
              </button>
            </div>
          ) : null}
        </div>
      ))}
      {loading ? (
        <div className={cn(!isPopup && 'pl-9')}>
          <AssistantActivity stage={activityStage ?? 'querying'} compact={isPopup} />
        </div>
      ) : null}
      <div ref={chatEndRef} />
      </div>
    </div>
  )

  const composer = (
    <div
      className={cn(
        'shrink-0',
        isPopup
          ? 'space-y-2 border-t border-border/50 bg-card/90 p-2.5 backdrop-blur-sm'
          : 'bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-3 pt-1.5 sm:px-6 sm:pb-4'
      )}
    >
      <div
        className={cn(
          'space-y-1.5',
          !isPopup &&
            'mx-auto w-full max-w-3xl rounded-2xl bg-background/90 p-2 shadow-[0_14px_30px_-22px_hsl(var(--foreground)/0.4)] ring-1 ring-border/50 backdrop-blur-sm'
        )}
      >
        {!isPopup && (!showBriefing || activeOkrContext || activeActionContext) ? (
          <div className="min-w-0 overflow-x-auto [scrollbar-width:none]">
            <div className="flex w-max gap-1.5 px-0.5">
              {suggestionChips.slice(0, conversationState ? 5 : 3).map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  type="button"
                  onClick={() => void handleSend(suggestion)}
                  className={cn(
                    'max-w-[14rem] shrink-0 truncate rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    activeOkrContext
                      ? 'bg-primary/10 text-primary ring-primary/20 hover:bg-primary/15'
                      : activeActionContext
                        ? 'bg-destructive/10 text-destructive ring-destructive/20 hover:bg-destructive/15'
                        : 'bg-card text-foreground/80 ring-border/70 hover:text-foreground hover:ring-primary/35'
                  )}
                  disabled={loading}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Label htmlFor={inputId} className="sr-only">
          {activeOkrContext
            ? 'Pregunta sobre el OKR seleccionado'
            : activeActionContext
              ? 'Pregunta sobre la accion seleccionada'
              : 'Pregunta o dime qué necesitas hacer'}
        </Label>
        {speech.listening ? (
          <p className="text-[11px] text-primary">
            Escuchando… {speech.seconds}s. Habla y pulsa el microfono para dejar el texto
            {speech.interimText ? ` · ${speech.interimText}` : ''}
          </p>
        ) : null}
        {speech.transcribing ? (
          <p className="text-[11px] text-primary">Transcribiendo lo que dijiste…</p>
        ) : null}
        {speech.error ? (
          <p className="text-[11px] text-amber-800 dark:text-amber-200">{speech.error}</p>
        ) : null}
        {linkedChatReply ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/[0.06] px-2.5 py-1.5 text-[11px] text-primary ring-1 ring-primary/20">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate font-medium">
                Ligado a la respuesta del chat: {linkedChatReply.replace(/\s+/g, ' ').slice(0, 90)}
                {linkedChatReply.length > 90 ? '…' : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLinkedChatReply(null)}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Desvincular respuesta del chat"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ) : null}
        <div
          className={cn(
            'relative flex items-end gap-1.5',
            isPopup
              ? 'rounded-2xl border border-border/60 bg-background p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]'
              : 'rounded-xl bg-card p-0.5 ring-1 ring-border/60 transition focus-within:ring-primary/45'
          )}
        >
          {mentionQuery && filteredMentionPeople.length > 0 ? (
            <div
              role="listbox"
              aria-label="Seleccionar usuario"
              className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-52 overflow-y-auto rounded-xl border border-border/70 bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
            >
              <p className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <AtSign className="h-3 w-3" aria-hidden />
                Seleccionar usuario
              </p>
              {filteredMentionPeople.map((person, idx) => (
                <button
                  key={person.id}
                  type="button"
                  role="option"
                  aria-selected={idx === mentionIndex}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    handleSelectMention(person)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition',
                    idx === mentionIndex
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <span className="truncate">{person.nombre}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div ref={createMenuRef} className="relative shrink-0">
            <Button
              type="button"
              variant={createMenuOpen ? 'secondary' : 'ghost'}
              className={cn(
                'h-9 shrink-0 gap-1 rounded-full px-2.5 text-xs font-semibold',
                createMenuOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setCreateMenuOpen((open) => !open)}
              disabled={loading || speech.listening || speech.transcribing}
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
              aria-label="Crear"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              <span className={isPopup ? 'hidden sm:inline' : 'inline'}>Crear</span>
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', createMenuOpen && 'rotate-180')}
                aria-hidden
              />
            </Button>
            {createMenuOpen ? (
              <div
                role="menu"
                aria-label="Opciones para crear"
                className="absolute bottom-full left-0 z-30 mb-2 w-44 rounded-xl border border-border/70 bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150"
              >
                {CREATE_QUICK_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleSelectCreateOption(option.prefix)}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-foreground transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                      <span>{option.label}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
          {speech.supported ? (
            <Button
              type="button"
              variant={speech.listening ? 'secondary' : 'ghost'}
              className={cn('shrink-0 rounded-full px-0', isPopup ? 'h-9 w-9' : 'h-9 w-9')}
              onClick={() => {
                if (speech.listening) {
                  speech.stop()
                  return
                }
                dictationPrefixRef.current = input.trim() ? `${input.trim()} ` : ''
                void speech.start()
              }}
              disabled={loading || speech.transcribing}
              aria-label={speech.listening ? 'Detener dictado' : 'Dictar'}
            >
              {speech.listening ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
            </Button>
          ) : null}
          <textarea
            ref={inputRef}
            id={inputId}
            value={input}
            onChange={(event) => {
              const nextValue = event.target.value
              setInput(nextValue)
              updateMentionFromCursor(nextValue, event.target.selectionStart)
            }}
            onClick={(event) => {
              updateMentionFromCursor(event.currentTarget.value, event.currentTarget.selectionStart)
            }}
            placeholder={
              activeOkrContext
                ? 'Este KR mide resultado o actividad?'
                : activeActionContext
                  ? 'Que falta para cerrar?'
                  : 'Pregunta o dime qué necesitas hacer...'
            }
            rows={1}
            className={cn(
              'flex-1 resize-none border-0 bg-transparent outline-none placeholder:text-muted-foreground/70 focus-visible:ring-0 disabled:opacity-70',
              isPopup
                ? 'max-h-20 min-h-9 px-2 py-2 text-[13px]'
                : 'max-h-20 min-h-9 px-2.5 py-2 text-sm'
            )}
            readOnly={speech.listening || speech.transcribing}
            disabled={loading}
            onKeyDown={(event) => {
              if (mentionQuery && filteredMentionPeople.length > 0) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setMentionIndex((idx) => (idx + 1) % filteredMentionPeople.length)
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setMentionIndex(
                    (idx) => (idx - 1 + filteredMentionPeople.length) % filteredMentionPeople.length
                  )
                  return
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault()
                  const picked = filteredMentionPeople[mentionIndex] ?? filteredMentionPeople[0]
                  if (picked) handleSelectMention(picked)
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setMentionQuery(null)
                  return
                }
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
          />
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim() || speech.listening || speech.transcribing}
            className="h-9 w-9 shrink-0 rounded-full px-0"
            aria-label="Enviar"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
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

    if (!lane) {
      return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
          <AssistantLaneChooser compact onChoose={chooseLane} />
        </div>
      )
    }

    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[radial-gradient(120%_70%_at_50%_-20%,hsl(var(--primary)/0.1),transparent_55%),hsl(var(--background))]">
        <div className="shrink-0 px-2.5 pb-1.5 pt-2">
          <AssistantLaneSwitch lane={lane} compact onChange={(next) => chooseLane(next)} />
        </div>
        {lane === 'talk' ? guidePanel : (
        <>
        <div className="shrink-0 space-y-2 border-b border-border/50 bg-muted/20 px-2.5 py-2">
          <div className="flex items-center gap-1.5">
            <div
              className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-2xl bg-background/80 p-1 ring-1 ring-border/50"
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
                    'inline-flex min-h-8 items-center justify-center gap-1 rounded-xl px-1.5 text-[11px] font-semibold transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40',
                    active
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
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
              className="h-8 w-8 shrink-0 rounded-xl"
              onClick={clearFiltersOrChat}
              disabled={loading || (!hasActiveFilters && messages.length === 0)}
              aria-label={hasActiveFilters ? 'Limpiar filtros' : 'Limpiar chat'}
              title={hasActiveFilters ? 'Limpiar filtros' : 'Limpiar chat'}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>

          {focusKind === 'action' ? (
            <div className="space-y-1.5">
              <FilterMultiSelect
                label="Acciones"
                emptyLabel={
                  actionsLoading
                    ? 'Cargando...'
                    : selectableActions.length > 0
                      ? 'Elegir acciones'
                      : 'Sin acciones'
                }
                values={selectedActionIds}
                onChange={setActionSelection}
                disabled={actionsLoading || selectableActions.length === 0}
                options={selectableActions.map((action) => ({
                  value: action.id,
                  label: formatActionOption(action),
                }))}
              />
              {selectedActions.length > 0 ? (
                <p className="px-0.5 text-[10px] text-muted-foreground">
                  {selectedActions.length === 1
                    ? selectedActions[0]!.titulo_accion
                    : `${selectedActions.length} acciones seleccionadas`}
                </p>
              ) : (
                <p className="px-0.5 text-[10px] text-muted-foreground">
                  Elige una o varias acciones abiertas para analizarlas.
                </p>
              )}
            </div>
          ) : null}

          {focusKind === 'okr' ? (
            <div className="space-y-1.5">
              <FilterMultiSelect
                label="Objetivos"
                emptyLabel={
                  okrDashboard.isLoading
                    ? 'Cargando...'
                    : (okrDashboard.data?.objectives.length ?? 0) > 0
                      ? 'Elegir OKRs'
                      : 'Sin OKRs'
                }
                values={selectedObjectiveIds}
                onChange={setObjectiveSelection}
                disabled={
                  okrDashboard.isLoading || (okrDashboard.data?.objectives.length ?? 0) === 0
                }
                options={(okrDashboard.data?.objectives ?? []).map((objective) => ({
                  value: objective.id,
                  label: objective.nombre_okr,
                }))}
              />
              {selectedObjectives.length > 0 ? (
                okrScopeSelectors
              ) : (
                <p className="px-0.5 text-[10px] text-muted-foreground">
                  Elige uno o varios OKRs para diagnosticarlos.
                </p>
              )}
            </div>
          ) : null}
        </div>

        {chatThread}
        {composer}
        </>
        )}
      </div>
    )
  }

  const writeContextExtras =
    lane === 'write' &&
    (selectedObjectives.length > 0 || selectedActions.length > 0) ? (
      <div className="relative shrink-0 space-y-1.5 border-b border-border/40 px-3 py-2 sm:px-4">
        {selectedObjectives.length > 0 ? okrScopeSelectors : null}

        {selectedActions.length === 1 ? (
          <div className="flex min-w-0 items-center gap-1.5 truncate rounded-lg bg-background/60 px-2 py-1 text-[11px]">
            <AccionPriorityBadge
              prioridad={selectedActions[0]!.prioridad}
              catalogColor={findPriorityForAccion(selectedActions[0]!, priorities)?.color}
              compact
            />
            <span className="truncate text-muted-foreground">
              {selectedActions[0]!.estado}
              {' · '}
              Checklist{' '}
              {checkpointsLoading ? '…' : `${checklistDone}/${selectedCheckpoints.length}`}
            </span>
          </div>
        ) : selectedActions.length > 1 ? (
          <p className="truncate rounded-lg bg-background/60 px-2 py-1 text-[11px] text-muted-foreground">
            {selectedActions.length} acciones en contexto
          </p>
        ) : null}
      </div>
    ) : null

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-h-0 w-[calc(100%+2rem)] max-w-none flex-col gap-2.5 overflow-hidden p-2.5 sm:gap-3 sm:p-4">
      <header className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-nowrap lg:gap-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Bot className="h-3.5 w-3.5" aria-hidden />
          </span>
          <h2 className="min-w-0 truncate text-base font-semibold tracking-tight">
            Asistente
          </h2>
        </div>

        {lane ? (
          <>
            <div className="hidden h-5 w-px shrink-0 bg-border/70 sm:block" aria-hidden />
            <div
              className={cn(
                'min-w-0 shrink-0 sm:w-[11.5rem]',
                lane !== 'write' && 'ml-auto'
              )}
            >
              <AssistantLaneSwitch lane={lane} compact onChange={(next) => chooseLane(next)} />
            </div>
          </>
        ) : null}

        {lane === 'write' ? (
          <>
            <div
              className={cn(
                'order-last flex w-full min-w-0 items-center gap-1.5 lg:order-none lg:ml-auto lg:w-auto lg:flex-1 lg:gap-2',
                'lg:max-w-md xl:max-w-lg'
              )}
              role="group"
              aria-label="Foco del copiloto"
            >
              <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 sm:inline">
                Foco
              </span>
              <div
                className={cn(
                  'grid min-w-0 flex-1 gap-1.5',
                  canSeeOkrs ? 'grid-cols-2' : 'grid-cols-1'
                )}
              >
                <FilterMultiSelect
                  tone="focus"
                  label="Acciones"
                  emptyLabel={
                    actionsLoading
                      ? 'Cargando...'
                      : selectableActions.length > 0
                        ? 'Accion'
                        : 'Sin acciones'
                  }
                  icon={<ListChecks className="h-3.5 w-3.5" aria-hidden />}
                  values={selectedActionIds}
                  onChange={setActionSelection}
                  disabled={actionsLoading || selectableActions.length === 0}
                  options={selectableActions.map((action) => ({
                    value: action.id,
                    label: formatActionOption(action),
                  }))}
                  className="h-8"
                />
                {canSeeOkrs ? (
                  <FilterMultiSelect
                    tone="focus"
                    label="Objetivos"
                    emptyLabel={
                      okrDashboard.isLoading
                        ? 'Cargando...'
                        : (okrDashboard.data?.objectives.length ?? 0) > 0
                          ? 'OKR'
                          : 'Sin OKRs'
                    }
                    icon={<Target className="h-3.5 w-3.5" aria-hidden />}
                    values={selectedObjectiveIds}
                    onChange={setObjectiveSelection}
                    disabled={
                      okrDashboard.isLoading ||
                      (okrDashboard.data?.objectives.length ?? 0) === 0
                    }
                    options={(okrDashboard.data?.objectives ?? []).map((objective) => ({
                      value: objective.id,
                      label: objective.nombre_okr,
                    }))}
                    className="h-8"
                  />
                ) : null}
              </div>
            </div>

            {(selectedActions.length > 0 || selectedObjectives.length > 0) && (
              <CompactToggle
                active={
                  selectedActions.length > 0 ? actionContextEnabled : okrContextEnabled
                }
                onToggle={() =>
                  selectedActions.length > 0
                    ? setActionContextEnabled((value) => !value)
                    : setOkrContextEnabled((value) => !value)
                }
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearFiltersOrChat}
              disabled={loading || (!hasActiveFilters && messages.length === 0)}
              className="ml-auto h-8 w-8 shrink-0 rounded-full lg:ml-0"
              aria-label={hasActiveFilters ? 'Limpiar filtros' : 'Limpiar chat'}
              title={hasActiveFilters ? 'Limpiar filtros' : 'Limpiar chat'}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </>
        ) : null}
      </header>

      {!lane ? (
        <AssistantSurface className="min-h-0 flex-1 overflow-hidden">
          <AssistantLaneChooser onChoose={chooseLane} />
        </AssistantSurface>
      ) : lane === 'talk' ? (
        <AssistantSurface className="min-h-0 flex-1 overflow-hidden">{guidePanel}</AssistantSurface>
      ) : (
        <AssistantSurface glow className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {writeContextExtras}
          {chatThread}
          {composer}
        </AssistantSurface>
      )}
    </div>
  )
}
