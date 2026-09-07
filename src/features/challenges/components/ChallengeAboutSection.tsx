import { Badge } from '@/components/ui/badge'
import { CHALLENGE_IMPACT_LABEL } from '../constants'
import type { ChallengeListItem } from '../types'

/** Badges compactos de pilar / impactos / área (listado y detalle). */
export function ChallengeMetaBadges({
  challenge,
  areaName,
}: {
  challenge: ChallengeListItem
  areaName?: string | null
}) {
  const impactLabels = challenge.impacts.slice(0, 3).map((impact) => {
    if (impact === 'other' && challenge.other_impact?.trim()) return challenge.other_impact.trim()
    return CHALLENGE_IMPACT_LABEL[impact]
  })

  return (
    <div className="flex flex-wrap gap-1.5">
      {challenge.strategic_pillar ? (
        <Badge variant="outline" className="border-primary/25 bg-primary/5 text-[10px]">
          {challenge.strategic_pillar.nombre}
        </Badge>
      ) : null}
      {impactLabels.map((label) => (
        <Badge key={label} variant="secondary" className="text-[10px]">
          {label}
        </Badge>
      ))}
      {areaName ? (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {areaName}
        </Badge>
      ) : null}
    </div>
  )
}
