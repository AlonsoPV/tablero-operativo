import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  MessageSquareText,
  Save,
  Smartphone,
  TimerReset,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SettingsPageHeader } from '@/components/layout/SettingsPageHeader'
import { SettingsPageShell } from '@/components/layout/SettingsPageShell'
import { cn } from '@/lib/utils'
import {
  whatsappIntegrationService,
  type UpdateWhatsAppFollowupSettingsInput,
  type WhatsAppFollowupSettings,
} from '@/services/whatsappIntegration.service'

const QUERY_KEY = ['whatsapp-followup-settings'] as const

const TEMPLATE_VAR_TOKENS = [
  'responsable_nombre',
  'titulo_accion',
  'descripcion_accion',
  'fecha_compromiso',
  'checklist_bloque',
  'checkpoint_texto',
] as const

const TEMPLATE_VARS: Array<{
  token: (typeof TEMPLATE_VAR_TOKENS)[number]
  short: string
}> = [
  { token: 'responsable_nombre', short: 'Responsable' },
  { token: 'titulo_accion', short: 'Título' },
  { token: 'descripcion_accion', short: 'Descripción' },
  { token: 'fecha_compromiso', short: 'Fecha' },
  { token: 'checklist_bloque', short: 'Checklist' },
  { token: 'checkpoint_texto', short: 'Checkpoint' },
]

const SAMPLE: Record<(typeof TEMPLATE_VAR_TOKENS)[number], string> = {
  responsable_nombre: 'Ana Pérez',
  titulo_accion: 'Cerrar conciliación O2C',
  descripcion_accion: 'Revisar partidas de la semana y cerrar diferencias antes del corte.',
  fecha_compromiso: '2026-11-05',
  checklist_bloque: '\nChecklist pendiente:\n1. Validar facturas\n2. Subir evidencia',
  checkpoint_texto: 'Validar facturas',
}

type TemplateKey =
  | 'initial_text_template'
  | 'checkpoint_followup_template'
  | 'commitment_close_template'

const TEMPLATE_TABS: Array<{
  key: TemplateKey
  label: string
  hint: string
}> = [
  {
    key: 'initial_text_template',
    label: 'Inicial',
    hint: 'Al crear o asignar, si hay sesión abierta (24 h). Incluye los mismos botones de seguimiento: Realizada, En proceso y Requiero apoyo.',
  },
  {
    key: 'checkpoint_followup_template',
    label: 'Seguimiento',
    hint: 'Follow-up con botones Realizada / En proceso / Requiero apoyo.',
  },
  {
    key: 'commitment_close_template',
    label: 'Cierre',
    hint: 'Aviso al cerrar el compromiso desde el tablero.',
  },
]

function renderPreview(template: string) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => SAMPLE[key as keyof typeof SAMPLE] ?? '')
}

function toDraft(settings?: WhatsAppFollowupSettings | null): UpdateWhatsAppFollowupSettingsInput {
  return {
    followup_delay_minutes: settings?.followup_delay_minutes ?? 5,
    followups_per_day: settings?.followups_per_day ?? 1,
    initial_text_template: settings?.initial_text_template ?? '',
    checkpoint_followup_template: settings?.checkpoint_followup_template ?? '',
    commitment_close_template: settings?.commitment_close_template ?? '',
  }
}

function followupSummary(delayMinutes: number, perDay: number) {
  if (perDay <= 0) return 'Seguimientos automáticos desactivados (0 por día).'
  if (perDay === 1) return `1 seguimiento a los ${delayMinutes} min tras el envío inicial.`
  return `${perDay} seguimientos, cada ${delayMinutes} min, tras el envío inicial.`
}

