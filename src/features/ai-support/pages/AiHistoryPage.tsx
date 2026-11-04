import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Compass,
  History,
  Lightbulb,
  Loader2,
  MessageCircle,
  Mic,
  Play,
  Sparkles,
  Target,
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
import { pendingWorkItems, pendingWorkToAnalysis } from '@/features/guide/pendingWork'

function createdWorkItems(entry: GuideJournalEntry | null | undefined): GuideCreatedWork[] {
  return (entry?.created_work ?? []).filter((item) => item.title && !item.error && !item.pending && item.id)
}

function previewText(entry: GuideJournalEntry) {
  if (entry.executive_report?.trim()) {
    return entry.executive_report.split('\n').filter(Boolean).slice(0, 2).join(' ')
  }
  return entry.summary?.trim() || entry.agent_inferences?.trim() || 'Sesion con Guia lista para revisar.'
}

function formatFriendlyDate(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
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

type ReportBlock = { title: string | null; body: string }

function parseReportBlocks(raw: string): ReportBlock[] {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const blocks: ReportBlock[] = []
  let current: ReportBlock | null = null

  const isHeading = (line: string) => {
    if (line.length > 48) return false
    if (/^REPORTE\b/i.test(line)) return true
    if (/^[A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s\-—–:]{2,}$/.test(line) && /[A-ZÁÉÍÓÚÑ]/.test(line)) {
      return true
    }
    return false
  }

  const prettyHeading = (line: string) =>
    line
      .replace(/^REPORTE EJECUTIVO\s*[—–-]?\s*GUIA\s*/i, 'Reporte ejecutivo')
      .replace(/\bSITUACION\b/i, 'Situacion')
      .replace(/\bDIAGNOSTICO\b/i, 'Diagnostico')
      .replace(/\bDECISIONES\b/i, 'Decisiones')
      .replace(/\bPARA APROBAR\b/i, 'Para aprobar')
      .replace(/\bTRABAJO CREADO\b/i, 'Trabajo creado')
      .replace(/\bPRIORIDADES\b/i, 'Prioridades')
      .replace(/\bACCIONES\b/i, 'Acciones')
      .replace(/\bRIESGOS\b/i, 'Riesgos')
      .replace(/\bPROXIMOS PASOS\b/i, 'Proximos pasos')
      .replace(/\bCIERRE\b/i, 'Cierre')

  for (const line of lines) {
    if (isHeading(line)) {
      if (current && current.body.trim()) blocks.push(current)
      current = { title: prettyHeading(line), body: '' }
      continue
    }
    if (!current) current = { title: null, body: '' }
    current.body = current.body ? `${current.body}\n${line}` : line
  }
  if (current && (current.title || current.body.trim())) blocks.push(current)
  return blocks.length > 0 ? blocks : [{ title: null, body: raw.trim() }]
}

function CreatedWorkList({ items }: { items: GuideCreatedWork[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2.5">
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
        Quedo en tu tablero
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={`${item.kind}-${item.id || item.title}`}
            className="flex items-start gap-2.5 rounded-2xl bg-muted/40 px-3 py-2.5"
          >
            <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-border/60">
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
    </div>
  )
}

function InsightChip({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Lightbulb
  label: string
  children: string
}) {
  return (
    <div className="rounded-2xl bg-muted/35 px-3.5 py-3">
      <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
        {label}
      </p>
      <p className="text-sm leading-5 text-foreground">{children}</p>
    </div>
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

  const reportBlocks = useMemo(() => {
    if (!selected?.executive_report?.trim()) return null
    return parseReportBlocks(selected.executive_report)
  }, [selected?.executive_report])

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
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-24 sm:pb-8">
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

          <section className="relative overflow-hidden rounded-[1.75rem] bg-[linear-gradient(160deg,hsl(var(--primary)/0.12)_0%,hsl(var(--muted)/0.45)_42%,hsl(var(--card))_100%)] p-5 sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-2xl" aria-hidden />
            <div className="relative space-y-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatFriendlyDate(selected.created_at)}
                  </p>
                  <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {selected.topic || 'Sesion con Guia'}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {messages.length > 0
                      ? `${messages.length} mensajes guardados`
                      : 'Sesion por voz o sin chat de texto'}
                    {selectedWork.length > 0 ? ` · ${selectedWork.length} en tablero` : ''}
                    {selectedPending.length > 0 ? ` · ${selectedPending.length} por aprobar` : ''}
                  </p>
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
                <p className="px-1 text-xs text-muted-foreground sm:px-0">
                  Abre 15 minutos mas con este contexto.
                </p>
              </div>
            </div>
          </section>

          {(reportBlocks || selected.summary) && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-primary" aria-hidden />
                <h2 className="text-sm font-semibold tracking-tight">Lo que salio de la sesion</h2>
              </div>

              {reportBlocks ? (
                <div className="space-y-4">
                  {reportBlocks
                    .filter((block) => !/para aprobar/i.test(block.title || ''))
                    .map((block, index) => (
                    <div key={`${block.title ?? 'body'}-${index}`} className="space-y-1.5">
                      {block.title ? (
                        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-primary/80">
                          {block.title}
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-[15px] leading-6 text-foreground/90">
                        {block.body}
                      </p>
                    </div>
                  ))}
                </div>
              ) : selected.summary ? (
                <p className="text-[15px] leading-6 text-foreground/90">{selected.summary}</p>
              ) : null}
            </section>
          )}

          {pendingAnalysis ? (
            <ActionDraftList
              result={pendingAnalysis}
              createdBy={currentUser?.id ?? null}
              onCreated={(draft, created) => markDraftCreated(draft.title, created.id)}
            />
          ) : null}

          {selectedWork.length > 0 ? <CreatedWorkList items={selectedWork} /> : null}

          {(selected.agent_inferences ||
            selected.learning ||
            selected.intention ||
            selected.reflection_question) && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight">Notas de Guia</h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {selected.agent_inferences ? (
                  <InsightChip icon={Lightbulb} label="Interpretacion">
                    {selected.agent_inferences}
                  </InsightChip>
                ) : null}
                {selected.learning ? (
                  <InsightChip icon={Sparkles} label="Aprendizaje">
                    {selected.learning}
                  </InsightChip>
                ) : null}
                {selected.intention ? (
                  <InsightChip icon={Target} label="Intencion">
                    {selected.intention}
                  </InsightChip>
                ) : null}
                {selected.reflection_question ? (
                  <InsightChip icon={MessageCircle} label="Para pensar">
                    {selected.reflection_question}
                  </InsightChip>
                ) : null}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold tracking-tight">Conversacion</h2>
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
