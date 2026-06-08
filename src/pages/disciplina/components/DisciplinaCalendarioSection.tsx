import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlarmClock,
  CalendarDays,
  ChevronRight,
  StickyNote,
} from 'lucide-react'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { dateOnlyCDMX } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import type { CalendarNote } from '@/services/calendarNotes.service'
import type { CalendarReminder } from '@/services/calendarReminders.service'

type CalendarioTab = 'recordatorios' | 'minutas'

export interface DisciplinaCalendarioSectionProps {
  reminders: CalendarReminder[]
  notes: CalendarNote[]
  remindersLoading: boolean
  notesLoading: boolean
  remindersError: boolean
  notesError: boolean
  embedded?: boolean
}

function formatWhenShort(isoOrDate: string, mode: 'datetime' | 'date'): string {
  const d = mode === 'date' ? new Date(`${isoOrDate}T12:00:00`) : new Date(isoOrDate)
  return d.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    ...(mode === 'datetime' ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

function calendarDetailPath(date: string, type: 'recordatorios' | 'minutas'): string {
  return `${ROUTES.CALENDARIO}?fecha=${encodeURIComponent(date)}&tipo=${type}`
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="space-y-1.5" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="h-12 animate-pulse rounded-lg border border-border/40 bg-muted/30" />
      ))}
    </ul>
  )
}

function EmptyHint({ message, calendarTipo }: { message: string; calendarTipo: CalendarioTab }) {
  const tipo = calendarTipo === 'recordatorios' ? 'recordatorios' : 'minutas'
  return (
    <div className="rounded-lg border border-dashed border-border/50 bg-background/60 px-3 py-6 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      <Button variant="link" size="sm" className="mt-2 h-auto p-0 text-xs font-medium" asChild>
        <Link to={`${ROUTES.CALENDARIO}?tipo=${tipo}`}>Ir al calendario</Link>
      </Button>
    </div>
  )
}

