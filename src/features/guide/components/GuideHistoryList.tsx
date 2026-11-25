import { ChevronRight, ClipboardList } from 'lucide-react'
import { recordedWorkItems } from '@/features/guide/pendingWork'
import { reportPreviewText, reportStatusLabel } from '@/features/guide/reportPreviewText'
import type { GuideJournalEntry } from '@/features/guide/types'
import { cn } from '@/lib/utils'

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

function historyStamp(iso: string) {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return { key: '', label: '—', caption: '', time: '' }
  const key = cdmxDateKey(iso)
  const todayKey = cdmxDateKey(new Date().toISOString())
  const yesterdayKey = cdmxDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  const time = date.toLocaleTimeString('es-MX', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    minute: '2-digit',
  })
  if (key && key === todayKey) return { key, label: 'Hoy', caption: '', time }
  if (key && key === yesterdayKey) return { key, label: 'Ayer', caption: '', time }
  const day = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: 'numeric',
  }).format(date)
  const month = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    month: 'short',
  })
    .format(date)
    .replace('.', '')
  return { key, label: day, caption: month, time }
}

export function GuideHistoryList({
  entries,
  onOpen,
}: {
  entries: GuideJournalEntry[]
  onOpen: (entry: GuideJournalEntry) => void
}) {
  if (entries.length === 0) return null

  return (
    <div className="overflow-hidden rounded-[1.75rem] bg-card shadow-[0_16px_40px_-28px_hsl(var(--foreground)/0.45)] ring-1 ring-border/60">
      {entries.map((entry, index) => {
        const work = recordedWorkItems(entry.created_work)
        const stamp = historyStamp(entry.created_at)
        const previousKey = index > 0 ? historyStamp(entries[index - 1].created_at).key : ''
        const startsDay = stamp.key !== previousKey
        const status =
          reportStatusLabel(entry.report_status) && !entry.executive_report
            ? reportStatusLabel(entry.report_status)
            : null
        return (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry)}
            className={cn(
              'group relative flex w-full items-center gap-3 px-3 py-3.5 text-left transition active:bg-muted/70 sm:px-3.5',
              'hover:bg-muted/35 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              index > 0 &&
                'before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:h-px before:bg-border/70 sm:before:left-[4.6rem]'
            )}
          >
            {startsDay ? (
              <span
                className="inline-flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[1.05rem] bg-foreground/[0.04] text-foreground ring-1 ring-border/70"
                aria-hidden
              >
                <span
                  className={cn(
                    'font-semibold leading-none tabular-nums',
                    stamp.caption ? 'text-[17px]' : 'text-[13px]'
                  )}
                >
                  {stamp.label}
                </span>
                {stamp.caption ? (
                  <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {stamp.caption}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/35" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                  {entry.topic || 'Sesion con Guia'}
                </span>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {stamp.time}
                </span>
              </span>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-muted-foreground">
                {reportPreviewText(entry)}
              </p>
              {status || work.length > 0 ? (
                <span className="mt-2 flex flex-wrap items-center gap-1.5">
                  {status ? (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {status}
                    </span>
                  ) : null}
                  {work.length > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      <ClipboardList className="h-3 w-3" aria-hidden />
                      {work.length === 1 ? '1 en tablero' : `${work.length} en tablero`}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden
            />
          </button>
        )
      })}
    </div>
  )
}
