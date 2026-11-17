import { AlertTriangle, CheckCircle2, CircleDot, Sparkles } from 'lucide-react'
import { evidenceLabel, type EvidenceKind } from '@/features/guide/enviardianReportDocument'
import { toneClasses, toneForEvidence } from '@/features/guide/reportVisualTheme'
import { cn } from '@/lib/utils'

function evidenceIcon(kind: EvidenceKind) {
  if (kind === 'verified') return CheckCircle2
  if (kind === 'hypothesis') return AlertTriangle
  if (kind === 'recommendation') return Sparkles
  return CircleDot
}

export function EvidenceTag({ kind, source }: { kind: EvidenceKind; source?: string }) {
  const tone = toneClasses(toneForEvidence(kind))
  const Icon = evidenceIcon(kind)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-[0.02em]',
        tone.badge
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {evidenceLabel(kind)}
      {source ? <span className="font-normal opacity-80">· {source}</span> : null}
    </span>
  )
}
