import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleMinus, CirclePlus, ListChecks, Pencil, ShieldCheck, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  manualGamificationService,
  type ManualGamificationRule,
} from './manualGamification.service'

const rulesQueryKey = ['manual', 'gamification-rules'] as const
const permissionQueryKey = ['manual', 'gamification-rules', 'can-edit'] as const

function PointsBadge({ points }: { points: number }) {
  const positive = points >= 0
  return (
    <span
      className={
        positive
          ? 'inline-flex min-w-14 justify-center rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'inline-flex min-w-14 justify-center rounded-full bg-red-100 px-2.5 py-1 text-sm font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300'
      }
    >
      {positive ? `+${points}` : points}
    </span>
  )
}

export function GamificationManualSection() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ManualGamificationRule | null>(null)
  const [activity, setActivity] = useState('')
  const [points, setPoints] = useState('0')
  const rulesQuery = useQuery({ queryKey: rulesQueryKey, queryFn: manualGamificationService.list })
  const permissionQuery = useQuery({
    queryKey: permissionQueryKey,
    queryFn: manualGamificationService.canEdit,
  })

  useEffect(() => {
    if (!editing) return
    setActivity(editing.activity)
    setPoints(String(editing.points))
  }, [editing])

  const updateRule = useMutation({
    mutationFn: manualGamificationService.update,
    onSuccess: (updated) => {
      queryClient.setQueryData<ManualGamificationRule[]>(rulesQueryKey, (current) =>
        current?.map((rule) => (rule.id === updated.id ? updated : rule))
      )
      toast.success('Regla de gamificación actualizada')
      setEditing(null)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo guardar la regla'),
  })

  const parsedPoints = Number(points)
  const canSave =
    activity.trim().length >= 3 && Number.isInteger(parsedPoints) && parsedPoints >= -1000 && parsedPoints <= 1000
  const rules = rulesQuery.data ?? []
  const recognitionCount = rules.filter((rule) => rule.points >= 0).length
  const penaltyCount = rules.filter((rule) => rule.points < 0).length

  return (
    <section className="space-y-4" aria-labelledby="manual-gamification-title">
      <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
        <CardHeader className="relative gap-3 overflow-hidden border-b bg-gradient-to-br from-amber-500/[0.14] via-background to-emerald-500/[0.06] p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="relative rounded-xl bg-amber-500 p-2.5 text-white shadow-sm">
                <Trophy className="h-5 w-5" aria-hidden />
              </div>
              <div className="relative space-y-1">
                <CardTitle id="manual-gamification-title" className="text-xl">
                  Gamificación y puntos
                </CardTitle>
                <CardDescription className="leading-6">
                  Consulta cómo las actividades operativas suman o restan puntos dentro del tablero.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="relative gap-1.5 bg-background/80 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {permissionQuery.data ? 'Edición autorizada' : 'Solo lectura'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="grid gap-px border-b bg-border sm:grid-cols-3">
            <div className="flex items-center gap-3 bg-card px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ListChecks className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-xl font-semibold leading-none">{rules.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Actividades</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-card px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <CirclePlus className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-xl font-semibold leading-none text-emerald-700 dark:text-emerald-300">{recognitionCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Reconocimientos</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-card px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                <CircleMinus className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-xl font-semibold leading-none text-red-700 dark:text-red-300">{penaltyCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">Penalizaciones</p>
              </div>
            </div>
          </div>
          {rulesQuery.isError ? (
            <p className="p-5 text-sm text-destructive">No fue posible cargar las reglas de gamificación.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Actividad</th>
                    <th scope="col" className="w-28 px-5 py-3 text-center font-semibold">Puntos</th>
                    {permissionQuery.data && (
                      <th scope="col" className="w-24 px-5 py-3 text-right font-semibold">Editar</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="transition-colors odd:bg-muted/[0.12] hover:bg-primary/[0.04]">
                      <td className="px-5 py-3.5 font-medium text-foreground">{rule.activity}</td>
                      <td className="px-5 py-3.5 text-center"><PointsBadge points={rule.points} /></td>
                      {permissionQuery.data && (
                        <td className="px-5 py-3.5 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditing(rule)}
                            aria-label={`Editar ${rule.activity}`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar regla de gamificación</DialogTitle>
            <DialogDescription>
              El cambio será visible para todos los usuarios en el Manual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="gamification-activity">Actividad</Label>
              <Input
                id="gamification-activity"
                value={activity}
                onChange={(event) => setActivity(event.target.value)}
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gamification-points">Puntos</Label>
              <Input
                id="gamification-points"
                type="number"
                min={-1000}
                max={1000}
                step={1}
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!editing || !canSave || updateRule.isPending}
              onClick={() =>
                editing && updateRule.mutate({ id: editing.id, activity: activity.trim(), points: parsedPoints })
              }
            >
              {updateRule.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
