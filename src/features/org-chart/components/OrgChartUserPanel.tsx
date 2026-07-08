import { Link } from 'react-router-dom'
import { AlertTriangle, Ban, ClipboardList, Network, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'
import type { OrgChartUser, OrgChartUserActionStats } from '../types/orgChart.types'
import {
  buildCommandChainRows,
  buildEscalationChain,
  getDirectReports,
  getManager,
  initialsFromName,
} from '../utils/orgHierarchy'
import { OrgChartHierarchyEditor } from './OrgChartHierarchyEditor'

interface OrgChartUserPanelProps {
  user: OrgChartUser
  users: OrgChartUser[]
  actionStats: OrgChartUserActionStats
  canEditHierarchy: boolean
  currentUserId?: string | null
  onClose?: () => void
}

export function OrgChartUserPanel({
  user,
  users,
  actionStats,
  canEditHierarchy,
  currentUserId,
  onClose,
}: OrgChartUserPanelProps) {
  const manager = getManager(user, users)
  const reports = getDirectReports(user.id, users)
  const chain = buildCommandChainRows(user.id, users)
  const escalation = buildEscalationChain(user.id, users)

  return (
    <Card className="h-full rounded-none border-0 shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b border-border/60">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
            {initialsFromName(user.nombre)}
          </span>
          <div>
            <CardTitle className="text-lg">{user.nombre}</CardTitle>
            <p className="text-sm text-muted-foreground">{user.rol}</p>
            <p className="text-sm text-muted-foreground">{user.area ?? 'Sin área'}</p>
          </div>
        </div>
        {onClose ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant={user.activo ? 'success' : 'muted'}>
            {user.activo ? 'Activo' : 'Inactivo'}
          </Badge>
          {!manager ? (
            <Badge variant="secondary">Sin responsable superior</Badge>
          ) : null}
        </div>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UserRound className="h-4 w-4 text-primary" aria-hidden />
            Reporta a
          </h3>
          {manager ? (
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
              <p className="font-medium">{manager.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {manager.rol}
                {!manager.activo ? ' · Inactivo' : ''}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin responsable superior asignado.</p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Network className="h-4 w-4 text-primary" aria-hidden />
            Le reportan
          </h3>
          {reports.length > 0 ? (
            <ul className="space-y-2">
              {reports.map((report) => (
                <li
                  key={report.id}
                  className="rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
                >
                  <p className="font-medium">{report.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {report.rol}
                    {!report.activo ? ' · Inactivo' : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Este usuario no tiene subordinados directos.</p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Cadena de mando</h3>
          <ol className="space-y-1 text-sm">
            {chain.map((row) => (
              <li
                key={`${row.id}-${row.nivel}`}
                className={cn(
                  'rounded-md border px-2 py-1.5',
                  row.nivel === 0 ? 'border-primary/30 bg-primary/5' : 'border-border/60'
                )}
              >
                <span className="font-medium">{row.nombre}</span>
                <span className="text-muted-foreground"> · {row.rol}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border/70 bg-muted/15 p-3 text-center">
            <ClipboardList className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="mt-1 text-lg font-semibold">{actionStats.asignadas}</p>
            <p className="text-[11px] text-muted-foreground">Asignadas</p>
          </div>
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-center">
            <AlertTriangle className="mx-auto h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden />
            <p className="mt-1 text-lg font-semibold">{actionStats.vencidas}</p>
            <p className="text-[11px] text-muted-foreground">Vencidas</p>
          </div>
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-center">
            <Ban className="mx-auto h-4 w-4 text-red-700 dark:text-red-300" aria-hidden />
            <p className="mt-1 text-lg font-semibold">{actionStats.bloqueadas}</p>
            <p className="text-[11px] text-muted-foreground">Bloqueadas</p>
          </div>
        </section>

        <section className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-3 py-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Escalamiento futuro</p>
          <p className="mt-1">
            Ruta preparada: {escalation.map((row) => row.nombre).join(' → ')}
          </p>
        </section>

        {canEditHierarchy ? (
          <OrgChartHierarchyEditor
            user={user}
            users={users}
            currentUserId={currentUserId}
          />
        ) : null}

        {canEditHierarchy ? (
          <Button asChild variant="outline" className="w-full">
            <Link to={`${ROUTES.SETTINGS_USERS}/${user.id}`}>Ver ficha completa en usuarios</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
