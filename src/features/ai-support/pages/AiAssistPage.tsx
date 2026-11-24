import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bot,
  Check,
  ChevronDown,
  LayoutGrid,
  ListChecks,
  Loader2,
  Mic,
  MicOff,
  Send,
  Target,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
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
  tryFactualAssistantReply,
} from '@/features/ai-support/operationalContext'
import {
  runConversationTurn,
  type ConversationQueryState,
} from '@/features/ai-support/conversation'
import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import { assistantOperationalContextService } from '@/features/ai-support/services/assistantOperationalContext.service'
import {
  buildAssistantBriefing,
  buildAssistantQuickActions,
  resolveAssistantAudience,
  type AssistantQuickAction,
} from '@/features/ai-support/assistantBriefing'
import { AssistantWelcome } from '@/features/ai-support/components/AssistantWelcome'
import { AssistantActivity } from '@/features/ai-support/components/AssistantActivity'
import { StructuredAssistantReply } from '@/features/ai-support/components/StructuredAssistantReply'
import { AssistantReplyViews } from '@/features/ai-support/chatViews'
import { AssistantProposalCard } from '@/features/ai-support/components/AssistantProposalCard'
import { AssistantClarificationChips } from '@/features/ai-support/components/AssistantClarificationChips'
import { ActionDraftList } from '@/features/ai-support/components/ActionDraftList'
import { WorkIntentToggle } from '@/features/ai-support/components/WorkIntentToggle'
import {
  coerceResponseFormat,
  FORMAT_LABEL,
  RESPONSE_FORMATS,
  type ResponseFormat,
} from '@/features/ai-support/responseFormat'
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
import { friendlyAssistantError } from '@/features/ai-support/assistantErrors'
import { tryKnowledgeReply } from '@/features/ai-support/knowledge/tryKnowledgeReply'
import { groundActionDrafts } from '@/features/ai-support/groundActionDrafts'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { canViewAllBoardData, isDirectionByRole, isLeaderByRole } from '@/features/auth/lib/permissions'
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
  'Que acciones tengo abiertas?',
  'Cuales he asignado yo?',
  'Cuantas hay en el tablero?',
  'Que deberia priorizar hoy?',
  'Como van mis OKRs?',
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

const FORMAT_STORAGE_KEY = 'assistant.responseFormat'
const CONVERSATION_STORAGE_KEY = 'assistant.conversationId'

const FORMAT_OPTIONS = RESPONSE_FORMATS.map((id) => ({
  id,
  label: id === 'auto' ? 'Auto' : FORMAT_LABEL[id],
}))

/** La selección dura la sesión del navegador; sin almacenamiento disponible vuelve a Automático. */
function readStoredFormat(): ResponseFormat {
  try {
    return coerceResponseFormat(window.sessionStorage.getItem(FORMAT_STORAGE_KEY))
  } catch {
    return 'auto'
  }
}

function storeFormat(format: ResponseFormat) {
  try {
    window.sessionStorage.setItem(FORMAT_STORAGE_KEY, format)
  } catch {
    /* sin almacenamiento: la selección sólo vive en memoria */
  }
}

/** Identificador estable de la conversación para que el servidor conserve contexto y formato. */
function readConversationId(): string {
  try {
    const stored = window.sessionStorage.getItem(CONVERSATION_STORAGE_KEY)
    if (stored) return stored
    const created = crypto.randomUUID()
    window.sessionStorage.setItem(CONVERSATION_STORAGE_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

type GeminiChatResponse = {
  answer?: string
  agent?: {
    formatSelected?: string
    status?: string
    asOf?: string | null
    blocks?: { data?: string[]; interpretation?: string[]; recommendation?: string[]; limitations?: string[] }
    references?: Array<{ id: string; title: string; href: string }>
  }
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
  responseFormat,
  conversationId,
}: {
  responseFormat: ResponseFormat
  conversationId: string
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
      conversationId,
      responseFormat,
      messages: messages.map(({ role, content }) => ({ role, content })),
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

  const agentUi =
    data.agent?.status && !data.ui
      ? {
          views: [],
          asOf: data.agent.asOf ?? undefined,
          sources: ['orchestrator_r1'],
        }
      : data.ui
        ? {
            ...data.ui,
            asOf: data.ui.asOf ?? data.agent?.asOf ?? undefined,
            sources: data.ui.sources?.length
              ? data.ui.sources
              : data.agent?.status
                ? ['orchestrator_r1']
                : data.ui.sources,
          }
        : undefined

  return {
    answer: data.answer || 'No pude generar una respuesta en este momento.',
    proposals: data.proposals,
    clarification: data.clarification,
    ui: agentUi,
    formatSelected: data.agent?.formatSelected,
  }
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
        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary/10 text-primary hover:bg-primary/15'
          : 'bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {active ? 'Usando' : 'Pausado'}
    </button>
  )
}

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id]
}

