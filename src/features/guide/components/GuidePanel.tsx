import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BookOpen, Loader2, Mic, MicOff, Send, Sparkles, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useRetellGuideCall } from '@/features/guide/hooks/useRetellGuideCall'
import { guideService } from '@/features/guide/services/guide.service'
import type { GuideCompactMessage, GuideJournalEntry, GuideMessage, GuideSession } from '@/features/guide/types'
import { cn } from '@/lib/utils'

type GuidePanelProps = {
  usuarioId: string | null
  compact?: boolean
  className?: string
  composerLead?: ReactNode
}

type GuideChannel = 'text' | 'voice'

function formatClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function StartTrigger({
  channel,
  onChannel,
  onStart,
  starting,
  compact,
  label,
}: {
  channel: GuideChannel
  onChannel: (channel: GuideChannel) => void
  onStart: () => void
  starting: boolean
  compact?: boolean
  label: string
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div
        className="grid grid-cols-2 rounded-lg border border-border/70 bg-muted/40 p-0.5"
        role="radiogroup"
        aria-label="Como hablar con Guia"
      >
        <button
          type="button"
          role="radio"
          aria-checked={channel === 'text'}
          disabled={starting}
          onClick={() => onChannel('text')}
          className={cn(
            'rounded-md px-2 py-1.5 text-[12px] font-medium',
            channel === 'text' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Texto
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={channel === 'voice'}
          disabled={starting}
          onClick={() => onChannel('voice')}
          className={cn(
            'inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium',
            channel === 'voice' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Mic className="h-3 w-3" aria-hidden />
          Voz
        </button>
      </div>
      <Button type="button" className={cn('w-full', compact ? 'h-9' : 'h-10')} onClick={onStart} disabled={starting}>
        {starting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : label}
      </Button>
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
  const [view, setView] = useState<'chat' | 'journal'>('chat')
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
    'Hola. Soy Guia, un acompanante reflexivo por 15 minutos. Puedo decirte que esta pasando en tu tablero. No soy terapia. Si quieres, cuenta que traes hoy.'

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
        setView('journal')
        if (usuarioId) await loadJournal(usuarioId)
        toast.success(reason === 'time_limit' ? 'Se acabaron los 15 minutos. Reflexion lista.' : 'Conversacion terminada.')
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

  const startConversation = async () => {
    if (!usuarioId || starting || closing) return
    setStarting(true)
    retell.stop()
    try {
      const next =
        channel === 'voice'
          ? (await retell.start()).session
          : await guideService.startSession(usuarioId, { replaceActive: true })
      setSession(next)
      setRemaining(guideService.remainingSeconds(next))
      setMessages([])
      setJournal(null)
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
      channel={channel}
      onChannel={setChannel}
      onStart={() => void startConversation()}
      starting={starting}
      compact={compact}
      label={idle ? 'Iniciar' : 'Nueva conversacion'}
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

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className={cn('flex shrink-0 items-center gap-2 border-b border-border/60', compact ? 'px-2 py-1.5' : 'px-3 py-2')}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">Guia · 15 min</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {voiceStatus || 'Acompanamiento reflexivo · no es terapia'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setView('chat')}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] font-medium',
              view === 'chat' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            Sesion
          </button>
          <button
            type="button"
            onClick={() => setView('journal')}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium',
              view === 'journal' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            )}
          >
            <BookOpen className="h-3 w-3" aria-hidden />
            Diario
          </button>
        </div>
        {active ? (
          <>
            <span
              className={cn(
                'rounded-md px-2 py-1 font-mono text-[11px] font-semibold tabular-nums',
                remaining <= 60
                  ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                  : remaining <= 180
                    ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
                    : 'bg-muted text-foreground'
              )}
            >
              {formatClock(remaining)} · {phaseLabel}
            </span>
            <Button
              key="guide-end"
              type="button"
              variant="secondary"
              className={cn('shrink-0', compact ? 'h-8 px-2 text-[11px]' : 'h-8')}
              disabled={closing || Date.now() - startedAtRef.current < 1200}
              onClick={() => void closeSession('user_requested')}
            >
              {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : 'Terminar'}
            </Button>
          </>
        ) : null}
      </div>

      {view === 'journal' ? (
        <div className={cn('min-h-0 flex-1 space-y-2 overflow-y-auto', compact ? 'p-2' : 'p-3')}>
          {journal ? (
            <article className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Ultima reflexion</p>
              {journal.topic ? <p className="text-sm font-semibold">{journal.topic}</p> : null}
              {journal.summary ? <p className="text-sm leading-5">{journal.summary}</p> : null}
              {journal.learning ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Aprendizaje:</span> {journal.learning}
                </p>
              ) : null}
              {journal.intention ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Intencion:</span> {journal.intention}
                </p>
              ) : null}
              {journal.reflection_question ? (
                <p className="text-xs italic text-muted-foreground">{journal.reflection_question}</p>
              ) : null}
            </article>
          ) : null}
          {recentJournal.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aun no hay entradas de diario.</p>
          ) : (
            recentJournal.map((entry) => (
              <article key={entry.id} className="space-y-1 rounded-lg border border-border/70 bg-background p-3">
                <p className="text-[10px] text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString('es-MX')}
                </p>
                <p className="text-sm font-medium">{entry.topic || 'Sin tema'}</p>
                <p className="text-xs leading-5 text-muted-foreground">{entry.summary}</p>
              </article>
            ))
          )}
        </div>
      ) : idle ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
          <Sparkles className="h-7 w-7 text-primary" aria-hidden />
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium">Conversacion de 15 minutos</p>
            <p className="text-sm leading-5 text-muted-foreground">{welcome}</p>
            <p className="text-[11px] text-muted-foreground">Elige texto o voz y pulsa Iniciar. Guia ve tu tablero.</p>
          </div>
        </div>
      ) : (
        <div className={cn('min-h-0 flex-1 space-y-2 overflow-y-auto bg-muted/15', compact ? 'px-2.5 py-2' : 'px-3 py-3')}>
          {isRetell ? (
            <div className="mr-auto max-w-[96%] rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[13px] leading-snug">
              Llamada con el agente de Guia. Habla con naturalidad; Terminar cierra y guarda la reflexion.
            </div>
          ) : (
            <div className="mr-auto max-w-[96%] rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[13px] leading-snug">
              {welcome}
            </div>
          )}
          {visibleMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'rounded-lg border whitespace-pre-wrap px-2.5 py-1.5 text-[13px] leading-snug',
                message.role === 'user'
                  ? 'ml-auto max-w-[96%] border-primary/20 bg-primary/10'
                  : 'mr-auto max-w-[96%] border-border/70 bg-background'
              )}
            >
              <p>{message.content}</p>
            </div>
          ))}
          {isRetell && retell.status === 'connecting' ? (
            <div className="mr-auto flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Conectando con el agente…
            </div>
          ) : null}
          {isRetell && retell.agentTalking ? (
            <div className="mr-auto flex items-center gap-2 rounded-lg border border-primary/20 bg-background px-2.5 py-1.5 text-[13px] text-muted-foreground">
              <Volume2 className="h-3.5 w-3.5" aria-hidden />
              Guia habla…
            </div>
          ) : null}
          {!isRetell && sending ? (
            <div className="mr-auto flex items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-[13px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Guia piensa…
            </div>
          ) : null}
          {ended ? (
            <p className="text-center text-[11px] text-muted-foreground">Conversacion terminada. Revisa el diario o inicia otra.</p>
          ) : null}
          <div ref={endRef} />
        </div>
      )}

      <div className={cn('shrink-0 space-y-2 border-t border-border/70 bg-card', compact ? 'p-2' : 'p-3')}>
        <div className="flex flex-wrap items-end gap-2">
          {composerLead ? <div className="flex w-full min-w-0 items-center gap-1">{composerLead}</div> : null}
          {active && isRetell ? (
            <>
              <Button
                type="button"
                variant={retell.muted ? 'secondary' : 'outline'}
                className={cn('shrink-0', compact ? 'h-9 w-9 px-0' : 'h-10 w-10 px-0')}
                disabled={busy || retell.status !== 'connected'}
                onClick={() => retell.toggleMute()}
                aria-label={retell.muted ? 'Activar microfono' : 'Silenciar microfono'}
              >
                {retell.muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
              </Button>
              <p className="flex-1 text-xs leading-5 text-muted-foreground">
                {retell.status === 'connecting'
                  ? 'Conectando con el agente de Retell…'
                  : retell.muted
                    ? 'Microfono silenciado. Guia sigue en la llamada.'
                    : 'Habla con Guia. El audio sale de su agente.'}
              </p>
            </>
          ) : active ? (
            <>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={compact ? 1 : 2}
                placeholder="Escribe a Guia"
                className={cn(
                  'flex-1 resize-none rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  compact && 'min-h-9 text-[13px]'
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
                className={cn('shrink-0', compact ? 'h-9 w-9 px-0' : 'h-10')}
                disabled={busy || !input.trim() || remaining <= 0}
                onClick={() => void sendText(input)}
                aria-label="Enviar"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              </Button>
            </>
          ) : (
            startControl
          )}
        </div>
        {ephemeral ? (
          <p className="text-[10px] text-amber-700 dark:text-amber-300">
            Esta sesion vive en este navegador hasta aplicar las tablas de Guia.
          </p>
        ) : null}
        <p className="text-[10px] text-muted-foreground">
          Privado por usuario. En crisis: 911 / Linea de la Vida 800 911 2000.
        </p>
      </div>
    </div>
  )
}
