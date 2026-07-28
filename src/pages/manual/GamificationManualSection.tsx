import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CircleMinus,
  CirclePlus,
  Gauge,
  ListChecks,
  Pencil,
  Percent,
  Scale,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react'
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

const awardWeights = [
  { label: 'Cumplimiento', value: '40%', detail: 'Puntos ganados sobre puntos positivos posibles.' },
  { label: 'Tasa de cierre', value: '25%', detail: 'Acciones asignadas que llegaron a cierre.' },
  { label: 'Sin retrasos', value: '15%', detail: 'Premia evitar acciones vencidas o en Retraso.' },
  { label: 'Colaboracion', value: '10%', detail: 'Comentarios y seguimiento relevante.' },
  { label: 'Racha', value: '10%', detail: 'Actividad constante creando, comentando o cerrando.' },
]

const workloadBands = [
  { label: 'Carga baja', value: '1-5 acciones' },
  { label: 'Carga media', value: '6-15 acciones' },
  { label: 'Carga alta', value: '16+ acciones' },
]

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
          <div className="border-b bg-card px-5 py-5 sm:px-6">
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Percent className="h-4 w-4 text-amber-600" aria-hidden />
                  Cumplimiento
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  La lectura principal es puntos ganados sobre puntos positivos posibles. Si un usuario gana 80 de
                  80 puntos posibles, su cumplimiento es 100%, aunque tenga penalizaciones visibles en el neto.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Scale className="h-4 w-4 text-emerald-600" aria-hidden />
                  Neto operativo
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Las penalizaciones no reducen el porcentaje de cumplimiento; se muestran como saldo neto para
                  evidenciar retrasos, riesgos o disciplina operativa pendiente.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Trophy className="h-4 w-4 text-amber-600" aria-hidden />
                  Premios justos
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Para reconocimientos, usa el score ajustado dentro de bandas de carga. Los puntos brutos quedan
                  como contexto o desempate, no como criterio unico.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Score ajustado para premios</h3>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-5">
                  {awardWeights.map((item) => (
                    <div key={item.label} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                      <p className="text-lg font-semibold tabular-nums text-foreground">{item.value}</p>
                      <p className="mt-1 text-xs font-medium text-foreground">{item.label}</p>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Bandas de carga</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {workloadBands.map((band) => (
                    <div
                      key={band.label}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-foreground">{band.label}</span>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{band.value}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  Compara usuarios dentro de su misma banda para evitar que una carga dispareja defina los premios.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">Consideracion para premios</h3>
              </div>
              <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
                <p>
                  La gamificacion no premia solo quien junta mas puntos, porque la carga de trabajo puede ser
                  diferente entre usuarios. El sistema separa <strong className="text-foreground">actividad</strong>,{' '}
                  <strong className="text-foreground">cumplimiento</strong> y{' '}
                  <strong className="text-foreground">premios</strong>.
                </p>
                <p>
                  Cada usuario puede ganar puntos por acciones positivas como crear acciones, recibir asignaciones,
                  cerrar en tiempo, comentar seguimientos, completar academia, mantener racha y tener perfil
                  organizacional completo. Tambien puede tener penalizaciones por acciones en retraso.
                </p>
                <div className="rounded-lg border border-border/70 bg-background p-3">
                  <p className="font-medium text-foreground">Dato principal para evaluar desempeno</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Cumplimiento = puntos ganados / puntos positivos posibles
                  </p>
                </div>
                <div className="grid gap-2 rounded-lg border border-border/70 bg-background p-3 sm:grid-cols-5">
                  {[
                    ['Puntos ganados', '80'],
                    ['Puntos posibles', '80'],
                    ['Penalizacion', '-20'],
                    ['Neto operativo', '60'],
                    ['Cumplimiento', '100%'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
                <p>
                  En este ejemplo, el usuario si cumplio el 100% de lo que podia ganar, pero el neto muestra que tuvo
                  retrasos que deben corregirse.
                </p>
                <p>
                  Para premios, no se recomienda usar solo puntos brutos ni solo puntos netos. Se usa un{' '}
                  <strong className="text-foreground">score ajustado para premios</strong>: 40% cumplimiento, 25% tasa
                  de cierre, 15% sin retrasos, 10% colaboracion y 10% racha.
                </p>
                <p>
                  Ademas, los usuarios se comparan por banda de carga: baja de 1 a 5 acciones, media de 6 a 15
                  acciones y alta de 16 o mas acciones. Asi, alguien con 4 acciones no compite directamente contra
                  alguien con 25 acciones; cada usuario compite contra personas con una carga parecida.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {[
                    'Se revisa el cumplimiento de gamificacion.',
                    'Se revisa el score ajustado para premios.',
                    'Se compara al usuario dentro de su banda de carga.',
                    'Los puntos netos se usan como contexto o desempate.',
                    'Los retrasos no borran el cumplimiento, pero si afectan el score premio y muestran riesgo operativo.',
                  ].map((item) => (
                    <li key={item} className="flex gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-background p-3">
                    <p className="font-medium text-foreground">Mejor cumplimiento</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Mayor porcentaje de cumplimiento dentro de su banda.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-background p-3">
                    <p className="font-medium text-foreground">Mejor score premio</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Mejor combinacion de cierre, cumplimiento, colaboracion, racha y cero retrasos.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

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