function FilterMultiSelect({
  label,
  emptyLabel,
  icon,
  options,
  values,
  onChange,
  disabled,
  className,
  tone = 'default',
}: {
  label: string
  emptyLabel: string
  icon?: ReactNode
  options: Array<{ value: string; label: string }>
  values: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  className?: string
  /** `focus` = dropdown de contexto (distinto al switch Hablar/Escribir). */
  tone?: 'default' | 'focus'
}) {
  const hasSelection = values.length > 0
  const isFocus = tone === 'focus'
  const summary =
    values.length === 0
      ? emptyLabel
      : values.length === 1
        ? options.find((item) => item.value === values[0])?.label || label
        : `${values.length} ${label.toLowerCase()}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || options.length === 0}>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || options.length === 0}
          className={cn(
            'group h-9 w-full justify-between gap-2 px-2.5 text-[12px] font-medium transition duration-200',
            'focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:translate-y-0 disabled:opacity-50',
            isFocus
              ? [
                  'rounded-lg border border-dashed border-border/70 bg-background text-muted-foreground shadow-none',
                  'hover:border-border hover:bg-muted/40 hover:text-foreground',
                  hasSelection &&
                    'border-solid border-border bg-muted/50 text-foreground hover:bg-muted/70',
                ]
              : [
                  'rounded-2xl border border-border/50 bg-background/70 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.45)] backdrop-blur-sm',
                  'hover:-translate-y-px hover:border-primary/35 hover:bg-background hover:shadow-[0_14px_28px_-22px_rgba(15,23,42,0.4)]',
                  hasSelection &&
                    'border-primary/30 bg-primary/[0.08] text-foreground shadow-[0_12px_28px_-22px_hsl(var(--primary)/0.45)] hover:bg-primary/[0.12]',
                ],
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center justify-center transition',
                  isFocus
                    ? cn(
                        'h-5 w-5 rounded-md',
                        hasSelection ? 'text-foreground' : 'text-muted-foreground'
                      )
                    : cn(
                        'h-6 w-6 rounded-xl',
                        hasSelection
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted/80 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                      )
                )}
              >
                {icon}
              </span>
            ) : null}
            <span className="truncate tracking-tight">{summary}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {values.length > 1 ? (
              <span
                className={cn(
                  'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                  isFocus
                    ? 'bg-foreground/10 text-foreground'
                    : hasSelection
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {values.length}
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition duration-200',
                isFocus
                  ? 'text-muted-foreground/80'
                  : hasSelection
                    ? 'text-primary/80'
                    : 'text-muted-foreground/70',
                'group-data-[state=open]:rotate-180'
              )}
              aria-hidden
            />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-[min(20rem,var(--radix-dropdown-menu-trigger-width))] overflow-y-auto rounded-2xl border-border/60 p-1.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.55)]"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold tracking-tight text-muted-foreground">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1" />
        {options.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-muted-foreground">Sin opciones</p>
        ) : (
          options.map((option) => {
            const checked = values.includes(option.value)
            return (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={checked}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => onChange(toggleId(values, option.value))}
                className="rounded-xl text-[12px]"
              >
                <span className="flex items-center gap-1.5">
                  {checked ? <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden /> : null}
                  <span className="truncate">{option.label}</span>
                </span>
              </DropdownMenuCheckboxItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type AssistantContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

function normalizeAssistantLine(line: string) {
  return line
    .replace(/^\*\*(.+)\*\*:?\s*$/, '$1')
    .replace(/^#+\s+/, '')
    .replace(/\*\*/g, '')
    .trim()
}

/** Inline markdown seguro: negritas y enlaces http(s)/rutas internas. Sin HTML arbitrario. */
function renderInlineSafe(text: string): ReactNode {
  const parts: ReactNode[] = []
  const pattern = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\))/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    if (match[2]) {
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      )
    } else if (match[3] && match[4]) {
      const href = match[4]
      const isInternal = href.startsWith('/')
      parts.push(
        isInternal ? (
          <Link
            key={`a-${key++}`}
            to={href}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {match[3]}
          </Link>
        ) : (
          <a
            key={`a-${key++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {match[3]}
          </a>
        )
      )
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

