import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  History,
  Loader2,
  MessageCircle,
  Mic,
  Play,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { guideService } from '@/features/guide/services/guide.service'
import type { GuideCreatedWork, GuideJournalEntry, GuideMessage } from '@/features/guide/types'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { cn } from '@/lib/utils'
import { todayWallClockCDMX } from '@/lib/dateUtils'
import { ActionDraftList } from '@/features/ai-support/components/ActionDraftList'
import { groundActionDrafts } from '@/features/ai-support/groundActionDrafts'
import { GuideReportActions } from '@/features/guide/components/GuideReportActions'
import { GuideReportBody } from '@/features/guide/components/GuideReportBody'
import { pendingWorkItems, pendingWorkToAnalysis } from '@/features/guide/pendingWork'
import { AssistantProposalCard } from '@/features/ai-support/components/AssistantProposalCard'
import { listSessionWorkspaceOps } from '@/features/ai-support/services/assistantOpsClient'
import type { CopilotProposal } from '@/features/ai-support/copilot/types'

function createdWorkItems(entry: GuideJournalEntry | null | undefined): GuideCreatedWork[] {
  return (entry?.created_work ?? []).filter((item) => item.title && !item.error && !item.pending && item.id)
}

function previewText(entry: GuideJournalEntry) {
  if (entry.executive_report?.trim()) {
    return entry.executive_report.split('\n').filter(Boolean).slice(0, 2).join(' ')
  }
  return entry.summary?.trim() || entry.agent_inferences?.trim() || 'Sesion con Guia lista para revisar.'
}

