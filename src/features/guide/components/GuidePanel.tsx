import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ClipboardList,
  History,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Timer,
  Volume2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { useRetellGuideCall } from '@/features/guide/hooks/useRetellGuideCall'
import { GuidePersonalLinkButton } from '@/features/guide/components/GuidePersonalLinkButton'
import { guideService } from '@/features/guide/services/guide.service'
import type {
  GuideCompactMessage,
  GuideCreatedWork,
  GuideJournalEntry,
  GuideMessage,
  GuideSession,
} from '@/features/guide/types'
import { cn } from '@/lib/utils'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { ActionDraftList } from '@/features/ai-support/components/ActionDraftList'
import { groundActionDrafts } from '@/features/ai-support/groundActionDrafts'
import {
  isPendingWork,
  pendingWorkToAnalysis,
  recordedWorkItems,
} from '@/features/guide/pendingWork'

type GuidePanelProps = {
  usuarioId: string | null
  compact?: boolean
  className?: string
  composerLead?: ReactNode
}

type GuideChannel = 'text' | 'voice'

function createdWorkItems(entry: GuideJournalEntry | null | undefined, extra?: GuideCreatedWork[]) {
  const fromJournal = recordedWorkItems(entry?.created_work)
  if (fromJournal.length > 0) return fromJournal
  return recordedWorkItems(extra)
}

