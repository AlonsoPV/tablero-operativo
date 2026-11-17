import { Lightbulb } from 'lucide-react'
import type { ReportRecommendationView } from '@/features/guide/reportViewModel'
import { cn } from '@/lib/utils'

export function RecommendationCard({
  item,
  index,
}: {
  item: ReportRecommendationView
  index: number
}) {
  const structured = Boolean(item.what || item.why || item.outcome)
  return (
    <article className="rounded-2xl border border-[#7C3AED]/25 bg-[#7C3AED]/[0.06] p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-[#7C3AED]" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7C3AED]">
          Sugerencia {index + 1} · no es una decision confirmada
        </p>
      </div>
      {structured ? (
        <dl className="space-y-2 text-sm leading-6 text-slate-800">
          {item.what ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Que se recomienda
              </dt>
              <dd>{item.what}</dd>
            </div>
          ) : null}
          {item.why ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Por que
              </dt>
              <dd>{item.why}</dd>
            </div>
          ) : null}
          {item.outcome ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">
                Resultado buscado
              </dt>
              <dd>{item.outcome}</dd>
            </div>
          ) : null}
          {!item.what ? <p>{item.text}</p> : null}
        </dl>
      ) : (
        <p className={cn('text-sm leading-6 text-slate-800')}>{item.text}</p>
      )}
    </article>
  )
}