function cdmxDateKey(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function formatFriendlyDate(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const key = cdmxDateKey(iso)
  const todayKey = cdmxDateKey(new Date().toISOString())
  const yesterdayKey = cdmxDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  const time = date.toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    minute: '2-digit',
  })
  if (key && key === todayKey) return `Hoy · ${time}`
  if (key && key === yesterdayKey) return `Ayer · ${time}`
  return date.toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
    month: 'short',
    year: key.slice(0, 4) === todayKey.slice(0, 4) ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CreatedWorkList({ items }: { items: GuideCreatedWork[] }) {
  if (items.length === 0) return null
  return (
    <section className="space-y-3" aria-label="Trabajo en tablero">
      <div className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
          Ya quedo en el tablero
        </p>
        <p className="text-sm text-muted-foreground">
          Elementos creados o confirmados a partir de esta sesion.
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={`${item.kind}-${item.id || item.title}`}
            className="flex items-start gap-2.5 rounded-2xl border border-border/60 bg-card px-3.5 py-3 shadow-sm"
          >
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
              {item.kind === 'initiative' ? 'IN' : 'AC'}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-5 text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {item.kind === 'initiative' ? 'Iniciativa' : 'Accion'}
                {item.keyResultTitle ? ` · KR ${item.keyResultTitle}` : ''}
                {item.alreadyExisted ? ' · ya existia' : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function AiHistoryPage() {
  const navigate = useNavigate()
  const { data: currentUser } = useCurrentUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('entry')
  const [entries, setEntries] = useState<GuideJournalEntry[]>([])
  const [messages, setMessages] = useState<GuideMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workspaceOps, setWorkspaceOps] = useState<
    Array<CopilotProposal & { status?: string; errorMessage?: string | null }>
  >([])

  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void guideService
      .listJournal(currentUser.id, 50)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el historial.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentUser?.id])

  const selected = useMemo(
    () => entries.find((entry) => entry.id === selectedId) ?? null,
    [entries, selectedId]
  )

  const selectedWork = useMemo(() => createdWorkItems(selected), [selected])
  const selectedPending = useMemo(() => pendingWorkItems(selected?.created_work), [selected])
  const pendingAnalysis = useMemo(() => {
    if (selectedPending.length === 0) return null
    const transcript = messages.map((message) => message.content).join('\n')
    return groundActionDrafts(
      pendingWorkToAnalysis(selectedPending),
      transcript || selected?.user_words || '',
      '',
      todayWallClockCDMX()
    )
  }, [messages, selected?.user_words, selectedPending])

  const markDraftCreated = (title: string, createdId?: string) => {
    if (!selected) return
    const nextWork = (selected.created_work ?? []).map((item) =>
      item.title === title
        ? { ...item, pending: false, id: createdId || item.id || `created-${title}` }
        : item
    )
    setEntries((prev) =>
      prev.map((entry) => (entry.id === selected.id ? { ...entry, created_work: nextWork } : entry))
    )
    void guideService.saveJournalWork(selected.id, nextWork)
  }

  useEffect(() => {
    if (!selected?.session_id) {
      setMessages([])
      return
    }
    let cancelled = false
    setLoadingMessages(true)
    void guideService
      .listMessages(selected.session_id)
      .then((rows) => {
        if (!cancelled) setMessages(rows)
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected?.session_id])

  useEffect(() => {
    if (!selected?.session_id) {
      setWorkspaceOps([])
      return
    }
    let cancelled = false
    void listSessionWorkspaceOps(selected.session_id)
      .then((items) => {
        if (!cancelled) setWorkspaceOps(items)
      })
      .catch(() => {
        if (!cancelled) setWorkspaceOps([])
      })
    return () => {
      cancelled = true
    }
  }, [selected?.session_id])

  const openEntry = (entryId: string) => {
    setSearchParams({ entry: entryId })
  }

  const clearSelection = () => {
    setSearchParams({})
  }

  const resumeConversation = async (entry: GuideJournalEntry) => {
    if (!currentUser?.id || resuming) return
    setResuming(true)
    try {
      await guideService.resumeFromJournal(currentUser.id, entry)
      toast.success('Listo. Seguimos desde donde lo dejaste.')
      navigate(`${ROUTES.AI_ASSIST}?lane=talk`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo retomar la conversacion.')
    } finally {
      setResuming(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-28 sm:pb-8">
      {!selected ? (
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-primary">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <History className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-xs font-medium">Tus sesiones con Guia</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Historial</h1>
            <p className="max-w-md text-sm leading-5 text-muted-foreground">
              Revisa reportes, lo que quedo en el tablero y retoma cuando quieras.
            </p>
          </div>
          <Button asChild className="shrink-0 gap-2 rounded-full px-4">
            <Link to={ROUTES.AI_ASSIST}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Nueva sesion
            </Link>
          </Button>
        </header>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Cargando tus sesiones…
        </div>
      ) : error ? (
        <div className="rounded-3xl bg-destructive/5 px-4 py-6 text-sm text-destructive ring-1 ring-destructive/20">
          {error}
        </div>
      ) : selected ? (
        <div className="space-y-6">
          <button
            type="button"
            onClick={clearSelection}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Todas las sesiones
          </button>

          <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-sm">
            <div className="space-y-5 border-b border-border/50 bg-[linear-gradient(165deg,hsl(var(--primary)/0.08)_0%,hsl(var(--card))_55%)] p-5 sm:p-6">
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {formatFriendlyDate(selected.created_at)}
                </p>
                <div className="space-y-2">
                  <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-snug">
                    {selected.topic || 'Sesion con Guia'}
                  </h1>
                  <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                    Resumen para decidir: que paso, que falta aprobar y como continuar.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-border/70">
                    {messages.length > 0
                      ? `${messages.length} mensajes`
                      : 'Sesion por voz'}
                  </span>
                  {selectedPending.length > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-500/25 dark:text-amber-200">
                      {selectedPending.length} por aprobar
                    </span>
                  ) : null}
                  {selectedWork.length > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200">
                      {selectedWork.length} en tablero
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  size="lg"
                  className="h-11 gap-2 rounded-full px-5"
                  disabled={resuming || !currentUser?.id}
                  onClick={() => void resumeConversation(selected)}
                >
                  {resuming ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden />
                  )}
                  Seguir conversando
                </Button>
                <p className="px-1 text-xs leading-5 text-muted-foreground sm:max-w-[16rem] sm:px-0">
                  Retoma 15 minutos con el mismo contexto de esta sesion.
                </p>
              </div>
            </div>

            {(selected.executive_report || selected.summary) && (
              <div className="space-y-2 border-b border-border/50 px-5 py-4 sm:px-6">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold tracking-tight text-foreground">
                    Compartir informe
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF para archivo; WhatsApp para un resumen corto al perfil vinculado.
                  </p>
                </div>
                <GuideReportActions
                  topic={selected.topic}
                  dateLabel={formatFriendlyDate(selected.created_at)}
                  executiveReport={selected.executive_report}
                  summary={selected.summary}
                  learning={selected.learning}
                  intention={selected.intention}
                  createdAt={selected.created_at}
                  entryId={selected.id}
                  sessionId={selected.session_id}
                  onShare={async (confirm) => {
                    const headers = await (async () => {
                      const { data } = await import('@/lib/supabase/client').then((mod) =>
                        mod.supabase.auth.getSession()
                      )
                      const token = data.session?.access_token
                      if (!token) throw new Error('Debes iniciar sesion.')
                      return {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      }
                    })()
                    const response = await fetch('/api/guide-report-share', {
                      method: 'POST',
                      headers,
                      body: JSON.stringify({ entry_id: selected.id, confirm }),
                    })
                    const payload = (await response.json().catch(() => ({}))) as {
                      ok?: boolean
                      code?: string
                      preview?: string
                      phone?: string | null
                      sent?: boolean
                      error?: string
                    }
                    if (!response.ok) {
                      throw new Error(
                        payload.error ||
                          (response.status === 404
                            ? 'El servicio de WhatsApp no esta disponible en este entorno.'
                            : 'No se pudo preparar WhatsApp.')
                      )
                    }
                    return {
                      ok: Boolean(payload.ok),
                      code: payload.code || '',
                      preview: payload.preview || '',
                      phone: payload.phone ?? null,
                      sent: Boolean(payload.sent) || payload.code === 'sent',
                    }
                  }}
                />
              </div>
            )}
          </section>

          <GuideReportBody
            executiveReport={selected.executive_report}
            summary={selected.summary}
            agentInferences={selected.agent_inferences}
            learning={selected.learning}
            intention={selected.intention}
            reflectionQuestion={selected.reflection_question}
          />

          {workspaceOps.length > 0 ? (
            <section className="space-y-3" aria-label="Acciones preparadas por Shaman">
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight">Acciones preparadas por Shaman</h2>
                <p className="text-sm text-muted-foreground">
                  Correos y eventos listos para revisar, editar, aprobar o descartar. No se envian solos.
                </p>
              </div>
              <ul className="space-y-2">
                {workspaceOps.map((item) => (
                  <li key={item.id}>
                    <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {item.status === 'confirmed'
                        ? 'Enviado'
                        : item.status === 'cancelled'
                          ? 'Descartado'
                          : item.status === 'expired'
                            ? 'Expiro'
                            : 'Pendiente'}
                    </p>
                    <AssistantProposalCard
                      proposal={item}
                      status={
                        item.status === 'confirmed'
                          ? 'confirmed'
                          : item.status === 'cancelled'
                            ? 'cancelled'
                            : 'pending'
                      }
                      onUpdated={(next) =>
                        setWorkspaceOps((prev) =>
                          prev.map((row) => (row.id === next.id ? { ...row, ...next } : row))
                        )
                      }
                      onResolved={(status) =>
                        setWorkspaceOps((prev) =>
                          prev.map((row) => (row.id === item.id ? { ...row, status } : row))
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {pendingAnalysis ? (
            <section className="space-y-3" aria-label="Pendiente de aprobar">
              <div className="space-y-1">
                <h2 className="text-base font-semibold tracking-tight">Pendiente de aprobar</h2>
                <p className="text-sm text-muted-foreground">
                  Revisa y confirma antes de dejarlo en el tablero.
                </p>
              </div>
              <ActionDraftList
                result={pendingAnalysis}
                createdBy={currentUser?.id ?? null}
                onCreated={(draft, created) => markDraftCreated(draft.title, created.id)}
              />
            </section>
          ) : null}

          {selectedWork.length > 0 ? <CreatedWorkList items={selectedWork} /> : null}

          <section className="space-y-3" aria-label="Conversacion">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
                <h2 className="text-base font-semibold tracking-tight">Conversacion</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Detalle de la sesion; el informe de arriba es la lectura principal.
              </p>
            </div>

            {loadingMessages ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Cargando mensajes…
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[1.5rem] bg-muted/30 px-5 py-10 text-center">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-background text-primary shadow-sm ring-1 ring-border/60">
                  <Mic className="h-6 w-6" aria-hidden />
                </span>
                <div className="max-w-sm space-y-1">
                  <p className="text-sm font-semibold">Esta sesion fue mas de voz</p>
                  <p className="text-sm leading-5 text-muted-foreground">
                    No hay chat de texto guardado, pero el reporte de arriba guarda el resultado.
                    Puedes seguir desde ahi cuando quieras.
                  </p>
                </div>
                <Button
                  type="button"
                  className="mt-1 gap-2 rounded-full"
                  disabled={resuming || !currentUser?.id}
                  onClick={() => void resumeConversation(selected)}
                >
                  {resuming ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden />
                  )}
                  Seguir conversando
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-[1.5rem] bg-muted/25 p-3 sm:p-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex gap-2',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        'max-w-[85%] whitespace-pre-wrap px-3.5 py-2.5 text-sm leading-5',
                        message.role === 'user'
                          ? 'rounded-2xl rounded-br-md bg-primary text-primary-foreground'
                          : 'rounded-2xl rounded-bl-md bg-background text-foreground shadow-sm ring-1 ring-border/50'
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                <div className="pt-1 text-center">
                  <Button
                    type="button"
                    className="gap-2 rounded-full"
                    disabled={resuming || !currentUser?.id}
                    onClick={() => void resumeConversation(selected)}
                  >
                    {resuming ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Play className="h-4 w-4" aria-hidden />
                    )}
                    Seguir conversando
                  </Button>
                </div>
              </div>
            )}
          </section>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden">
            <Button
              type="button"
              size="lg"
              className="h-11 w-full gap-2 rounded-full"
              disabled={resuming || !currentUser?.id}
              onClick={() => void resumeConversation(selected)}
            >
              {resuming ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Play className="h-4 w-4" aria-hidden />
              )}
              Seguir conversando
            </Button>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[1.75rem] bg-muted/25 px-6 py-16 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" aria-hidden />
          </span>
          <div className="max-w-sm space-y-1.5">
            <p className="text-base font-semibold">Tu historial empieza aqui</p>
            <p className="text-sm leading-5 text-muted-foreground">
              Habla 15 minutos con Guia. Al terminar veras el reporte y lo que se creo en el tablero.
            </p>
          </div>
          <Button asChild className="gap-2 rounded-full">
            <Link to={ROUTES.AI_ASSIST}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Empezar con Guia
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => {
            const work = createdWorkItems(entry)
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => openEntry(entry.id)}
                className="group flex w-full items-start gap-3 rounded-[1.35rem] bg-card p-3.5 text-left ring-1 ring-border/60 transition hover:bg-muted/30 hover:ring-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold tracking-tight">
                        {entry.topic || 'Sesion con Guia'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatFriendlyDate(entry.created_at)}
                      </p>
                    </div>
                    <ArrowRight
                      className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-primary"
                      aria-hidden
                    />
                  </div>
                  <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                    {previewText(entry)}
                  </p>
                  {work.length > 0 ? (
                    <span className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-medium text-primary">
                      <ClipboardList className="h-3 w-3" aria-hidden />
                      {work.length === 1
                        ? '1 elemento en tablero'
                        : `${work.length} en tablero`}
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