function TemplateEditor({
  id,
  value,
  onChange,
  showButtonsHint,
}: {
  id: string
  value: string
  onChange: (next: string) => void
  showButtonsHint?: boolean
}) {
  const preview = useMemo(() => renderPreview(value), [value])
  const chars = value.length

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARS.map(({ token, short }) => (
            <Button
              key={`${id}-${token}`}
              type="button"
              variant="outline"
              size="sm"
              title={`Insertar {{${token}}}`}
              className="h-7 px-2.5 text-[11px]"
              onClick={() => onChange(`${value}{{${token}}}`)}
            >
              + {short}
            </Button>
          ))}
        </div>
        <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {chars} caracteres
          {showButtonsHint ? ' · body interactivo ≤ 1024' : null}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60">
        <div className="grid lg:grid-cols-2">
          <div className="min-w-0 border-b border-border/60 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
              <Label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Editar
              </Label>
            </div>
            <textarea
              id={id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder="Escribe el mensaje… Usa + variable para insertar campos."
              className="min-h-[12rem] w-full resize-y border-0 bg-background px-3 py-3 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-[14rem] sm:text-[13px]"
            />
          </div>

          <div className="min-w-0 bg-[#e8f0e9] dark:bg-emerald-950/30">
            <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/20 px-3 py-2">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Vista en chat
              </p>
            </div>
            <div className="px-3 py-4 sm:px-4">
              <div className="ml-auto max-w-[22rem] rounded-2xl rounded-tr-md bg-white px-3 py-2.5 text-sm leading-relaxed text-zinc-900 shadow-sm dark:bg-emerald-900/50 dark:text-emerald-50">
                <p className="whitespace-pre-wrap break-words">{preview || '—'}</p>
                {showButtonsHint ? (
                  <div className="mt-2.5 grid gap-1.5 border-t border-zinc-200/80 pt-2 dark:border-emerald-800/60">
                    {['Realizada', 'En proceso', 'Requiero apoyo'].map((title) => (
                      <span
                        key={title}
                        className="rounded-md bg-zinc-50 px-2 py-1.5 text-center text-xs font-medium text-sky-700 dark:bg-emerald-950/40 dark:text-sky-300"
                      >
                        {title}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function WhatsAppSettingsPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => whatsappIntegrationService.getSettings(),
  })
  const [draft, setDraft] = useState<UpdateWhatsAppFollowupSettingsInput>(toDraft())
  const [activeTemplate, setActiveTemplate] = useState<TemplateKey>('initial_text_template')

  useEffect(() => {
    if (data) setDraft(toDraft(data))
  }, [data])

  const save = useMutation({
    mutationFn: () => whatsappIntegrationService.updateSettings(draft),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Configuración WhatsApp guardada')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    },
  })

  const activeTab = TEMPLATE_TABS.find((tab) => tab.key === activeTemplate) ?? TEMPLATE_TABS[0]
  const followupsEnabled = (draft.followups_per_day ?? 0) > 0

  const saveButton = (
    <Button
      type="button"
      onClick={() => save.mutate()}
      disabled={save.isPending || isLoading || isError}
      className="h-10 w-full shadow-sm sm:w-auto"
    >
      <Save className="mr-2 h-4 w-4" aria-hidden />
      {save.isPending ? 'Guardando…' : 'Guardar cambios'}
    </Button>
  )

  return (
    <SettingsPageShell width="wide" className="space-y-5 pb-24 sm:space-y-6 sm:pb-6">
      <SettingsPageHeader
        eyebrow="Integraciones"
        title="WhatsApp Ops"
        description="Configura seguimientos automáticos y textos de sesión del flujo operativo. El chatbot OKRS usa el mismo número, pero no estas plantillas."
        action={saveButton}
      />

      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-xl border border-border/50 bg-muted/40"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : 'No se pudo cargar la configuración'}
        </div>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  <MessageSquareText className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Flujo Ops</h2>
                    <Badge variant="success">Esta pantalla</Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                    Envío de tareas, follow-ups con botones, evidencia y cierre. Se dispara al
                    crear/asignar o con el botón WhatsApp de la acción.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/60 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Chatbot</h2>
                    <Badge variant="muted">Independiente</Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                    OKRS / Super Admin con{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">WHATSAPP_AI_ENABLED</code>
                    . Texto libre no usa estas plantillas ni programa jobs de seguimiento.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <Card>
            <CardHeader className="space-y-3 pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TimerReset className="h-4 w-4 text-primary" aria-hidden />
                    Seguimientos automáticos
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-xs leading-relaxed sm:text-sm">
                    Tras un envío inicial exitoso se programan N jobs. El dispatcher solo manda
                    botones <code className="text-[11px]">act:</code> si hay sesión abierta (24 h).
                    Guardar aquí no envía WhatsApp.
                  </CardDescription>
                </div>
                <Badge variant={followupsEnabled ? 'success' : 'muted'} className="w-fit shrink-0">
                  {followupsEnabled ? 'Activos' : 'Desactivados'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 p-3 sm:p-4">
                  <Label htmlFor="wa-delay" className="flex items-center gap-2">
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    Delay entre seguimientos
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="wa-delay"
                      type="number"
                      min={1}
                      max={240}
                      inputMode="numeric"
                      className="max-w-[8rem] tabular-nums"
                      value={draft.followup_delay_minutes}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          followup_delay_minutes: Math.min(
                            240,
                            Math.max(1, Number(e.target.value) || 1)
                          ),
                        }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">minutos (1–240)</span>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 p-3 sm:p-4">
                  <Label htmlFor="wa-per-day" className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    Seguimientos por día
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="wa-per-day"
                      type="number"
                      min={0}
                      max={12}
                      inputMode="numeric"
                      className="max-w-[8rem] tabular-nums"
                      value={draft.followups_per_day}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          followups_per_day: Math.min(12, Math.max(0, Number(e.target.value) || 0)),
                        }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">veces (0–12)</span>
                  </div>
                </div>
              </div>

              <p className="rounded-lg border border-border/50 bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground">
                {followupSummary(draft.followup_delay_minutes ?? 5, draft.followups_per_day ?? 0)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3 p-4 sm:p-5 sm:pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4 text-primary" aria-hidden />
                    Plantillas de sesión
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-xs leading-relaxed sm:text-[13px]">
                    Texto libre en ventana 24 h. Si no hay sesión, Meta usa{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      WHATSAPP_INITIAL_TEMPLATE_NAME
                    </code>
                    .
                  </CardDescription>
                </div>
                <div
                  role="tablist"
                  aria-label="Tipo de plantilla"
                  className="inline-flex w-full shrink-0 rounded-lg border border-border/60 bg-muted/30 p-1 sm:w-auto"
                >
                  {TEMPLATE_TABS.map((tab) => {
                    const selected = tab.key === activeTemplate
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => setActiveTemplate(tab.key)}
                        className={cn(
                          'flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors sm:flex-none sm:text-sm',
                          selected
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {tab.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <p className="rounded-md bg-muted/35 px-3 py-2 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
                <span className="font-medium text-foreground">{activeTab.label}: </span>
                {activeTab.hint}
              </p>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-5 sm:pt-0">
              <TemplateEditor
                id={`wa-${activeTab.key}`}
                value={draft[activeTab.key] ?? ''}
                onChange={(next) => setDraft((prev) => ({ ...prev, [activeTab.key]: next }))}
                showButtonsHint={
                  activeTab.key === 'initial_text_template' ||
                  activeTab.key === 'checkpoint_followup_template'
                }
              />
            </CardContent>
          </Card>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:hidden">
        {saveButton}
      </div>
    </SettingsPageShell>
  )
}