function CalendarListRow({
  to,
  title,
  meta,
  completed,
}: {
  to: string
  title: string
  meta: string
  completed?: boolean
}) {
  return (
    <li>
      <Link
        to={to}
        className={cn(
          'group flex min-h-11 items-center gap-2.5 rounded-lg border border-border/50 bg-background px-2.5 py-2',
          'transition-colors hover:border-primary/25 hover:bg-muted/25 active:bg-muted/40'
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
            {title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="truncate">{meta}</span>
            {completed ? (
              <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">
                Cerrado
              </span>
            ) : null}
          </p>
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden
        />
      </Link>
    </li>
  )
}

function RecordatoriosList({
  reminders,
  isLoading,
  isError,
  className,
}: {
  reminders: CalendarReminder[]
  isLoading: boolean
  isError: boolean
  className?: string
}) {
  return (
    <div id="disciplina-calendario-recordatorios" className={cn('disciplina-calendario-recordatorios', className)}>
      <div className="mb-2 flex items-center gap-2">
        <AlarmClock className="h-4 w-4 text-amber-600" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Recordatorios</h3>
        {!isLoading && !isError ? (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {reminders.length}
          </span>
        ) : null}
      </div>
      {isError ? (
        <p className="text-xs text-destructive">No se pudieron cargar.</p>
      ) : isLoading ? (
        <ListSkeleton />
      ) : reminders.length === 0 ? (
        <EmptyHint message="Sin recordatorios recientes." calendarTipo="recordatorios" />
      ) : (
        <ul className="max-h-[min(18rem,50vh)] space-y-1.5 overflow-y-auto overscroll-y-contain pr-0.5">
          {reminders.map((reminder) => (
            <CalendarListRow
              key={reminder.id}
              to={calendarDetailPath(dateOnlyCDMX(reminder.fecha_limite), 'recordatorios')}
              title={reminder.titulo}
              meta={formatWhenShort(reminder.fecha_limite, 'datetime')}
              completed={Boolean(reminder.completed_at)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function MinutasList({
  notes,
  isLoading,
  isError,
  className,
}: {
  notes: CalendarNote[]
  isLoading: boolean
  isError: boolean
  className?: string
}) {
  return (
    <div id="disciplina-calendario-minutas" className={cn('disciplina-calendario-minutas', className)}>
      <div className="mb-2 flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-emerald-600" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Minutas</h3>
        {!isLoading && !isError ? (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {notes.length}
          </span>
        ) : null}
      </div>
      {isError ? (
        <p className="text-xs text-destructive">No se pudieron cargar.</p>
      ) : isLoading ? (
        <ListSkeleton />
      ) : notes.length === 0 ? (
        <EmptyHint message="Sin minutas recientes." calendarTipo="minutas" />
      ) : (
        <ul className="max-h-[min(18rem,50vh)] space-y-1.5 overflow-y-auto overscroll-y-contain pr-0.5">
          {notes.map((note) => (
            <CalendarListRow
              key={note.id}
              to={calendarDetailPath(note.fecha, 'minutas')}
              title={note.titulo}
              meta={formatWhenShort(note.fecha, 'date')}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function MobileCalendarioTabs({
  tab,
  onTabChange,
  remindersCount,
  notesCount,
}: {
  tab: CalendarioTab
  onTabChange: (t: CalendarioTab) => void
  remindersCount: number
  notesCount: number
}) {
  const tabs: { id: CalendarioTab; label: string; shortLabel: string; count: number }[] = [
    { id: 'recordatorios', label: 'Recordatorios', shortLabel: 'Record.', count: remindersCount },
    { id: 'minutas', label: 'Minutas', shortLabel: 'Minutas', count: notesCount },
  ]

  return (
    <div
      id="disciplina-calendario-tabs"
      className="disciplina-calendario-tabs grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-muted/25 p-1 md:hidden"
      role="tablist"
      aria-label="Tipo de elemento del calendario"
    >
      {tabs.map(({ id, label, shortLabel, count }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          aria-label={label}
          className={cn(
            'flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
            tab === id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => onTabChange(id)}
        >
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
          <span
            className={cn(
              'rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums',
              tab === id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}
          >
            {count}
          </span>
        </button>
      ))}
    </div>
  )
}

function DisciplinaCalendarioContent({
  reminders,
  notes,
  remindersLoading,
  notesLoading,
  remindersError,
  notesError,
}: DisciplinaCalendarioSectionProps) {
  const [mobileTab, setMobileTab] = useState<CalendarioTab>('recordatorios')

  return (
    <div className="space-y-3 sm:space-y-4">
      <MobileCalendarioTabs
        tab={mobileTab}
        onTabChange={setMobileTab}
        remindersCount={reminders.length}
        notesCount={notes.length}
      />

      <div className="md:hidden">
        {mobileTab === 'recordatorios' ? (
          <RecordatoriosList
            reminders={reminders}
            isLoading={remindersLoading}
            isError={remindersError}
            className="rounded-lg border border-border/60 bg-muted/10 p-2.5"
          />
        ) : (
          <MinutasList
            notes={notes}
            isLoading={notesLoading}
            isError={notesError}
            className="rounded-lg border border-border/60 bg-muted/10 p-2.5"
          />
        )}
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-2">
        <RecordatoriosList
          reminders={reminders}
          isLoading={remindersLoading}
          isError={remindersError}
          className="rounded-lg border border-border/60 bg-muted/10 p-3"
        />
        <MinutasList
          notes={notes}
          isLoading={notesLoading}
          isError={notesError}
          className="rounded-lg border border-border/60 bg-muted/10 p-3"
        />
      </div>
    </div>
  )
}

export function DisciplinaCalendarioSection({
  reminders,
  notes,
  remindersLoading,
  notesLoading,
  remindersError,
  notesError,
  embedded = false,
}: DisciplinaCalendarioSectionProps) {
  if (embedded) {
    return (
      <DisciplinaCalendarioContent
        reminders={reminders}
        notes={notes}
        remindersLoading={remindersLoading}
        notesLoading={notesLoading}
        remindersError={remindersError}
        notesError={notesError}
      />
    )
  }

  return (
    <section id="disciplina-calendario" aria-labelledby="disciplina-calendario-heading">
      <SectionCard>
        <SectionCardHeader
          className="px-3 py-3 sm:px-4 sm:py-4 md:px-6"
          titleId="disciplina-calendario-heading"
          eyebrow="Calendario"
          title="Recordatorios y minutas"
          subtitle="Acceso rápido a lo reciente."
          icon={CalendarDays}
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full text-xs sm:w-auto sm:text-sm"
              asChild
            >
              <Link to={ROUTES.CALENDARIO}>Abrir calendario</Link>
            </Button>
          }
        />
        <SectionCardBody className="space-y-3 p-3 sm:space-y-4 sm:p-4 md:p-6">
          <DisciplinaCalendarioContent
            reminders={reminders}
            notes={notes}
            remindersLoading={remindersLoading}
            notesLoading={notesLoading}
            remindersError={remindersError}
            notesError={notesError}
          />
        </SectionCardBody>
      </SectionCard>
    </section>
  )
}
