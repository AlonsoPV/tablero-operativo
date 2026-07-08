import { Link } from 'react-router-dom'
import { Network } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ROUTES } from '@/constants'
import type { UserProfile } from '../types/user.types'
import type { OrgChartUser } from '@/features/org-chart/types/orgChart.types'
import {
  buildCommandChainRows,
  buildEscalationChain,
  getDirectReports,
  getManager,
} from '@/features/org-chart/utils/orgHierarchy'

interface UserHierarchySectionProps {
  user: UserProfile
  users: OrgChartUser[]
}

export function UserHierarchySection({ user, users }: UserHierarchySectionProps) {
  const manager = getManager(
    { manager_user_id: user.manager_user_id ?? null },
    users
  )
  const reports = getDirectReports(user.id, users)
  const chain = buildCommandChainRows(user.id, users)
  const escalation = buildEscalationChain(user.id, users)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-primary" aria-hidden />
          <CardTitle className="text-base">Jerarquía organizacional</CardTitle>
        </div>
        <Link
          to={ROUTES.ORG_CHART}
          className="text-xs font-medium text-primary hover:underline"
        >
          Ver organigrama
        </Link>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Reporta a</h3>
            {manager ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                <p className="font-medium">{manager.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {manager.rol}
                  {!manager.activo ? ' · Inactivo' : ''}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin responsable superior.</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Le reportan</h3>
            {reports.length > 0 ? (
              <ul className="space-y-2">
                {reports.map((report) => (
                  <li
                    key={report.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{report.nombre}</p>
                      <p className="text-xs text-muted-foreground">{report.rol}</p>
                    </div>
                    {!report.activo ? <Badge variant="muted">Inactivo</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No tiene subordinados directos.</p>
            )}
          </section>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Cadena de mando</h3>
          <ol className="flex flex-wrap gap-2">
            {chain.map((row) => (
              <li key={`${row.id}-${row.nivel}`}>
                <Badge variant={row.nivel === 0 ? 'default' : 'secondary'}>
                  {row.nombre}
                </Badge>
              </li>
            ))}
          </ol>
        </section>

        <p className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
          Escalamiento futuro: {escalation.map((row) => row.nombre).join(' → ')}
        </p>
      </CardContent>
    </Card>
  )
}
