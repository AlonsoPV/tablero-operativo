/**
 * Métricas de Disciplina (spec §5.4, §12).
 * DisciplinaCard: % cumplimiento, acciones sin evidencia, racha días verde, reincidencias.
 * TODO: cálculo automático de medicion_disciplina en BD (spec §16.8); mientras tanto se calcula desde acciones.
 */

import { useState } from 'react'
import { DisciplinaCard, useDisciplinaMetrics } from '@/features/metrics'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import { todayCDMX } from '@/lib/dateUtils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoHint } from '@/components/InfoHint'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { DisciplinaAcademyRegistro } from './components/DisciplinaAcademyRegistro'
import { DisciplinaAccionesCard } from './components/DisciplinaAccionesCard'

const DISCIPLINA_INFO =
  'Métricas de tu desempeño operativo: porcentaje de acciones cerradas con evidencia, acciones en estado Hecho/Verificado sin evidencia cargada, racha de días con cumplimiento ≥90% y reincidencias. Se calculan a partir de las acciones asignadas a tu usuario en la fecha seleccionada.'

export function DisciplinaPage() {
  const today = todayCDMX()
  const [fecha, setFecha] = useState(today)
  const { data: currentUser } = useCurrentUser()
  const { data: metrics, isLoading, isError } = useDisciplinaMetrics(currentUser?.id, fecha)

  const fechaLabel =
    fecha === today ? 'Hoy' : new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { dateStyle: 'medium' })

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Desempeño</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Métricas de disciplina</h1>
          <InfoHint text={DISCIPLINA_INFO} />
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Seguimiento de formación (Academia), acciones del día y métricas de cumplimiento (spec §5.4).
        </p>
      </header>

      <SectionCard>
        <SectionCardHeader title="Fecha de referencia" subtitle="Las métricas inferiores usan acciones de esta fecha." />
        <SectionCardBody>
          <div className="max-w-xs space-y-2">
            <Label htmlFor="disciplina-fecha">Fecha</Label>
            <Input
              id="disciplina-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        </SectionCardBody>
      </SectionCard>

      <section aria-labelledby="disciplina-seguimiento-heading">
        <SectionCard>
          <SectionCardHeader
            titleId="disciplina-seguimiento-heading"
            title="Seguimiento: registro de Academia y acciones"
            subtitle="Vista compacta del avance formativo y del trabajo diario."
          />
          <SectionCardBody>
            <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
              <DisciplinaAcademyRegistro />
              <DisciplinaAccionesCard fecha={fecha} usuarioId={currentUser?.id} />
            </div>
          </SectionCardBody>
        </SectionCard>
      </section>

      <section aria-labelledby="disciplina-metricas-heading">
        <SectionCard>
          <SectionCardHeader
            titleId="disciplina-metricas-heading"
            title="Indicadores de disciplina"
            subtitle={`Referencia: ${fechaLabel}.`}
          />
          <SectionCardBody>
            {!currentUser ? (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
                Inicia sesión para ver tus métricas de disciplina.
              </div>
            ) : isError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                No se pudieron cargar las métricas.
              </div>
            ) : isLoading ? (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20">
                <p className="text-sm text-muted-foreground">Cargando…</p>
              </div>
            ) : metrics ? (
              <DisciplinaCard metrics={metrics} fechaLabel={fechaLabel} />
            ) : null}
          </SectionCardBody>
        </SectionCard>
      </section>
    </div>
  )
}
