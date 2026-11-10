import { Compass, Lightbulb, MessageCircle, Sparkles, Target } from 'lucide-react'
import { parseReportBlocks } from '@/features/guide/reportBlocks'
import { cn } from '@/lib/utils'

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
    <div className="rounded-2xl border border-border/50 bg-card px-4 py-3.5 shadow-sm">
      <p className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
        {label}
      </p>
      <p className="text-sm leading-6 text-foreground">{children}</p>
    </div>
  )
}

function blockTone(title: string | null) {
  if (!title) return 'default'
  if (/situacion|diagnostico/i.test(title)) return 'lead'
  if (/prioridad|decision|accion|proximo/i.test(title)) return 'action'
  if (/riesgo/i.test(title)) return 'risk'
  return 'default'
}

export function GuideReportBody({
  executiveReport,
  summary,
  agentInferences,
  learning,
  intention,
  reflectionQuestion,
}: {
  executiveReport?: string | null
  summary?: string | null
  agentInferences?: string | null
  learning?: string | null
  intention?: string | null
  reflectionQuestion?: string | null
}) {
  const blocks = executiveReport?.trim() ? parseReportBlocks(executiveReport) : null
  const visibleBlocks = blocks?.filter((block) => !/para aprobar/i.test(block.title || '')) ?? []

  return (
    <>
      {(visibleBlocks.length > 0 || summary) && (
        <section className="space-y-4" aria-label="Informe ejecutivo">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Compass className="h-4 w-4 text-primary" aria-hidden />
                <h2 className="text-base font-semibold tracking-tight">Informe ejecutivo</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Lectura corta: situacion, hallazgos y siguientes pasos.
              </p>
            </div>
          </div>

          {visibleBlocks.length > 0 ? (
            <div className="space-y-3">
              {visibleBlocks.map((block, index) => {
                const tone = blockTone(block.title)
                return (
                  <article
                    key={`${block.title ?? 'body'}-${index}`}
                    className={cn(
                      'rounded-2xl border px-4 py-4 sm:px-5',
                      tone === 'lead' && 'border-primary/20 bg-primary/[0.04]',
                      tone === 'action' && 'border-emerald-500/20 bg-emerald-500/[0.04]',
                      tone === 'risk' && 'border-amber-500/25 bg-amber-500/[0.05]',
                      tone === 'default' && 'border-border/60 bg-card shadow-sm'
                    )}
                  >
                    {block.title ? (
                      <p
                        className={cn(
                          'mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]',
                          tone === 'lead' && 'text-primary',
                          tone === 'action' && 'text-emerald-700 dark:text-emerald-300',
                          tone === 'risk' && 'text-amber-700 dark:text-amber-300',
                          tone === 'default' && 'text-muted-foreground'
                        )}
                      >
                        {block.title}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">
                      {block.body}
                    </p>
                  </article>
                )
              })}
            </div>
          ) : summary ? (
            <article className="rounded-2xl border border-primary/20 bg-primary/[0.04] px-4 py-4 sm:px-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                Situacion
              </p>
              <p className="text-[15px] leading-7 text-foreground">{summary}</p>
            </article>
          ) : null}
        </section>
      )}

      {(agentInferences || learning || intention || reflectionQuestion) && (
        <section className="space-y-3" aria-label="Notas de Guia">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight">Notas de Guia</h2>
            <p className="text-sm text-muted-foreground">
              Contexto adicional para interpretar la sesion.
            </p>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {agentInferences ? (
              <InsightChip icon={Lightbulb} label="Interpretacion">
                {agentInferences}
              </InsightChip>
            ) : null}
            {learning ? (
              <InsightChip icon={Sparkles} label="Aprendizaje">
                {learning}
              </InsightChip>
            ) : null}
            {intention ? (
              <InsightChip icon={Target} label="Intencion">
                {intention}
              </InsightChip>
            ) : null}
            {reflectionQuestion ? (
              <InsightChip icon={MessageCircle} label="Para pensar">
                {reflectionQuestion}
              </InsightChip>
            ) : null}
          </div>
        </section>
      )}
    </>
  )
}
