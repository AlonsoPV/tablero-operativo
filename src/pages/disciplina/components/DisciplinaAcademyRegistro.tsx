import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GraduationCap, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { ACADEMY_MODULES, ACADEMY_TOTAL_MODULES, useAcademyProgress } from '@/features/academy'
import {
  academyGlobalProgressPercent,
  countAcademyModuleBuckets,
} from '@/features/academy/utils/academyProgress'

/**
 * Bloque compacto de Academia en Disciplina: progreso visual + conteos; el detalle vive en /academia.
 */
export function DisciplinaAcademyRegistro() {
  const { completedCount, isLoading, isSaving, error, progress, isModuleUnlocked } = useAcademyProgress()
  const percent = academyGlobalProgressPercent(completedCount, ACADEMY_TOTAL_MODULES)

  const buckets = useMemo(
    () => countAcademyModuleBuckets(progress, ACADEMY_MODULES, isModuleUnlocked),
    [progress, isModuleUnlocked]
  )

  return (
    <div
      id="disciplina-academy-card"
      className="disciplina-academy-card flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
    >
      <div className="border-b border-border/50 bg-muted/20 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 sm:h-9 sm:w-9">
              <GraduationCap className="h-4 w-4 text-primary sm:h-5 sm:w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Formación</p>
              <h3 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">Academia O2C</h3>
            </div>
          </div>
          {isSaving ? <span className="shrink-0 text-[10px] text-muted-foreground">Guardando…</span> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Cargando progreso…
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
                  {percent}%
                </span>
                <span className="text-xs text-muted-foreground sm:text-sm">
                  <span className="font-medium text-foreground">{completedCount}</span>/{ACADEMY_TOTAL_MODULES}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted sm:h-2.5">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>

            <Link
              to={ROUTES.ACADEMIA}
              className="group block rounded-lg border border-border/60 bg-background/80 px-2.5 py-2.5 transition-colors hover:border-primary/30 hover:bg-background sm:rounded-xl sm:px-3 sm:py-3"
            >
              <div className="grid grid-cols-3 gap-1 text-center sm:gap-2">
                <div>
                  <p className="text-base font-semibold tabular-nums text-foreground sm:text-lg">{buckets.pendientes}</p>
                  <p className="text-[10px] text-muted-foreground">Pend.</p>
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums text-amber-700 dark:text-amber-400 sm:text-lg">
                    {buckets.enProgreso}
                  </p>
                  <p className="text-[10px] text-muted-foreground">En curso</p>
                </div>
                <div>
                  <p className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-lg">
                    {buckets.completados}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Listos</p>
                </div>
              </div>
              <p className="mt-1.5 flex items-center justify-center gap-0.5 text-[10px] font-medium text-primary sm:mt-2 sm:text-[11px] group-hover:underline">
                Ver Academia
                <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" aria-hidden />
              </p>
            </Link>

            <Button className="h-9 w-full rounded-lg text-sm font-medium shadow-sm sm:h-10 sm:rounded-xl" asChild>
              <Link to={ROUTES.ACADEMIA}>Continuar formación</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
