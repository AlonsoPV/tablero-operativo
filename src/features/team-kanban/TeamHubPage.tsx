import { Link } from 'react-router-dom'
import { ArrowUpRight, BarChart3, Columns3, Sparkles } from 'lucide-react'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'

const cards = [
  {
    title: 'Dashboard por Equipos',
    description: 'Mide carga de trabajo, cumplimiento, bloqueos y desempeño del área activa.',
    cta: 'Ver dashboard',
    to: ROUTES.DASHBOARD_TEAMS,
    icon: BarChart3,
    accent: 'from-sky-500/15 via-sky-500/5 to-transparent',
    iconClass: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
    ringClass: 'group-hover:ring-sky-500/25',
    chips: ['Carga', 'Cumplimiento', 'Alertas'],
  },
  {
    title: 'Kanban por Equipos',
    description: 'Gestiona acciones, responsables, prioridades y avance operativo de cada equipo.',
    cta: 'Abrir kanban',
    to: ROUTES.TEAM_KANBAN_BOARD,
    icon: Columns3,
    accent: 'from-primary/20 via-primary/5 to-transparent',
    iconClass: 'bg-primary/12 text-primary',
    ringClass: 'group-hover:ring-primary/25',
    chips: ['Estados', 'Responsables', 'Prioridades'],
  },
] as const

export function TeamHubPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-3 py-6 sm:gap-8 sm:px-6 sm:py-8">
      <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 p-5 shadow-sm sm:p-7">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl"
          aria-hidden
        />

        <div className="relative max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Equipos
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Gestión por Equipos
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Consulta el desempeño de tus equipos o gestiona sus acciones desde un mismo lugar.
            Elige la vista que necesitas según tu rol operativo.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'group relative block overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition duration-200',
                'hover:-translate-y-0.5 hover:border-border hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                item.ringClass,
                'hover:ring-2'
              )}
            >
              <div
                className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80', item.accent)}
                aria-hidden
              />

              <div className="relative flex h-full min-h-[210px] flex-col justify-between gap-5 p-5 sm:min-h-[230px] sm:p-6">
                <div className="space-y-4">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', item.iconClass)}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                      {item.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {item.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-border/60 bg-background/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>

                <span className="inline-flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/90 px-3 py-2.5 text-sm font-semibold text-foreground transition-colors group-hover:border-primary/30 group-hover:bg-primary/[0.04] group-hover:text-primary sm:w-fit sm:min-w-[10rem]">
                  {item.cta}
                  <ArrowUpRight
                    className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden
                  />
                </span>
              </div>
            </Link>
          )
        })}
      </section>
    </main>
  )
}