function CreatedWorkList({ items }: { items: GuideCreatedWork[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-1.5 rounded-2xl bg-muted/40 px-3 py-2.5">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <ClipboardList className="h-3 w-3 text-primary" aria-hidden />
        En el tablero
      </p>
      <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id || item.title}`}>
            {item.kind === 'initiative' ? 'Iniciativa' : 'Accion'}: {item.title}
            {item.keyResultTitle ? ` · KR ${item.keyResultTitle}` : ''}
            {item.alreadyExisted ? ' (ya existia)' : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function StartTrigger({
  starting,
  startingChannel,
  compact,
  onStart,
}: {
  starting: boolean
  startingChannel: GuideChannel | null
  compact?: boolean
  onStart: (channel: GuideChannel) => void
}) {
  return (
    <div
      className="grid w-full min-w-0 grid-cols-2 gap-1.5"
      role="group"
      aria-label="Iniciar Guia"
    >
      {(
        [
          { id: 'text' as const, label: 'Texto', icon: MessageSquare, hint: 'Chat 15 min' },
          { id: 'voice' as const, label: 'Voz', icon: Mic, hint: 'Llamada en vivo' },
        ] as const
      ).map((option) => {
        const Icon = option.icon
        const busy = starting && startingChannel === option.id
        return (
          <button
            key={option.id}
            type="button"
            disabled={starting}
            onClick={() => onStart(option.id)}
            className={cn(
              'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2.5 transition duration-200',
              'bg-primary text-primary-foreground shadow-[0_12px_28px_-14px_hsl(var(--primary)/0.55)]',
              'hover:-translate-y-0.5 hover:bg-primary/90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-60',
              compact && 'min-h-11'
            )}
          >
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-tight">
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Icon className="h-3.5 w-3.5" aria-hidden />
              )}
              {option.label}
            </span>
            <span className="text-[10px] text-primary-foreground/80">{option.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

export function GuidePanel({
  usuarioId,
  compact = false,
  className,
  composerLead,
}: GuidePanelProps) {
  const [session, setSession] = useState<GuideSession | null>(null)
  const [messages, setMessages] = useState<GuideMessage[]>([])
  const [journal, setJournal] = useState<GuideJournalEntry | null>(null)
  const [recentJournal, setRecentJournal] = useState<GuideJournalEntry[]>([])
  const [input, setInput] = useState('')
  const [bootstrapping, setBootstrapping] = useState(true)
  const [starting, setStarting] = useState(false)
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [channel, setChannel] = useState<GuideChannel>('text')
  const [remaining, setRemaining] = useState(0)
  const [view, setView] = useState<'chat' | 'journal' | 'result'>('chat')
  const [sessionWork, setSessionWork] = useState<GuideCreatedWork[]>([])
  const pendingWorkRef = useRef<GuideCreatedWork[]>([])
  const endRef = useRef<HTMLDivElement>(null)
  const closingRef = useRef(false)
  const startedAtRef = useRef(0)
  const sessionRef = useRef<GuideSession | null>(null)
  const remainingRef = useRef(0)
  const sendingRef = useRef(false)
  const retellStopRef = useRef<() => void>(() => {})
  const retellMessagesRef = useRef<() => GuideCompactMessage[]>(() => [])
  const retellLiveRef = useRef<GuideMessage[]>([])
  sessionRef.current = session
  remainingRef.current = remaining
  sendingRef.current = sending

  const welcome =
    'Hola. Soy Guia. En 15 minutos revisamos tu tablero. Si hay un pendiente, lo armamos en la conversacion y al terminar queda para aprobar.'

  const loadJournal = useCallback(async (userId: string) => {
    try {
      const entries = await guideService.listJournal(userId, 8)
      setRecentJournal(entries)
    } catch {
      /* silencioso: el diario es secundario */
    }
  }, [])

  const bootstrap = useCallback(async () => {
    if (!usuarioId) {
      setBootstrapping(false)
      return
    }
    setBootstrapping(true)
    try {
      const open = await guideService.getOpenSession(usuarioId)
      if (open) {
        setSession(open)
        setRemaining(guideService.remainingSeconds(open))
        setMessages(await guideService.listMessages(open.id))
        setView('chat')
      } else {
        setSession(null)
        setMessages([])
        setRemaining(0)
      }
      await loadJournal(usuarioId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cargar Guia.')
    } finally {
      setBootstrapping(false)
    }
  }, [loadJournal, usuarioId])

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending, view])

  const closeSession = useCallback(
    async (reason: 'user_requested' | 'time_limit' = 'user_requested') => {
      const current = sessionRef.current
      if (!current || !['active', 'closing'].includes(current.status) || closingRef.current) return
      closingRef.current = true
      setClosing(true)
      retellStopRef.current()
      const voiceMessages = current.provider === 'retell' ? retellMessagesRef.current() : undefined
      if (current.provider === 'retell') setMessages(retellLiveRef.current)
      try {
        const result = await guideService.closeSession(
          current,
          reason,
          voiceMessages ? { messages: voiceMessages } : undefined
        )
        setSession((prev) =>
          prev
            ? {
                ...prev,
                status: result.status,
                closed_at: new Date().toISOString(),
                close_reason: reason,
              }
            : prev
        )
        setJournal(result.journal)
        setRemaining(0)
        const pending =
          result.pendingWork?.length
            ? result.pendingWork
            : pendingWorkRef.current.length > 0
              ? pendingWorkRef.current
              : (result.journal?.created_work ?? result.createdWork ?? []).filter(isPendingWork)
        pendingWorkRef.current = pending.filter(isPendingWork)
        setSessionWork(pending)
        setView('result')
        if (usuarioId) await loadJournal(usuarioId)
        toast.success(
          pending.length > 0
            ? `Conversacion terminada. ${pending.length} borrador${pending.length === 1 ? '' : 'es'} para aprobar.`
            : reason === 'time_limit'
              ? 'Se acabaron los 15 minutos. Reporte ejecutivo listo.'
              : 'Conversacion terminada. Reporte ejecutivo listo.'
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo terminar la conversacion.')
        closingRef.current = false
      } finally {
        setClosing(false)
      }
    },
    [loadJournal, usuarioId]
  )

  const retell = useRetellGuideCall({
    onRemoteEnded: () => {
      const left = remainingRef.current
      void closeSession(left <= 0 ? 'time_limit' : 'user_requested')
    },
    onError: (message) => toast.error(message),
  })
  retellStopRef.current = retell.stop
  retellMessagesRef.current = retell.compactMessages
  retellLiveRef.current = retell.messages

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [retell.messages, retell.status, retell.agentTalking])

  useEffect(() => {
    if (!session || !['active', 'closing'].includes(session.status)) return
    const tick = window.setInterval(() => {
      const left = guideService.remainingSeconds(session)
      setRemaining(left)
      if (left <= 0) void closeSession('time_limit')
    }, 1000)
    return () => window.clearInterval(tick)
  }, [closeSession, session])

  const sendText = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      const current = sessionRef.current
      if (!current || current.provider !== 'text' || !text || sendingRef.current || remainingRef.current <= 0 || closingRef.current)
        return
      sendingRef.current = true
      setSending(true)
      setInput('')
      try {
        const userMessage = await guideService.insertUserMessage(current.id, text)
        setMessages((prev) => [...prev, userMessage])
        const turn = await guideService.sendTurn(current)
        setMessages((prev) => [
          ...prev,
          {
            id: `local-assistant-${turn.sequence}`,
            session_id: current.id,
            sequence: turn.sequence,
            role: 'assistant',
            content: turn.answer,
            created_at: new Date().toISOString(),
          },
        ])
        const pending = (turn.createdWork ?? []).filter(isPendingWork)
        const created = (turn.createdWork ?? []).filter((item) => item.title && !item.error && !item.pending)
        if (pending.length > 0) {
          pendingWorkRef.current = pending
          setSessionWork(pending)
          toast.success(
            pending.length === 1
              ? `Borrador listo para aprobar al terminar: ${pending[0]?.title}.`
              : `${pending.length} borradores listos para aprobar al terminar.`
          )
        }
        if (created.length > 0) {
          toast.success(
            created.length === 1
              ? `Quedo en el tablero: ${created[0]?.title}.`
              : `Quedaron ${created.length} elementos en el tablero.`
          )
        }
        const left = guideService.remainingSeconds(current)
        setRemaining(left)
        if (left <= 0) {
          closingRef.current = true
          await closeSession('time_limit')
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo enviar el mensaje.')
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    },
    [closeSession]
  )

  const startConversation = async (nextChannel: GuideChannel) => {
    if (!usuarioId || starting || closing) return
    setChannel(nextChannel)
    setStarting(true)
    retell.stop()
    try {
      const next =
        nextChannel === 'voice'
          ? (await retell.start()).session
          : await guideService.startSession(usuarioId, { replaceActive: true })
      setSession(next)
      setRemaining(guideService.remainingSeconds(next))
      setMessages([])
      setJournal(null)
      pendingWorkRef.current = []
      setSessionWork([])
      setView('chat')
      setInput('')
      closingRef.current = false
      startedAtRef.current = Date.now()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo iniciar Guia.')
    } finally {
      setStarting(false)
    }
  }

  const active = Boolean(session && ['active', 'closing'].includes(session.status) && remaining > 0)
  const isRetell = Boolean(session?.provider === 'retell')
  const ephemeral = Boolean(session && guideService.isLocalSession(session.id))
  const ended = Boolean(session && !active)
  const idle = !active && !ended && messages.length === 0
  const visibleMessages = isRetell && active ? retell.messages : messages
  const phaseLabel = useMemo(() => {
    if (!active) return 'Cerrada'
    if (remaining <= 60) return 'Cierre'
    if (remaining <= 180) return 'Integrar'
    return 'Conversacion'
  }, [active, remaining])

  const pendingAnalysis = useMemo(() => {
    const pending = sessionWork.filter(isPendingWork)
    if (pending.length === 0) return null
    const transcript = messages.map((message) => message.content).join('\n')
    return groundActionDrafts(
      pendingWorkToAnalysis(pending),
      transcript || journal?.user_words || '',
      '',
      todayWallClockCDMX()
    )
  }, [journal?.user_words, messages, sessionWork])

  const markDraftCreated = (title: string, createdId?: string) => {
    const next = sessionWork.map((item) =>
      item.title === title ? { ...item, pending: false, id: createdId || item.id || `created-${title}` } : item
    )
    setSessionWork(next)
    setJournal((current) => (current ? { ...current, created_work: next } : current))
    if (journal?.id) void guideService.saveJournalWork(journal.id, next)
  }

  const busy = starting || sending || closing
  const voiceStatus = isRetell
    ? retell.status === 'connecting'
      ? 'Conectando con el agente…'
      : retell.agentTalking
        ? 'Guia habla…'
        : retell.muted
          ? 'Microfono silenciado'
          : retell.status === 'connected'
            ? 'En llamada con Guia'
            : null
    : sending
      ? 'Guia piensa…'
      : null

  const startControl = (
    <StartTrigger
      starting={starting}
      startingChannel={starting ? channel : null}
      compact={compact}
      onStart={(nextChannel) => void startConversation(nextChannel)}
    />
  )

  if (!usuarioId) {
    return (
      <div className={cn('flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground', className)}>
        Inicia sesion para usar Guia.
      </div>
    )
  }

  if (bootstrapping) {
    return (
      <div className={cn('flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Cargando Guia…
      </div>
    )
  }

  const progressPct = active ? Math.max(0, Math.min(100, (remaining / (15 * 60)) * 100)) : 0

  const livePulse = active && (sending || retell.agentTalking || retell.status === 'connecting')

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 flex-col overflow-hidden',
        'bg-[radial-gradient(120%_80%_at_50%_-10%,hsl(var(--primary)/0.14),transparent_55%),linear-gradient(180deg,hsl(var(--muted)/0.35)_0%,hsl(var(--background))_42%)]',
        className
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.12),transparent_70%)]',
          livePulse && 'animate-pulse'
        )}
        aria-hidden
      />

      <div className={cn('relative shrink-0', compact ? 'px-3 pb-2 pt-3' : 'px-5 pb-3 pt-5')}>
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <span
              className={cn(
                'inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_14px_30px_-16px_hsl(var(--primary)/0.7)] transition duration-300',
                compact ? 'h-10 w-10' : 'h-12 w-12',
                livePulse && 'scale-[1.03]'
              )}
            >
              <Sparkles className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} aria-hidden />
            </span>
            {active ? (
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" aria-hidden />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className={cn('font-semibold tracking-tight', compact ? 'text-sm' : 'text-base')}>Guia</p>
            <p className="truncate text-xs text-muted-foreground">
              {voiceStatus ||
                (active
                  ? `${phaseLabel} · ${formatClock(remaining)}`
                  : '15 minutos para priorizar. Si hay que crear, sale de la conversacion')}
            </p>
          </div>
          {!active ? (
            <div className="shrink-0">
              <GuidePersonalLinkButton compact usuarioId={usuarioId ?? undefined} />
            </div>
          ) : null}
          <div
            className="grid shrink-0 grid-cols-2 gap-0.5 rounded-full bg-background/70 p-1 shadow-sm ring-1 ring-border/50"
            role="tablist"
            aria-label="Vista de Guia"
          >
            {(
              [
                { id: 'chat' as const, label: 'Sesion', icon: MessageSquare },
                { id: 'journal' as const, label: 'Historial', icon: History },
              ] as const
            ).map((option) => {
              const selected = view === option.id
              const Icon = option.icon
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setView(option.id)}
                  className={cn(
                    'inline-flex min-h-8 items-center justify-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" aria-hidden />
                  <span className={cn(compact && 'sr-only sm:not-sr-only')}>{option.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {active ? (
          <div className="mt-4 flex items-center gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums',
                    remaining <= 60
                      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                      : remaining <= 180
                        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
                        : 'bg-background/80 text-foreground ring-1 ring-border/50'
                  )}
                >
                  <Timer className="h-3 w-3" aria-hidden />
                  {formatClock(remaining)}
                </span>
                <span className="truncate text-[11px] font-medium text-muted-foreground">{phaseLabel}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-background/80">
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-500 ease-out',
                    remaining <= 60 ? 'bg-red-500' : remaining <= 180 ? 'bg-amber-500' : 'bg-primary'
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <Button
              key="guide-end"
              type="button"
              variant="secondary"
              className={cn('shrink-0 rounded-full', compact ? 'h-8 px-3 text-[11px]' : 'h-9 px-4')}
              disabled={closing || Date.now() - startedAtRef.current < 1200}
              onClick={() => void closeSession('user_requested')}
            >
              {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : 'Terminar'}
            </Button>
          </div>
        ) : null}
      </div>

      {view === 'result' ? (
        <div className={cn('relative min-h-0 flex-1 space-y-3 overflow-y-auto', compact ? 'px-3 pb-3' : 'px-5 pb-5')}>
          <div className="space-y-3 rounded-[1.35rem] bg-primary/[0.06] px-4 py-3.5 ring-1 ring-primary/15">
            <p className="text-xs font-medium text-primary">Reporte de resultado</p>
            {journal?.topic ? (
              <p className="text-sm font-semibold tracking-tight">{journal.topic}</p>
            ) : (
              <p className="text-sm font-semibold tracking-tight">Conversacion terminada</p>
            )}
            <p className="whitespace-pre-wrap text-sm leading-5 text-foreground/90">
              {(journal?.executive_report || journal?.summary || 'Se conservo lo esencial de la conversacion.')
                .split('\nPARA APROBAR')[0]
                .trim()}
            </p>
            <CreatedWorkList items={recordedWorkItems(sessionWork)} />
          </div>
          {pendingAnalysis ? (
            <div className="rounded-[1.35rem] bg-background/80 px-3 py-3 ring-1 ring-border/50">
              <ActionDraftList
                result={pendingAnalysis}
                createdBy={usuarioId}
                compact={compact}
                onCreated={(draft, created) => markDraftCreated(draft.title, created.id)}
              />
            </div>
          ) : (
            <p className="px-1 text-xs text-muted-foreground">
              No hubo trabajo nuevo para aprobar. El reporte de arriba conserva lo revisado.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="rounded-full" onClick={() => setView('journal')}>
              Ver historial
            </Button>
            {journal ? (
              <Button asChild variant="outline" className="rounded-full">
                <Link to={`${ROUTES.AI_HISTORY}?entry=${encodeURIComponent(journal.id)}`}>Abrir reporte</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : view === 'journal' ? (
        <div className={cn('relative min-h-0 flex-1 space-y-3 overflow-y-auto', compact ? 'px-3 pb-3' : 'px-5 pb-5')}>
          <Link
            to={ROUTES.AI_HISTORY}
            className="group flex items-center justify-between gap-3 rounded-[1.35rem] bg-background/75 px-3.5 py-3 shadow-sm ring-1 ring-border/50 transition hover:-translate-y-0.5 hover:ring-primary/25"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight">Ver historial completo</p>
              <p className="text-xs text-muted-foreground">Reportes, chats y trabajo creado</p>
            </div>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>

          {journal ? (
            <Link
              to={`${ROUTES.AI_HISTORY}?entry=${encodeURIComponent(journal.id)}`}
              className="block space-y-2 rounded-[1.35rem] bg-primary/[0.06] px-4 py-3.5 ring-1 ring-primary/15 transition hover:bg-primary/[0.1]"
            >
              <p className="text-xs font-medium text-primary">Ultimo reporte</p>
              {journal.topic ? <p className="text-sm font-semibold tracking-tight">{journal.topic}</p> : null}
              <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-5 text-foreground/90">
                {journal.executive_report || journal.summary}
              </p>
              <CreatedWorkList items={createdWorkItems(journal)} />
            </Link>
          ) : null}

          {recentJournal.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-background/80 text-primary shadow-sm ring-1 ring-border/50">
                <History className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm font-medium">Aun no hay historial</p>
              <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                Cuando termines una sesion, aqui veras el resumen y podras retomarla.
              </p>
            </div>
          ) : (
            recentJournal.map((entry) => (
              <Link
                key={entry.id}
                to={`${ROUTES.AI_HISTORY}?entry=${encodeURIComponent(entry.id)}`}
                className="group flex items-start gap-3 rounded-[1.25rem] bg-background/70 px-3.5 py-3 ring-1 ring-border/45 transition hover:bg-background hover:ring-primary/20"
              >
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString('es-MX')}
                  </p>
                  <p className="truncate text-sm font-medium">{entry.topic || 'Sesion con Guia'}</p>
                  <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {entry.executive_report
                      ? entry.executive_report.split('\n').filter(Boolean).slice(0, 2).join(' ')
                      : entry.summary}
                  </p>
                  <CreatedWorkList items={createdWorkItems(entry)} />
                </div>
                <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
              </Link>
            ))
          )}
        </div>
      ) : idle ? (
        <div
          className={cn(
            'relative flex min-h-0 flex-1 flex-col items-center justify-center text-center',
            compact ? 'gap-4 px-4 py-6' : 'gap-5 px-6 py-10'
          )}
        >
          <div className="relative">
            <span className="absolute inset-0 rounded-[1.75rem] bg-primary/20 blur-2xl" aria-hidden />
            <span
              className={cn(
                'relative inline-flex items-center justify-center rounded-[1.5rem] bg-primary text-primary-foreground shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.75)]',
                compact ? 'h-14 w-14' : 'h-16 w-16'
              )}
            >
              <Sparkles className={cn(compact ? 'h-6 w-6' : 'h-7 w-7')} aria-hidden />
            </span>
          </div>
          <div className={cn('max-w-md space-y-2', !compact && 'space-y-2.5')}>
            <p className={cn('font-semibold tracking-tight', compact ? 'text-base' : 'text-xl')}>
              Listo cuando tu lo estes
            </p>
            <p className={cn('leading-6 text-muted-foreground', compact ? 'text-sm' : 'text-[15px]')}>
              {welcome}
            </p>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'relative min-h-0 flex-1 space-y-3 overflow-y-auto',
            compact ? 'px-3 pb-2' : 'px-5 pb-4'
          )}
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-background/85 px-3.5 py-2.5 text-[13px] leading-5 shadow-sm ring-1 ring-border/40">
              {isRetell
                ? 'Estamos en llamada. Habla con naturalidad. Si hay un pendiente, Guia lo arma y al terminar sale para aprobar.'
                : welcome}
            </div>
          </div>

          {visibleMessages.map((message) => (
            <div
              key={message.id}
              className={cn('flex items-end gap-2', message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {message.role === 'assistant' ? (
                <span className="mb-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                </span>
              ) : null}
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap px-3.5 py-2.5 text-[13px] leading-5',
                  message.role === 'user'
                    ? 'rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-[0_10px_24px_-14px_hsl(var(--primary)/0.65)]'
                    : 'rounded-2xl rounded-bl-md bg-background/85 text-foreground shadow-sm ring-1 ring-border/40'
                )}
              >
                {message.content}
              </div>
            </div>
          ))}

          {isRetell && retell.status === 'connecting' ? (
            <div className="flex items-center gap-2 pl-9 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Conectando con Guia…
            </div>
          ) : null}
          {isRetell && retell.agentTalking ? (
            <div className="flex items-center gap-2 pl-9 text-[13px] text-muted-foreground">
              <Volume2 className="h-3.5 w-3.5 text-primary" aria-hidden />
              Guia habla…
            </div>
          ) : null}
          {!isRetell && sending ? (
            <div className="flex items-center gap-2 pl-9 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Guia piensa…
            </div>
          ) : null}
          {ended ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Sesion terminada. Revisa el historial o inicia otra.
            </p>
          ) : null}
          <div ref={endRef} />
        </div>
      )}

      <div
        className={cn(
          'relative shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent',
          compact ? 'px-3 pb-3 pt-2' : 'px-5 pb-5 pt-3'
        )}
      >
        <div
          className={cn(
            'space-y-2 rounded-[1.5rem] bg-background/90 p-2.5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] ring-1 ring-border/50 backdrop-blur-sm',
            !compact && 'p-3'
          )}
        >
          {composerLead ? <div className="flex w-full min-w-0 items-center gap-1 px-1">{composerLead}</div> : null}
          {active && isRetell ? (
            <div className="flex items-center gap-2 px-1">
              <Button
                type="button"
                variant={retell.muted ? 'secondary' : 'outline'}
                className={cn('shrink-0 rounded-full', compact ? 'h-10 w-10 px-0' : 'h-11 w-11 px-0')}
                disabled={busy || retell.status !== 'connected'}
                onClick={() => retell.toggleMute()}
                aria-label={retell.muted ? 'Activar microfono' : 'Silenciar microfono'}
              >
                {retell.muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
              </Button>
              <p className="flex-1 text-xs leading-5 text-muted-foreground">
                {retell.status === 'connecting'
                  ? 'Conectando con el agente…'
                  : retell.muted
                    ? 'Microfono silenciado. Guia sigue en la llamada.'
                    : 'Habla con naturalidad. Si hay un pendiente, Guia lo arma.'}
              </p>
            </div>
          ) : active ? (
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={compact ? 1 : 2}
                placeholder="Escribe a Guia…"
                className={cn(
                  'flex-1 resize-none rounded-[1.1rem] border-0 bg-muted/40 px-3.5 py-2.5 text-sm outline-none ring-0 placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring',
                  compact && 'min-h-10 text-[13px]'
                )}
                disabled={busy || remaining <= 0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void sendText(input)
                  }
                }}
              />
              <Button
                type="button"
                className={cn('shrink-0 rounded-full', compact ? 'h-10 w-10 px-0' : 'h-11 w-11 px-0')}
                disabled={busy || !input.trim() || remaining <= 0}
                onClick={() => void sendText(input)}
                aria-label="Enviar"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              </Button>
            </div>
          ) : (
            startControl
          )}
        </div>
        {ephemeral ? (
          <p className="mt-2 px-1 text-[10px] text-amber-700 dark:text-amber-300">
            Esta sesion vive en este navegador hasta aplicar las tablas de Guia.
          </p>
        ) : null}
      </div>
    </div>
  )
}