function isAssistantHeading(line: string) {
  const clean = normalizeAssistantLine(line)
  if (!clean || clean.length > 56) return false
  if (/^(diagn[oó]stico|situaci[oó]n|resumen|recomendaci[oó]nes?|pr[oó]ximos pasos|acciones?|riesgos?|prioridades?|hallazgos?|hallazgo|evidencia|hecho|siguiente accion|conclusi[oó]n|qu[eé] hacer|siguiente|okr|tablero)\b/i.test(clean)) {
    return true
  }
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ /-]{1,40}:$/.test(clean)
}

function parseAssistantContent(raw: string): AssistantContentBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const blocks: AssistantContentBlock[] = []
  let paragraph: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    paragraph = []
    if (text) blocks.push({ type: 'paragraph', text })
  }
  const flushList = () => {
    if (listItems.length === 0) return
    blocks.push({ type: 'list', items: listItems })
    listItems = []
  }

  for (const original of lines) {
    const line = original.trim()
    if (!line) {
      flushList()
      flushParagraph()
      continue
    }

    const listMatch = line.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/)
    if (listMatch?.[1]) {
      flushParagraph()
      listItems.push(normalizeAssistantLine(listMatch[1]))
      continue
    }

    if (isAssistantHeading(line)) {
      flushList()
      flushParagraph()
      blocks.push({
        type: 'heading',
        text: normalizeAssistantLine(line).replace(/:$/, ''),
      })
      continue
    }

    const inlineHeading = line.match(
      /^((?:Diagn[oó]stico|Situaci[oó]n|Resumen|Recomendaci[oó]nes?|Pr[oó]ximos pasos|Acciones?|Riesgos?|Prioridades?|Hallazgos?|Hallazgo|Evidencia|Siguiente accion|Hecho|Conclusi[oó]n|Qu[eé] hacer))\s*:\s*(.+)$/i
    )
    if (inlineHeading?.[1] && inlineHeading[2]) {
      flushList()
      flushParagraph()
      blocks.push({ type: 'heading', text: inlineHeading[1] })
      paragraph.push(inlineHeading[2])
      continue
    }

    flushList()
    paragraph.push(normalizeAssistantLine(line))
  }

  flushList()
  flushParagraph()
  return blocks.length > 0 ? blocks : [{ type: 'paragraph', text: raw.trim() }]
}

