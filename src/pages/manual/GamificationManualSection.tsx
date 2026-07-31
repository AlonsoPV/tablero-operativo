import { Fragment, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock3,
  CircleMinus,
  CirclePlus,
  Gauge,
  Home,
  ListChecks,
  MessageSquare,
  Pencil,
  ShieldCheck,
  Star,
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
  { label: 'Cumplimiento del Kanban', value: 40, detail: 'Acciones cerradas sobre acciones asignadas.' },
  { label: 'Cierre en tiempo', value: 25, detail: 'Acciones cerradas antes o en fecha compromiso.' },
  { label: 'Sin retrasos', value: 15, detail: 'Premia operar sin vencimientos activos.' },
  { label: 'Colaboracion', value: 10, detail: 'Comentarios, academia y perfil organizacional.' },
  { label: 'Constancia', value: 10, detail: 'Racha y actividad sostenida en el periodo.' },
]

const winningHabits = [
  'Cumple tus acciones en tiempo.',
  'Manten actualizado el Kanban.',
  'Evita reprogramaciones innecesarias.',
  'Verifica correctamente.',
  'Colabora con tu equipo.',
]

const progressMetrics = [
  { label: 'Score ajustado', value: '92%', detail: 'Criterio principal' },
  { label: 'Nivel', value: 'Plata', detail: 'Reconocimiento estimado' },
  { label: 'ICC', value: '97%', detail: 'Cierre y cumplimiento' },
  { label: 'Kanban', value: '89%', detail: 'Avance operativo' },
  { label: 'Constancia', value: '100%', detail: 'Racha del periodo' },
]

const exampleMetrics = [
  { label: 'Acciones', value: '20' },
  { label: 'Cerradas', value: '18' },
  { label: 'ICC', value: '96%' },
  { label: 'Retrasos', value: '1' },
]

const awardSteps = [
  {
    title: 'Score ajustado',
    detail: 'Define el premio porque mide cumplimiento real, puntualidad, retrasos, colaboracion y constancia.',
  },
  {
    title: 'Puntos',
    detail: 'Explican actividad positiva, penalizaciones y sirven como desempate.',
  },
  {
    title: 'Retrasos',
    detail: 'No borran todo lo ganado, pero bajan el score y muestran riesgo operativo.',
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
  const positiveRules = rules.filter((rule) => rule.points > 0)
  const neutralRules = rules.filter((rule) => rule.points === 0)
  const penaltyRules = rules.filter((rule) => rule.points < 0)
  const recognitionCount = positiveRules.length + neutralRules.length
  const penaltyCount = rules.filter((rule) => rule.points < 0).length
  const ruleGroups = [
    {
      title: 'Acciones que suman',
      description: 'Actividad operativa que ayuda al score y deja evidencia de avance.',
      rules: positiveRules,
      tone: 'bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300',
    },
    {
      title: 'Acciones que restan',
      description: 'Penalizaciones que muestran riesgo operativo y bajan el resultado neto.',
      rules: penaltyRules,
      tone: 'bg-red-500/[0.08] text-red-700 dark:text-red-300',
    },
    {
      title: 'Reconocimientos',
      description: 'Reglas visibles para explicar conducta esperada, aunque no siempre sumen puntos.',
      rules: neutralRules,
      tone: 'bg-amber-500/[0.08] text-amber-700 dark:text-amber-300',
    },
  ].filter((group) => group.rules.length > 0)

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
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
                <Badge variant="outline" className="border-amber-500/30 bg-background text-amber-700 dark:text-amber-300">
                  Criterio para premios
                </Badge>
                <h3 className="mt-3 text-2xl font-semibold leading-8 text-foreground">
                  Los puntos explican la actividad. El Score Ajustado define el premio.
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  No gana quien mas trabaja. Gana quien cumple mejor sus compromisos, mantiene el tablero vivo y ayuda
                  a que el equipo cierre con claridad.
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {winningHabits.map((habit) => (
                    <div key={habit} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-sm font-medium text-foreground">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      <span>{habit}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-600" aria-hidden />
                    <h3 className="text-sm font-semibold text-foreground">Tu progreso</h3>
                  </div>
                  <Badge variant="secondary" className="text-xs">Ejemplo</Badge>
                </div>
                <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Premio estimado</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold leading-none text-foreground">Home Office</p>
                      <p className="mt-2 text-sm text-muted-foreground">Nivel Plata · 275 pts</p>
                    </div>
                    <Home className="h-8 w-8 text-amber-600" aria-hidden />
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {progressMetrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
                      <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                      <p className="mt-1 text-lg font-semibold leading-none text-foreground">{metric.value}</p>
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{metric.detail}</p>
                    </div>
                  ))}
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">Resultado</p>
                    <p className="mt-1 text-lg font-semibold leading-none text-emerald-700 dark:text-emerald-300">Premiable</p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Buen cierre con retraso controlado.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Como se calcula el premio mensual</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {awardWeights.map((item) => (
                    <div key={item.label} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <span className="text-sm font-semibold tabular-nums text-foreground">{item.value}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted">
                        <div className="h-2.5 rounded-full bg-primary" style={{ width: `${item.value}%` }} />
                      </div>
                      <p className="text-xs leading-5 text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Ejemplo rapido</h3>
                </div>
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/15 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Juan</p>
                      <p className="mt-1 text-xs text-muted-foreground">Periodo mensual</p>
                    </div>
                    <Badge variant="outline" className="bg-background">Premio Plata</Badge>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    {exampleMetrics.map((metric) => (
                      <div key={metric.label} className="rounded-lg bg-background px-3 py-2">
                        <p className="text-xs text-muted-foreground">{metric.label}</p>
                        <p className="mt-1 text-lg font-semibold leading-none text-foreground">{metric.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
                    <Star className="h-4 w-4 text-emerald-600" aria-hidden />
                    <span className="text-sm font-semibold text-foreground">Score Ajustado 93%</span>
                    <span className="text-sm text-muted-foreground">Los puntos explican su actividad; el score define el premio.</span>
                  </div>
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <p>
                    Este ejemplo ayuda a leer la gamificacion como desempeno operativo, no como una carrera por juntar
                    mas acciones.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Score, puntos y retrasos</h3>
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  {awardSteps.map((step) => (
                    <div key={step.title} className="rounded-lg border border-border/60 bg-muted/15 p-3">
                      <p className="font-semibold text-foreground">{step.title}</p>
                      <p className="mt-1 text-xs leading-5">{step.detail}</p>
                    </div>
                  ))}
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

              <div className="rounded-xl border border-border/70 bg-background p-4">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-primary" aria-hidden />
                  <h3 className="text-sm font-semibold text-foreground">Ruta del reconocimiento</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {['Nivel Plata', '275 pts', 'Premio mensual', 'Home Office'].map((step, index) => (
                    <div key={step} className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {index + 1}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{step}</span>
                      {index < 3 && <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  El premio final depende de las reglas internas del periodo; esta tarjeta muestra como se traduce el
                  desempeno en una recompensa tangible.
                </p>
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
                  {ruleGroups.map((group) => (
                    <Fragment key={group.title}>
                      <tr key={`${group.title}-heading`} className="bg-muted/35">
                        <td colSpan={permissionQuery.data ? 3 : 2} className="px-5 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{group.title}</p>
                              <p className="mt-0.5 text-xs normal-case tracking-normal text-muted-foreground">
                                {group.description}
                              </p>
                            </div>
                            <Badge variant="secondary" className={group.tone}>
                              {group.rules.length}
                            </Badge>
                          </div>
                        </td>
                      </tr>
                      {group.rules.map((rule) => (
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
                    </Fragment>
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
