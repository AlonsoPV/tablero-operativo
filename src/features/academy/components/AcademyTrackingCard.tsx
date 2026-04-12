import { Link } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ROUTES } from '@/constants'
import { ACADEMY_TOTAL_MODULES } from '../data/modules'
import { useAcademyProgress } from '../hooks/useAcademyProgress'
import { academyGlobalProgressPercent } from '../utils/academyProgress'

/**
 * Resumen compacto del progreso en Academia O2C para páginas de seguimiento (Disciplina, Reportes, etc.).
 */
export function AcademyTrackingCard() {
  const { completedCount, isLoading, error } = useAcademyProgress()
  const percent = academyGlobalProgressPercent(completedCount, ACADEMY_TOTAL_MODULES)

  return (
    <Card className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      <CardHeader className="border-b border-border/50 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Formación O2C
              </p>
              <CardTitle className="text-base font-semibold text-foreground">Seguimiento Academia O2C</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Avance de la ruta formativa (módulos y quizzes). Refuerza disciplina operativa y lectura de reportes
                en contexto O2C.
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 sm:mt-0.5" asChild>
            <Link to={ROUTES.ACADEMIA}>Ir a Academia</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-5 pb-5 pt-4 sm:px-6">
        {error ? (
          <p className="text-sm text-destructive">No se pudo cargar el progreso: {error}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando progreso de la academia…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{completedCount}</span> de {ACADEMY_TOTAL_MODULES}{' '}
                módulos completados
              </span>
              <span className="text-muted-foreground">{percent}% de avance</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