function AssistantMessageBody({
  content,
  compact,
}: {
  content: string
  compact?: boolean
}) {
  const blocks = parseAssistantContent(content)
  return (
    <div className={cn('space-y-2.5', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <p
              key={`h-${index}`}
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary"
            >
              {block.text}
            </p>
          )
        }
        if (block.type === 'list') {
          return (
            <ul key={`l-${index}`} className="space-y-1.5 pl-0">
              {block.items.map((item, itemIndex) => (
                <li
                  key={`${item}-${itemIndex}`}
                  className="flex gap-2 rounded-xl bg-muted/35 px-2.5 py-1.5 text-[12px] leading-5 text-foreground/90"
                >
                  <span className="mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                    {itemIndex + 1}
                  </span>
                  <span className="min-w-0">{renderInlineSafe(item)}</span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={`p-${index}`} className="text-foreground/90">
            {renderInlineSafe(block.text)}
          </p>
        )
      })}
    </div>
  )
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

  useEffect(() => {
    const fromUrl = laneFromSearch(searchParams.get('lane'))
    if (fromUrl) setLane(fromUrl)
  }, [searchParams])
  const [writeIntent, setWriteIntent] = useState<WriteIntent>('consult')
  const [responseFormat, setResponseFormatState] = useState<ResponseFormat>(readStoredFormat)
  const conversationId = useMemo(readConversationId, [])
  const setResponseFormat = (format: ResponseFormat) => {
    setResponseFormatState(format)
    storeFormat(format)
  }
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
  const assistantAudience = useMemo(
    () =>
      resolveAssistantAudience({
        isDirection: isDirectionByRole(currentUser?.rol),
        isLeader: isLeaderByRole(currentUser?.rol),
        canSeeTeam: seesAllBoard,
      }),
    [currentUser?.rol, seesAllBoard]
  )
  const quickActions = useMemo(
    () =>
      buildAssistantQuickActions({
        audience: assistantAudience,
        canSeeOkrs,
      }),
    [assistantAudience, canSeeOkrs]
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

  const handleSend = async (prompt = input) => {
    const trimmed = prompt.trim()
    if (!trimmed || loading) return

    const nextMessages = [...messages, { role: 'user' as const, content: trimmed, requestId: crypto.randomUUID() }].slice(
      -MAX_MESSAGES
    )

    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    const previousAnalysis = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && (message.analysis?.actionDrafts.length ?? 0) > 0)
      ?.analysis
    const isCorrection = Boolean(
      previousAnalysis &&
        !looksLikeCreateWork(trimmed) &&
        !looksLikeCommsPrepare(trimmed) &&
        (looksLikeDraftCorrection(trimmed) || writeIntent === 'create')
    )
    const intent = isCorrection ? 'create' : resolveWriteIntent(trimmed, writeIntent)

    try {
      if (intent === 'create') {
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
          const raw = await requestAssistantTextAnalysis({
            text: sourceText,
            context: voiceContext,
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
          [...nextMessages, { role: 'assistant' as const, content, analysis }].slice(-MAX_MESSAGES)
        )
      } else {
        const intent = detectAssistantIntent(trimmed, {
          hasSelectedAction: activeActionContext,
          hasSelectedOkr: activeOkrContext,
        })
        const hasExplicitFocus = activeActionContext || activeOkrContext
        const orchestratorEnabled = __AGENT_ORCHESTRATOR_R1__ === true

        const knowledge = tryKnowledgeReply(trimmed)
        if (knowledge) {
          setMessages(
            [
              ...nextMessages,
              {
                role: 'assistant' as const,
                content: knowledge.content,
              },
            ].slice(-MAX_MESSAGES)
          )
          return
        }

        if (operationalSnapshot) {
          const turn = runConversationTurn({
            message: trimmed,
            previous: conversationState,
            snapshot: operationalSnapshot,
            people: conversationPeople,
            responseFormat,
            orchestratorEnabled,
          })
          if (turn.handled) {
            setConversationState(turn.reply.state)
            setMessages(
              [
                ...nextMessages,
                {
                  role: 'assistant' as const,
                  content: turn.reply.content,
                  ui: turn.reply.ui,
                  clarification: turn.reply.clarification,
                },
              ].slice(-MAX_MESSAGES)
            )
            return
          }
          // handoff: limpiar pending clarify y seguir a Gemini/tools
          setConversationState(turn.state.entity === 'none' ? null : turn.state)
        }

        if (
          !orchestratorEnabled &&
          operationalSnapshot &&
          (intent === 'okrs' || intent === 'team_delay') &&
          responseFormat === 'auto'
        ) {
          const priorUserMessages = nextMessages
            .filter((row) => row.role === 'user')
            .map((row) => row.content)
          const factual = tryFactualAssistantReply(trimmed, operationalSnapshot, intent, {
            priorUserMessages,
          })
          if (factual) {
            setMessages(
              [
                ...nextMessages,
                {
                  role: 'assistant' as const,
                  content: factual.content,
                  ui: factual.ui,
                },
              ].slice(-MAX_MESSAGES)
            )
            return
          }
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
          responseFormat,
          conversationId,
        })
        // Una directiva en el mensaje («modo reporte») cambia el formato de la sesión: el selector la refleja.
        if (reply.formatSelected) setResponseFormat(coerceResponseFormat(reply.formatSelected))
        setMessages(
          [
            ...nextMessages,
            {
              role: 'assistant' as const,
              content: reply.answer,
              proposals: reply.proposals,
              clarification: reply.clarification,
              ui: reply.ui,
            },
          ].slice(-MAX_MESSAGES)
        )
      }
    } catch (error) {
      const message = friendlyAssistantError(error)
      toast.error(message)
      setMessages([
        ...nextMessages,
        {
          role: 'assistant' as const,
          content: message,
        },
      ])
    } finally {
      setLoading(false)
    }
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

  const handleQuickAction = (action: AssistantQuickAction) => {
    if (action.mode === 'create') {
      setWriteIntent('create')
      setInput('')
      window.setTimeout(() => inputRef.current?.focus(), 0)
      return
    }
    setWriteIntent('consult')
    if (action.prompt) void handleSend(action.prompt)
  }

  const guidePanel = (
    <GuidePanel
      usuarioId={currentUser?.id ?? null}
      compact={isPopup}
      className="min-h-0 flex-1"
      autoStartVoice={!isPopup && searchParams.get('channel') === 'voice'}
      onAutoStartVoice={() => {
        if (searchParams.get('channel') !== 'voice') return
        const next = new URLSearchParams(searchParams)
        next.delete('channel')
        setSearchParams(next, { replace: true })
      }}
    />
  )

  const chatThread = (
    <div
      className={cn(
        'min-h-0 flex-1 space-y-3 overflow-y-auto',
        isPopup
          ? 'bg-[linear-gradient(180deg,hsl(var(--muted)/0.35)_0%,hsl(var(--background))_48%)] px-3 py-3'
          : 'relative px-4 py-4 sm:px-5'
      )}
      aria-live="polite"
    >
      {showBriefing ? (
        <div
          className={cn(
            isPopup
              ? 'rounded-2xl bg-card/90 px-3 py-3 ring-1 ring-border/45'
              : 'rounded-2xl bg-background/85 px-3.5 py-3.5 ring-1 ring-border/40 sm:px-4'
          )}
        >
          <AssistantWelcome
            briefing={briefing}
            counts={operationalSnapshot?.counts ?? null}
            actions={quickActions}
            loading={operationalLoad.isLoading || actionsLoading}
            compact={isPopup}
            onAsk={(prompt) => {
              setWriteIntent('consult')
              void handleSend(prompt)
            }}
            onAction={handleQuickAction}
          />
          {operationalSnapshot?.fetchedAt ? (
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              Corte:{' '}
              {new Date(operationalSnapshot.fetchedAt).toLocaleString('es-MX', {
                timeZone: 'America/Mexico_City',
              })}{' '}
              · Fuentes: kanban_acciones
            </p>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className={cn(isPopup ? 'px-0.5' : 'px-1')}>
          <AssistantActivity
            stage={writeIntent === 'create' ? 'preparing' : 'querying'}
            compact={isPopup}
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
                  : isPopup
                    ? 'w-full max-w-[95%] rounded-2xl rounded-bl-md bg-card px-3 py-2.5 text-foreground shadow-sm ring-1 ring-border/45'
                    : 'w-full max-w-[90%] rounded-2xl rounded-bl-md bg-background/90 px-3.5 py-3 text-foreground shadow-sm ring-1 ring-border/40 sm:max-w-[82%]'
              )}
            >
              {message.role === 'assistant' ? (
                message.ui?.views?.length ? (
                  <AssistantReplyViews
                    ui={message.ui}
                    narrative={message.structured ? undefined : message.content}
                    compact={isPopup}
                    onFollowUp={(prompt) => void handleSend(prompt)}
                  />
                ) : message.structured ? (
                  <StructuredAssistantReply reply={message.structured} compact={isPopup} />
                ) : (
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
                <div className="mt-3 space-y-2 border-t border-border/50 pt-2.5">
                  {message.analysis.nextSteps.length > 0 && message.analysis.actionDrafts.length === 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
                        Proximos pasos
                      </p>
                      <ul className="space-y-1.5">
                        {message.analysis.nextSteps.slice(0, 3).map((step, stepIndex) => (
                          <li
                            key={step}
                            className="flex gap-2 rounded-xl bg-muted/35 px-2.5 py-1.5 text-[12px] leading-5 text-foreground/90"
                          >
                            <span className="mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                              {stepIndex + 1}
                            </span>
                            <span className="min-w-0">{step}</span>
                          </li>
                        ))}
                      </ul>
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
        </div>
      ))}
      {loading ? (
        <div
          className={cn(
            'flex items-center gap-2 text-sm text-muted-foreground',
            !isPopup && 'pl-9'
          )}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Pensando…
        </div>
      ) : null}
      <div ref={chatEndRef} />
    </div>
  )

  const composer = (
    <div
      className={cn(
        'shrink-0',
        isPopup
          ? 'space-y-2 border-t border-border/50 bg-card/90 p-2.5 backdrop-blur-sm'
          : 'bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-3 pt-1.5 sm:px-4'
      )}
    >
      <div
        className={cn(
          'space-y-1.5',
          !isPopup &&
            'rounded-2xl bg-background/90 p-2 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.4)] ring-1 ring-border/50 backdrop-blur-sm'
        )}
      >
        {!isPopup ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <WorkIntentToggle value={writeIntent} onChange={setWriteIntent} className="shrink-0" />
              <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
                <div className="flex w-max gap-1">
                  {suggestionChips.slice(0, conversationState ? 5 : 3).map((suggestion, index) => (
                    <button
                      key={`${suggestion}-${index}`}
                      type="button"
                      onClick={() => void handleSend(suggestion)}
                      className={cn(
                        'max-w-[11rem] shrink-0 truncate rounded-full px-2 py-1 text-[10px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        activeOkrContext
                          ? 'bg-primary/10 text-primary hover:bg-primary/15'
                          : activeActionContext
                            ? 'bg-red-500/10 text-red-800 hover:bg-red-500/15 dark:text-red-200'
                            : 'bg-muted/55 text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                      disabled={loading}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <WorkIntentToggle<ResponseFormat>
              value={responseFormat}
              onChange={setResponseFormat}
              options={FORMAT_OPTIONS}
              aria-label="Formato de respuesta"
            />
          </div>
        ) : (
          <WorkIntentToggle<ResponseFormat>
            value={responseFormat}
            onChange={setResponseFormat}
            options={FORMAT_OPTIONS}
            aria-label="Formato de respuesta"
          />
        )}
        <Label htmlFor={inputId} className="sr-only">
          {activeOkrContext
            ? 'Pregunta sobre el OKR seleccionado'
            : activeActionContext
              ? 'Pregunta sobre la accion seleccionada'
              : 'Analiza acciones y OKRs'}
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
        <div
          className={cn(
            'flex items-end gap-1.5',
            isPopup
              ? 'rounded-2xl border border-border/60 bg-background p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]'
              : 'rounded-xl bg-muted/35 p-0.5'
          )}
        >
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
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              writeIntent === 'create'
                ? 'Dicta o escribe el pendiente a crear…'
                : activeOkrContext
                  ? 'Este KR mide resultado o actividad?'
                  : activeActionContext
                    ? 'Que falta para cerrar?'
                    : 'Pregunta por prioridades, bloqueos o tu daily…'
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
          <AssistantLaneChooser compact onChoose={setLane} />
        </div>
      )
    }

    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[radial-gradient(120%_70%_at_50%_-20%,hsl(var(--primary)/0.1),transparent_55%),hsl(var(--background))]">
        <div className="shrink-0 px-2.5 pb-1.5 pt-2">
          <AssistantLaneSwitch lane={lane} compact onChange={setLane} />
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
                <div className="grid grid-cols-2 gap-2">
                  <FilterMultiSelect
                    label="KRs"
                    emptyLabel="Todos los KR"
                    className="h-8 rounded-xl"
                    values={selectedKrIds}
                    onChange={(ids) => {
                      setSelectedKrIds(ids)
                      setSelectedInitiativeIds((prev) =>
                        prev.filter((id) => {
                          const initiative = objectiveInitiatives.find((item) => item.id === id)
                          return Boolean(
                            initiative &&
                              (ids.length === 0 || ids.includes(initiative.key_result_id))
                          )
                        })
                      )
                    }}
                    options={objectiveKeyResults.map((kr) => ({
                      value: kr.id,
                      label: kr.title,
                    }))}
                  />
                  <FilterMultiSelect
                    label="Iniciativas"
                    emptyLabel={
                      objectiveInitiatives.length > 0 ? 'Iniciativas' : 'Sin iniciativas'
                    }
                    className="h-8 rounded-xl"
                    values={selectedInitiativeIds}
                    onChange={setSelectedInitiativeIds}
                    disabled={objectiveInitiatives.length === 0}
                    options={objectiveInitiatives.map((initiative) => {
                      const actionId = initiative.action_id ?? initiative.team_action_id
                      const option = (okrActions.data ?? []).find(
                        (action) => action.id === actionId
                      )
                      return {
                        value: initiative.id,
                        label: option?.title || 'Iniciativa sin titulo',
                      }
                    })}
                  />
                </div>
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
        {selectedObjectives.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <FilterMultiSelect
              label="KRs"
              emptyLabel="Todos los KR"
              className="h-8 rounded-xl"
              values={selectedKrIds}
              onChange={(ids) => {
                setSelectedKrIds(ids)
                setSelectedInitiativeIds((prev) =>
                  prev.filter((id) => {
                    const initiative = objectiveInitiatives.find((item) => item.id === id)
                    return Boolean(
                      initiative &&
                        (ids.length === 0 || ids.includes(initiative.key_result_id))
                    )
                  })
                )
              }}
              options={objectiveKeyResults.map((kr) => ({
                value: kr.id,
                label: kr.title,
              }))}
            />
            <FilterMultiSelect
              label="Iniciativas"
              emptyLabel={
                objectiveInitiatives.length > 0 ? 'Iniciativa' : 'Sin iniciativas'
              }
              className="h-8 rounded-xl"
              values={selectedInitiativeIds}
              onChange={setSelectedInitiativeIds}
              disabled={objectiveInitiatives.length === 0}
              options={objectiveInitiatives.map((initiative) => {
                const actionId = initiative.action_id ?? initiative.team_action_id
                const option = (okrActions.data ?? []).find((action) => action.id === actionId)
                return {
                  value: initiative.id,
                  label: option?.title || 'Iniciativa sin titulo',
                }
              })}
            />
          </div>
        ) : null}

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
    <div className="-m-4 flex h-[calc(100%+2rem)] min-h-0 w-[calc(100%+2rem)] max-w-none flex-col gap-2 overflow-hidden p-3 sm:p-4">
      <header className="flex shrink-0 items-center gap-2 sm:gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Bot className="h-3.5 w-3.5" aria-hidden />
        </span>
        <h2 className="min-w-0 shrink truncate text-base font-semibold tracking-tight">
          Asistente
        </h2>

        {lane ? (
          <>
            <div className="hidden h-5 w-px shrink-0 bg-border/70 sm:block" aria-hidden />
            <div
              className={cn(
                'w-[10.75rem] shrink-0 sm:w-[11.5rem]',
                lane !== 'write' && 'ml-auto'
              )}
            >
              <AssistantLaneSwitch lane={lane} compact onChange={setLane} />
            </div>
          </>
        ) : null}

        {lane === 'write' ? (
          <>
            <div
              className={cn(
                'ml-auto flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2',
                'max-w-xl'
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
              className="h-8 w-8 shrink-0 rounded-full"
              aria-label={hasActiveFilters ? 'Limpiar filtros' : 'Limpiar chat'}
              title={hasActiveFilters ? 'Limpiar filtros' : 'Limpiar chat'}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </>
        ) : null}
      </header>

      {!lane ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-[1.75rem] shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] ring-1 ring-border/40">
          <AssistantLaneChooser onChoose={setLane} />
        </div>
      ) : lane === 'talk' ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-[1.75rem] shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] ring-1 ring-border/40">
          {guidePanel}
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] ring-1 ring-border/40 bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--primary)/0.12),transparent_55%),linear-gradient(180deg,hsl(var(--muted)/0.35)_0%,hsl(var(--background))_46%)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.1),transparent_70%)]" aria-hidden />
          {writeContextExtras}
          {chatThread}
          {composer}
        </div>
      )}
    </div>
  )
}
