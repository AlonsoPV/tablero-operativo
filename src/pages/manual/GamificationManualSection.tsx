import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  CircleMinus,
  CirclePlus,
  Gauge,
  ListChecks,
  Medal,
  MessageSquare,
  Pencil,
  ShieldCheck,
  Target,
  Trophy,
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
  { label: 'Alcance Kanban', value: '40%', detail: 'Acciones cerradas sobre acciones asignadas.' },
  { label: 'Cierre en tiempo', value: '25%', detail: 'Acciones cerradas antes o en fecha compromiso.' },
  { label: 'Sin retrasos', value: '15%', detail: 'Premia operar sin vencimientos activos.' },
  { label: 'Desarrollo y colaboracion', value: '10%', detail: 'Comentarios, academia y perfil organizacional.' },
  { label: 'Consistencia', value: '10%', detail: 'Racha y actividad sostenida en el periodo.' },
]

const awardSteps = [
  'Revisar el avance real del Kanban.',
  'Calcular el score ajustado.',
  'Usar puntos como desempate.',
  'Revisar retrasos como riesgo operativo.',
]

const learningBlocks = [
  {
    label: 'Lo principal',
    title: 'Score ajustado',
    detail: 'Es la calificacion para premios. Resume cierre, puntualidad, retrasos, colaboracion y consistencia.',
  },
  {
    label: 'Lo que explica',
    title: 'Puntos',
    detail: 'Muestran actividad positiva y penalizaciones. No son el ranking principal.',
  },
  {
    label: 'Lo que corrige',
    title: 'Retrasos',
    detail: 'No borran toda la actividad, pero si bajan el score y muestran riesgo operativo.',
  },
]

const commentTypes = [
  'General',
  'Avance',
  'Bloqueo',
  'Dependencia',
  'Decision',
  'Riesgo',
  'Evidencia',
  'Cambio relevante',
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
        <CardHeader className="gap-3 border-b bg-muted/20 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500 p-2.5 text-white shadow-sm">
                <Trophy className="h-5 w-5" aria-hidden />
              </div>
              <div className="space-y-1">
                <CardTitle id="manual-gamification-title" className="text-xl">
                  Gamificación y puntos
                </CardTitle>
                <CardDescription className="leading-6">
                  Consulta cómo las actividades operativas suman o restan puntos dentro del tablero.
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="gap-1.5 bg-background">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {permissionQuery.data ? 'Edición autorizada' : 'Solo lectura'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="border-b bg-card px-5 py-5 sm:px-6">
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
                <div className="flex items-center gap-2">
                  <Medal className="h-4 w-4 text-amber-600" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Idea central</h3>
                </div>
                <p className="mt-3 text-lg font-semibold leading-7 text-foreground">
                  La gamificacion premia cumplimiento operativo, no solo acumulacion de puntos.
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  El score ajustado es la lectura principal. Los puntos ayudan a entender actividad y funcionan como
                  desempate cuando el desempeno es similar.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                  {learningBlocks.map((block) => (
                    <div
                      key={block.title}
                      className="rounded-lg border border-border/60 bg-background px-3 py-2"
                    >
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{block.label}</p>
                      <p className="mt-0.5 text-sm font-semibold text-foreground">{block.title}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{block.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Formula principal</h3>
                </div>
                <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Score ajustado para premios</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-foreground">
                    40% alcance Kanban + 25% cierre en tiempo + 15% sin retrasos + 10% desarrollo y colaboracion +
                    10% consistencia
                  </p>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Criterio principal</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Score ajustado</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Evidencia de actividad</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Puntos positivos</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Desempate</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">Puntos netos</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border/70 bg-background p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Score ajustado para premios</h3>
                </div>
                <Badge variant="outline" className="bg-muted/30 text-xs">
                  Criterio principal
                </Badge>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {awardWeights.map((item, index) => (
                  <div key={item.label} className="rounded-lg border border-border/60 bg-muted/15 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-2xl font-semibold tabular-nums text-foreground">{item.value}</p>
                      <span className="text-[11px] font-semibold text-muted-foreground">0{index + 1}</span>
                    </div>
                    <p className="mt-2 min-h-8 text-sm font-semibold leading-5 text-foreground">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Que significa cada lectura</h3>
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Alcance Kanban</strong> mide acciones cerradas sobre acciones
                    asignadas. Es el corazon del score porque confirma cierre real.
                  </p>
                  <p>
                    <strong className="text-foreground">Desarrollo y colaboracion</strong> incluye comentarios,
                    avances con evidencia, academia y perfil u organigrama actualizado.
                  </p>
                  <p>
                    <strong className="text-foreground">Puntos</strong> muestran actividad y penalizaciones. No son el
                    ranking principal; sirven como contexto y desempate.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Comentarios y colaboracion</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Cualquier comentario suma los puntos definidos en la regla vigente. El tipo de comentario es
                  opcional y solo ayuda a entender el seguimiento.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {commentTypes.map((type) => (
                    <Badge key={type} variant="secondary" className="text-[11px] font-medium">
                      {type}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-xs leading-5 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <span>No se califica subjetivamente si el comentario es util: si el usuario comenta, suma.</span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border/70 bg-background p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-600" aria-hidden />
                <h3 className="text-sm font-semibold text-foreground">Version final para premios</h3>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-4">
                {awardSteps.map((step, index) => (
                  <div key={step} className="rounded-lg border border-border/60 bg-muted/15 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Paso {index + 1}</span>
                      {index < awardSteps.length - 1 ? (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      ) : (
                        <Medal className="h-3.5 w-3.5 text-amber-600" aria-hidden />
                      )}
                    </div>
                    <p className="mt-2 text-sm font-medium leading-5 text-foreground">{step}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                La gamificacion separa actividad, score ajustado y premios. Asi se reconoce desempeno real: el score
                define el premio y los puntos explican la actividad o desempatan.
              </p>
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
