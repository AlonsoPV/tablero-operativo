import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ClipboardList,
  Loader2,
  MessageCircle,
  Plus,
  Reply,
  Search,
  Send,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  whatsappInboxService,
  type WhatsAppComposeOptions,
  type WhatsAppConversation,
  type WhatsAppInboxContact,
  type WhatsAppThreadMessage,
} from '@/features/whatsapp-inbox/services/whatsappInbox.service'
import {
  resolveThreadMeta,
  summarizeThread,
  type WhatsAppInteractionKind,
} from '@/features/whatsapp-inbox/whatsappThreadMeta'

type ThreadFilter = 'all' | 'actions' | 'replies'

function formatFriendlyDate(iso: string | null | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const now = new Date()
  const time = date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return `Hoy · ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return `Ayer · ${time}`
  return date.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDay(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function statusLabel(status: string | null | undefined) {
  switch (status) {
    case 'queued':
      return 'En cola'
    case 'sent':
      return 'Enviado'
    case 'delivered':
      return 'Entregado'
    case 'read':
      return 'Leído'
    case 'failed':
      return 'Error'
    default:
      return status || ''
  }
}

function StatusIcon({ status }: { status: string | null | undefined }) {
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />
  if (status === 'read' || status === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
  }
  if (status === 'sent' || status === 'queued') {
    return <Check className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
  }
  return null
}

function kindChipClass(kind: WhatsAppInteractionKind) {
  switch (kind) {
    case 'action_initial':
    case 'action_followup':
    case 'action_close':
    case 'operator':
    case 'assistant':
      return 'bg-primary/10 text-primary'
    default:
      return 'bg-muted/70 text-muted-foreground'
  }
}

function newClientRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `wa-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function ThreadMessageBubble({ message }: { message: WhatsAppThreadMessage }) {
  const meta = resolveThreadMeta(message)
  const outbound = message.direction === 'outbound'
  const actionish = meta.isActionOutbound
  const replyish = meta.isUserReply

  return (
    <div className={cn('flex gap-2', outbound ? 'justify-end' : 'justify-start')}>
      {!outbound ? (
        <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {replyish ? <Reply className="h-3.5 w-3.5" aria-hidden /> : <MessageCircle className="h-3.5 w-3.5" aria-hidden />}
        </span>
      ) : null}
      <div className="max-w-[85%] space-y-1.5">
        <div className={cn('flex flex-wrap items-center gap-1.5', outbound && 'justify-end')}>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
              kindChipClass(meta.kind)
            )}
          >
            {actionish ? <ClipboardList className="h-3 w-3" aria-hidden /> : null}
            {meta.label}
          </span>
          {meta.actionTitle ? (
            <span className="max-w-[14rem] truncate text-[10px] text-muted-foreground">
              {meta.actionTitle}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            'whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-5',
            outbound
              ? 'rounded-2xl rounded-br-md bg-primary text-primary-foreground'
              : 'rounded-2xl rounded-bl-md bg-background text-foreground shadow-sm ring-1 ring-border/50'
          )}
        >
          {meta.checkpointText ? (
            <p className={cn('mb-1.5 text-[11px]', outbound ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              Checkpoint: {meta.checkpointText}
            </p>
          ) : null}
          {message.body_text || `[${message.message_kind}]`}
          <div
            className={cn(
              'mt-1.5 flex flex-wrap items-center gap-2 text-[10px]',
              outbound ? 'text-primary-foreground/75' : 'text-muted-foreground'
            )}
          >
            <span>{formatFriendlyDate(message.created_at)}</span>
            {outbound ? (
              <span className="inline-flex items-center gap-1">
                <StatusIcon status={message.delivery_status} />
                {statusLabel(message.delivery_status)}
              </span>
            ) : null}
          </div>
          {message.error_message ? (
            <p className="mt-1 text-[11px] opacity-90">{message.error_message}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function WhatsAppSeguimientoPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedWaId = searchParams.get('wa')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([])
  const [messages, setMessages] = useState<WhatsAppThreadMessage[]>([])
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('all')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [threadError, setThreadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [compose, setCompose] = useState<WhatsAppComposeOptions | null>(null)
  const [templateParams, setTemplateParams] = useState(['', '', ''])
  const [newOpen, setNewOpen] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [contacts, setContacts] = useState<WhatsAppInboxContact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const sendLock = useRef(false)
  const threadEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const loadConversations = useCallback(async () => {
    setListError(null)
    try {
      const rows = await whatsappInboxService.listConversations({
        search: debouncedSearch || undefined,
        limit: 80,
      })
      setConversations(rows)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'No se pudo cargar la bandeja.')
    } finally {
      setLoadingList(false)
    }
  }, [debouncedSearch])

  useEffect(() => {
    setLoadingList(true)
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    const channel = whatsappInboxService.subscribeInbox(() => {
      void loadConversations()
    })
    const poll = window.setInterval(() => {
      void loadConversations()
    }, 45_000)
    return () => {
      void whatsappInboxService.unsubscribe(channel)
      window.clearInterval(poll)
    }
  }, [loadConversations])

  const selected = useMemo(
    () => conversations.find((c) => c.wa_id === selectedWaId) ?? null,
    [conversations, selectedWaId]
  )

  const loadThread = useCallback(
    async (waId: string, opts?: { append?: boolean; before?: string }) => {
      if (opts?.append) setLoadingMore(true)
      else {
        setLoadingThread(true)
        setThreadError(null)
      }
      try {
        const rows = await whatsappInboxService.listMessages({
          waId,
          limit: 40,
          before: opts?.before ?? null,
        })
        const chronological = [...rows].reverse()
        setMessages((prev) => {
          if (!opts?.append) return chronological
          const ids = new Set(prev.map((m) => m.id))
          const older = chronological.filter((m) => !ids.has(m.id))
          return [...older, ...prev]
        })
      } catch (err) {
        if (!opts?.append) {
          setThreadError(err instanceof Error ? err.message : 'No se pudo cargar el hilo.')
          setMessages([])
        }
      } finally {
        setLoadingThread(false)
        setLoadingMore(false)
      }
    },
    []
  )

  const refreshCompose = useCallback(
    async (waId: string, usuarioId?: string | null) => {
      try {
        const options = await whatsappInboxService.getComposeOptions({
          waId,
          usuarioId: usuarioId || undefined,
        })
        setCompose(options)
        if (!options.openSession && options.templates[0]) {
          setTemplateParams((prev) => [
            prev[0] || selected?.contact_name || '',
            prev[1] || '',
            prev[2] || '',
          ])
        }
      } catch {
        setCompose(null)
      }
    },
    [selected?.contact_name]
  )

  useEffect(() => {
    if (!selectedWaId) {
      setMessages([])
      setCompose(null)
      setSendError(null)
      setThreadFilter('all')
      return
    }
    void loadThread(selectedWaId)
    void refreshCompose(selectedWaId, selected?.usuario_id)
    const channel = whatsappInboxService.subscribeThread(selectedWaId, () => {
      void loadThread(selectedWaId)
      void loadConversations()
    })
    const poll = window.setInterval(() => {
      void loadThread(selectedWaId)
    }, 45_000)
    return () => {
      void whatsappInboxService.unsubscribe(channel)
      window.clearInterval(poll)
    }
  }, [selectedWaId, selected?.usuario_id, loadThread, loadConversations, refreshCompose])

  useEffect(() => {
    if (!selectedWaId || loadingThread) return
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [selectedWaId, loadingThread, messages.length, threadFilter])

  useEffect(() => {
    if (!newOpen) return
    let cancelled = false
    setLoadingContacts(true)
    void whatsappInboxService
      .listContacts({ search: contactSearch, limit: 40 })
      .then((rows) => {
        if (!cancelled) setContacts(rows)
      })
      .catch(() => {
        if (!cancelled) setContacts([])
      })
      .finally(() => {
        if (!cancelled) setLoadingContacts(false)
      })
    return () => {
      cancelled = true
    }
  }, [newOpen, contactSearch])

  const openConversation = (waId: string) => {
    setSearchParams({ wa: waId })
    setDraft('')
    setSendError(null)
    setTemplateParams(['', '', ''])
    setThreadFilter('all')
  }

  const clearSelection = () => {
    setSearchParams({})
  }

  const startWithContact = (contact: WhatsAppInboxContact) => {
    setNewOpen(false)
    setSearchParams({ wa: contact.phone })
    setDraft('')
    setSendError(null)
    setTemplateParams([contact.nombre || '', '', ''])
    setThreadFilter('all')
  }

  const handleSend = async () => {
    if (!selectedWaId || sendLock.current || sending) return
    sendLock.current = true
    setSending(true)
    setSendError(null)
    const clientRequestId = newClientRequestId()
    try {
      const useTemplate = compose && !compose.canSendFreeText
      if (useTemplate) {
        const params = templateParams.map((p) => p.trim())
        if (params.some((p) => !p)) {
          throw new Error('Completa los tres campos de la plantilla.')
        }
        if (!compose.templates.length) {
          throw new Error(
            compose.templateUnavailableReason ||
              'No hay plantilla aprobada disponible para iniciar la conversación.'
          )
        }
        await whatsappInboxService.sendMessage({
          waId: selectedWaId,
          usuarioId: selected?.usuario_id || compose.usuarioId,
          mode: 'template',
          templateParams: params,
          clientRequestId,
        })
      } else {
        if (!draft.trim()) throw new Error('Escribe un mensaje.')
        await whatsappInboxService.sendMessage({
          waId: selectedWaId,
          usuarioId: selected?.usuario_id || compose?.usuarioId,
          mode: 'text',
          text: draft.trim(),
          clientRequestId,
        })
        setDraft('')
      }
      await loadThread(selectedWaId)
      await loadConversations()
      await refreshCompose(selectedWaId, selected?.usuario_id)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'No se pudo enviar.')
    } finally {
      setSending(false)
      sendLock.current = false
    }
  }

  const oldest = messages[0]?.created_at
  const canLoadMore = Boolean(selectedWaId && oldest && messages.length >= 40)
  const summary = useMemo(() => summarizeThread(messages), [messages])

  const visibleMessages = useMemo(() => {
    if (threadFilter === 'all') return messages
    return messages.filter((message) => {
      const meta = resolveThreadMeta(message)
      if (threadFilter === 'actions') return meta.isActionOutbound
      return meta.isUserReply
    })
  }, [messages, threadFilter])

  const dayBuckets = useMemo(() => {
    const buckets: Array<{ day: string; items: WhatsAppThreadMessage[] }> = []
    for (const message of visibleMessages) {
      const day = formatDay(message.created_at)
      const last = buckets[buckets.length - 1]
      if (!last || last.day !== day) buckets.push({ day, items: [message] })
      else last.items.push(message)
    }
    return buckets
  }, [visibleMessages])

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-24 sm:pb-8">
      {!selectedWaId ? (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-primary">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-xs font-medium">Bandeja de seguimiento</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Seguimiento WhatsApp</h1>
            <p className="max-w-md text-sm leading-5 text-muted-foreground">
              Revisa envíos por acción, respuestas del usuario y continúa el hilo cuando haga falta.
            </p>
          </div>
          <Button type="button" className="shrink-0 gap-2 rounded-full px-4" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nueva conversación
          </Button>
        </header>
      ) : null}

      {selectedWaId ? (
        <div className="space-y-6">
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Todas las conversaciones
          </button>

          <section className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(160deg,hsl(var(--primary)/0.12)_0%,hsl(var(--muted)/0.45)_42%,hsl(var(--card))_100%)] p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-2xl" aria-hidden />
            <div className="relative space-y-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <MessageCircle className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatFriendlyDate(selected?.last_message_at) || selectedWaId}
                  </p>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {selected?.contact_name || selectedWaId}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {selectedWaId}
                    {summary.actionSends > 0 ? ` · ${summary.actionSends} envíos` : ''}
                    {summary.userReplies > 0 ? ` · ${summary.userReplies} respuestas` : ''}
                  </p>
                  {compose ? (
                    <p className="text-xs text-muted-foreground">
                      {compose.openSession
                        ? 'Ventana de 24 h abierta · texto libre permitido'
                        : 'Ventana de 24 h cerrada · se requiere plantilla'}
                    </p>
                  ) : null}
                </div>
              </div>
              <div
                className="grid max-w-sm grid-cols-3 gap-0.5 rounded-full bg-background/70 p-0.5 ring-1 ring-border/50"
                role="tablist"
                aria-label="Filtrar interacciones"
              >
                {(
                  [
                    { id: 'all' as const, label: 'Todo' },
                    { id: 'actions' as const, label: 'Acciones' },
                    { id: 'replies' as const, label: 'Respuestas' },
                  ] as const
                ).map((option) => {
                  const active = threadFilter === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setThreadFilter(option.id)}
                      className={cn(
                        'rounded-full px-2 py-1.5 text-[11px] font-semibold transition',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold tracking-tight">Conversación</h2>
            </div>

            {canLoadMore ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  disabled={loadingMore}
                  onClick={() => void loadThread(selectedWaId, { append: true, before: oldest })}
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Cargar anteriores'}
                </Button>
              </div>
            ) : null}

            {loadingThread ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Cargando interacciones…
              </div>
            ) : threadError ? (
              <div className="rounded-3xl bg-destructive/5 px-4 py-6 text-sm text-destructive ring-1 ring-destructive/20">
                {threadError}
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[1.5rem] bg-muted/30 px-5 py-10 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-background text-primary shadow-sm ring-1 ring-border/60">
                  <MessageCircle className="h-6 w-6" aria-hidden />
                </span>
                <p className="max-w-sm text-sm leading-5 text-muted-foreground">
                  {messages.length === 0
                    ? 'Aún no hay mensajes en este hilo.'
                    : threadFilter === 'actions'
                      ? 'No hay envíos por acción en este hilo.'
                      : 'No hay respuestas del usuario todavía.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4 rounded-[1.5rem] bg-muted/25 p-3 sm:p-4">
                {dayBuckets.map((bucket) => (
                  <div key={bucket.day} className="space-y-3">
                    <p className="text-center text-[11px] font-medium text-muted-foreground">{bucket.day}</p>
                    {bucket.items.map((message) => (
                      <ThreadMessageBubble key={message.id} message={message} />
                    ))}
                  </div>
                ))}
                <div ref={threadEndRef} />
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-[1.5rem] bg-card p-3.5 ring-1 ring-border/60 sm:p-4">
            {compose && !compose.canSendFreeText ? (
              <div className="space-y-3">
                {compose.templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {compose.templateUnavailableReason ||
                      'No hay plantilla Meta configurada para iniciar fuera de la ventana de 24 h.'}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {compose.templates[0].label}. Vista previa:{' '}
                      <span className="font-medium text-foreground">
                        {[...templateParams].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {compose.templates[0].bodyParams.map((param, idx) => (
                        <Input
                          key={param.key}
                          value={templateParams[idx] ?? ''}
                          onChange={(e) => {
                            const next = [...templateParams]
                            next[idx] = e.target.value
                            setTemplateParams(next)
                          }}
                          placeholder={param.label}
                          className="rounded-xl"
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Escribe una respuesta al usuario…"
                className="w-full resize-none rounded-2xl bg-muted/35 px-3.5 py-2.5 text-sm outline-none ring-1 ring-border/50 focus-visible:ring-2 focus-visible:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
              />
            )}
            {sendError ? <p className="text-xs text-destructive">{sendError}</p> : null}
            <div className="flex justify-end">
              <Button
                type="button"
                className="gap-2 rounded-full"
                disabled={
                  sending ||
                  (compose != null && !compose.canSendFreeText && compose.templates.length === 0)
                }
                onClick={() => void handleSend()}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                Enviar
              </Button>
            </div>
          </section>
        </div>
      ) : loadingList ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Cargando tus conversaciones…
        </div>
      ) : listError ? (
        <div className="space-y-3 rounded-3xl bg-destructive/5 px-4 py-6 text-sm text-destructive ring-1 ring-destructive/20">
          <p>{listError}</p>
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void loadConversations()}>
            Reintentar
          </Button>
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[1.75rem] bg-muted/25 px-6 py-16 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="h-7 w-7" aria-hidden />
          </span>
          <div className="max-w-sm space-y-1.5">
            <p className="text-base font-semibold">Tu bandeja empieza aquí</p>
            <p className="text-sm leading-5 text-muted-foreground">
              Inicia una conversación con un usuario autorizado. Aquí verás envíos por acción y sus respuestas.
            </p>
          </div>
          <Button type="button" className="gap-2 rounded-full" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Nueva conversación
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre o número"
              className="rounded-2xl pl-9"
            />
          </div>
          <div className="space-y-2.5">
            {conversations.map((c) => {
              const inbound = c.last_direction === 'inbound'
              return (
                <button
                  key={c.wa_id}
                  type="button"
                  onClick={() => openConversation(c.wa_id)}
                  className="group flex w-full items-start gap-3 rounded-[1.35rem] bg-card p-3.5 text-left ring-1 ring-border/60 transition hover:bg-muted/30 hover:ring-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <MessageCircle className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold tracking-tight">{c.contact_name}</p>
                        <p className="text-[11px] text-muted-foreground">{formatFriendlyDate(c.last_message_at)}</p>
                      </div>
                      <ArrowRight
                        className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden
                      />
                    </div>
                    <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                      {inbound ? 'Respondió: ' : 'Enviado: '}
                      {c.last_message_text || 'Sin texto'}
                    </p>
                    <span className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-medium text-primary">
                      {c.phone}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {newOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Nueva conversación"
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] bg-background shadow-[0_28px_70px_-28px_rgba(15,23,42,0.5)] ring-1 ring-border/60"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-semibold">Nueva conversación</h2>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setNewOpen(false)}>
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="px-4 pb-3">
              <Input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Buscar usuario autorizado con WhatsApp"
                className="rounded-2xl"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {loadingContacts ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Buscando…
                </div>
              ) : contacts.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                  No hay usuarios activos con WhatsApp vinculado.
                </p>
              ) : (
                <div className="space-y-2">
                  {contacts.map((c) => (
                    <button
                      key={c.usuario_id}
                      type="button"
                      className="flex w-full flex-col gap-0.5 rounded-[1.2rem] bg-card px-3.5 py-3 text-left ring-1 ring-border/60 transition hover:bg-muted/30"
                      onClick={() => startWithContact(c)}
                    >
                      <span className="text-sm font-medium">{c.nombre}</span>
                      <span className="text-xs text-muted-foreground">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
