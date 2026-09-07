import { useDeferredValue, useMemo, useState } from 'react'
import {
  AlertCircle,
  Lightbulb,
  Plus,
  Search,
  Sparkles,
  Target,
  ThumbsUp,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard, SectionCardBody } from '@/components/SectionCard'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useAreas } from '@/features/catalogs/hooks/useAreas'
import { ChallengeCard } from '../components/ChallengeCard'
import { ChallengeFormDialog } from '../components/ChallengeFormDialog'
import { AmbientOrbs, AnimatedNumber, StaggerItem } from '../components/ChallengeMotion'
import { useChallenges } from '../hooks/useChallenges'
import type { ChallengeListItem } from '../types'

const filters: Array<{ key: 'all' | 'active' | 'finished' | 'mine'; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Activos' },
  { key: 'finished', label: 'Finalizados' },
  { key: 'mine', label: 'Mis Challenges' },
]

function filterChallenges(
  challenges: ChallengeListItem[],
  status: 'all' | 'active' | 'finished' | 'mine',
  search: string,
  currentUserId?: string | null
) {
  let list = challenges

  if (status === 'active') list = list.filter((item) => item.effective_status === 'active')
  else if (status === 'finished') list = list.filter((item) => item.effective_status === 'finished')
  else if (status === 'mine' && currentUserId) list = list.filter((item) => item.created_by === currentUserId)

  const term = search.trim().toLowerCase()
  if (term) {
    list = list.filter((item) => {
      const haystack = [
        item.title,
        item.context,
        item.question,
        item.description,
        item.success_criteria,
        item.other_impact,
        item.strategic_pillar?.nombre,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(term)
    })
  }

  return [...list].sort((a, b) => {
    const activeRank = (item: ChallengeListItem) => (item.effective_status === 'active' ? 0 : 1)
    const rankDiff = activeRank(a) - activeRank(b)
    if (rankDiff !== 0) return rankDiff
    if (b.metrics.votes !== a.metrics.votes) return b.metrics.votes - a.metrics.votes
    return b.created_at.localeCompare(a.created_at)
  })
}

export function ChallengesPage() {
  const { data: currentUser } = useCurrentUser()
  const { data: users = [] } = useUsers({ activo: true })
  const { data: areas = [] } = useAreas({ activo: true })
  const [status, setStatus] = useState<'all' | 'active' | 'finished' | 'mine'>('active')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [dialogOpen, setDialogOpen] = useState(false)
  const { data: challenges = [], isLoading, isError, error, refetch } = useChallenges(
    { status: 'all' },
    currentUser?.id
  )

  const userNames = useMemo(() => {
    const map: Record<string, string> = {}
    if (currentUser?.id) map[currentUser.id] = currentUser.nombre
    for (const user of users) map[user.id] = user.nombre
    return map
  }, [currentUser?.id, currentUser?.nombre, users])

  const areaNames = useMemo(() => Object.fromEntries(areas.map((area) => [area.id, area.nombre])), [areas])

  const counts = useMemo(
    () => ({
      all: challenges.length,
      active: challenges.filter((item) => item.effective_status === 'active').length,
      finished: challenges.filter((item) => item.effective_status === 'finished').length,
      mine: currentUser?.id
        ? challenges.filter((item) => item.created_by === currentUser.id).length
        : 0,
    }),
    [challenges, currentUser?.id]
  )

  const filtered = useMemo(
    () => filterChallenges(challenges, status, deferredSearch, currentUser?.id),
    [challenges, status, deferredSearch, currentUser?.id]
  )

  const activeChallenges = useMemo(
    () => challenges.filter((item) => item.effective_status === 'active'),
    [challenges]
  )

  const stats = useMemo(
    () => ({
      active: activeChallenges.length,
      support: activeChallenges.reduce((sum, item) => sum + item.metrics.votes, 0),
      participants: activeChallenges.reduce((sum, item) => sum + item.metrics.participants, 0),
    }),
    [activeChallenges]
  )

  const emptyCopy =
    status === 'mine'
      ? 'Aún no has propuesto ningún Challenge.'
      : status === 'active'
        ? 'No hay Challenges activos en este momento.'
        : status === 'finished'
          ? 'Aún no hay Challenges finalizados.'
          : 'No hay Challenges que coincidan con tu búsqueda.'

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 overflow-x-hidden px-3 py-4 sm:px-6 sm:py-5">
      <header className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-primary/[0.08] shadow-sm animate-challenge-fade-up motion-reduce:animate-none">
        <AmbientOrbs />
        <div className="relative flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5 animate-challenge-pulse-soft motion-reduce:animate-none" aria-hidden />
              Comunidad e innovación
            </div>
            <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.85rem]">
              Challenges
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Retos con contexto estratégico: apoya los problemas que importan, comenta y ayuda a convertirlos en mejora.
            </p>
          </div>
          <Button
            type="button"
            className="h-11 shrink-0 gap-1.5 self-start shadow-md shadow-primary/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 lg:self-center"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Proponer Challenge
          </Button>
        </div>

        <div className="relative grid border-t border-border/50 bg-background/40 backdrop-blur-sm sm:grid-cols-3">
          <StatPill icon={Target} label="Activos" value={stats.active} delay={0} />
          <StatPill icon={ThumbsUp} label="Apoyos en activos" value={stats.support} delay={80} />
          <StatPill icon={Users} label="Participantes" value={stats.participants} delay={160} />
        </div>
      </header>

      <section className="sticky top-0 z-10 -mx-3 space-y-3 border-b border-border/40 bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setStatus(item.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition duration-200',
                  status === item.key
                    ? 'scale-[1.03] border-primary/40 bg-primary/10 text-primary shadow-sm shadow-primary/10'
                    : 'border-border/70 bg-background text-muted-foreground hover:border-border hover:text-foreground'
                )}
              >
                {item.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums transition',
                    status === item.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {counts[item.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título o problema..."
              className="h-9 rounded-full border-border/70 bg-background pl-9 text-sm transition focus-visible:ring-primary/30"
              aria-label="Buscar challenges"
            />
          </div>
        </div>

        {!isLoading && !isError ? (
          <p className="text-xs text-muted-foreground transition-opacity">
            {filtered.length === 0
              ? 'Sin resultados'
              : `${filtered.length} challenge${filtered.length === 1 ? '' : 's'}${deferredSearch.trim() ? ' encontrados' : ''}`}
            {status === 'active' && filtered.length > 0 ? ' · Ordenados por relevancia y apoyo' : null}
          </p>
        ) : null}
      </section>

      {isError ? (
        <SectionCard>
          <SectionCardBody className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
            <p className="text-sm font-semibold">No se pudieron cargar los Challenges.</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Revisa permisos o conexión.'}
            </p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </SectionCardBody>
        </SectionCard>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-56 animate-pulse rounded-xl bg-muted/50"
              style={{ animationDelay: `${item * 80}ms` }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <SectionCard className="animate-challenge-fade-up motion-reduce:animate-none">
          <SectionCardBody className="flex min-h-72 flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Lightbulb className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">{emptyCopy}</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {deferredSearch.trim()
                  ? 'Prueba con otras palabras o limpia la búsqueda.'
                  : 'Propón un reto concreto: problema, impacto esperado y quién debería participar.'}
              </p>
            </div>
            {deferredSearch.trim() ? (
              <Button type="button" variant="outline" onClick={() => setSearch('')}>
                Limpiar búsqueda
              </Button>
            ) : (
              <Button type="button" onClick={() => setDialogOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" aria-hidden />
                Proponer Challenge
              </Button>
            )}
          </SectionCardBody>
        </SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((challenge, index) => (
            <StaggerItem key={challenge.id} index={index}>
              <ChallengeCard
                challenge={challenge}
                creatorName={userNames[challenge.created_by] ?? 'Usuario'}
                areaName={challenge.area_id ? areaNames[challenge.area_id] : null}
              />
            </StaggerItem>
          ))}
        </div>
      )}

      <ChallengeFormDialog
        open={dialogOpen}
        currentUserId={currentUser?.id}
        areas={areas}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

function StatPill({
  icon: Icon,
  label,
  value,
  delay = 0,
}: {
  icon: typeof Target
  label: string
  value: number
  delay?: number
}) {
  return (
    <div
      className="flex items-center gap-3 border-border/40 px-4 py-3.5 transition hover:bg-primary/[0.03] sm:border-r last:sm:border-r-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10 transition group-hover:scale-105">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold tabular-nums leading-none text-foreground">
          <AnimatedNumber value={value} />
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
