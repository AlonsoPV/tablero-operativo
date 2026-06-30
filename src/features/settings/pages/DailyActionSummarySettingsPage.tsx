import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingsPageHeader } from '@/components/layout/SettingsPageHeader'
import { SettingsPageShell } from '@/components/layout/SettingsPageShell'
import { useUsers } from '@/features/users/hooks'
import { toast } from 'sonner'
import { BellRing, Clock, MailCheck, Save, Send } from 'lucide-react'
import {
  useDailyActionSummaryLogs,
  useDailyActionSummarySettings,
  useSendDailyActionSummaryTest,
  useUpdateDailyActionSummarySettings,
} from '../hooks/useDailyActionSummary'
import type {
  DailyActionSummarySettings,
  DailySummaryRecipientMode,
  DailySummarySendDays,
  UpdateDailyActionSummarySettingsInput,
} from '../types/dailyActionSummary.types'

const SEND_DAYS_OPTIONS: Array<{ value: DailySummarySendDays; label: string }> = [
  { value: 'weekdays', label: 'Lunes a viernes' },
  { value: 'mon_sat', label: 'Lunes a sabado' },
  { value: 'every_day', label: 'Todos los dias' },
]

const RECIPIENT_OPTIONS: Array<{ value: DailySummaryRecipientMode; label: string }> = [
  { value: 'all_active', label: 'Todos los usuarios activos' },
  { value: 'leaders', label: 'Solo lideres' },
  { value: 'selected', label: 'Usuarios seleccionados' },
]

const COMMON_TIMEZONES = [
  'America/Mexico_City',
  'America/Monterrey',
  'America/Tijuana',
  'America/Cancun',
  'UTC',
]
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function defaultDraft(): UpdateDailyActionSummarySettingsInput {
  return {
    enabled: false,
    send_time: '08:00',
    timezone: 'America/Mexico_City',
    send_days: 'weekdays',
    recipient_mode: 'all_active',
    selected_usuario_ids: [],
    send_if_no_pending: false,
  }
}

function settingsToDraft(settings?: DailyActionSummarySettings | null): UpdateDailyActionSummarySettingsInput {
  if (!settings) return defaultDraft()
  return {
    enabled: settings.enabled,
    send_time: settings.send_time.slice(0, 5),
    timezone: settings.timezone,
    send_days: settings.send_days,
    recipient_mode: settings.recipient_mode,
    selected_usuario_ids: settings.selected_usuario_ids ?? [],
    send_if_no_pending: settings.send_if_no_pending,
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Sin ejecuciones'
  try {
    return new Date(value).toLocaleString('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return value
  }
}

function statusMeta(status: string | null | undefined) {
  if (!status) return { label: 'Sin ejecuciones', variant: 'muted' as const }
  if (status === 'sent' || status === 'ok') return { label: 'Ultimo envio exitoso', variant: 'success' as const }
  if (status === 'partial_error') return { label: 'Envio parcial', variant: 'secondary' as const }
  if (status === 'skipped_disabled') return { label: 'Resumen diario inactivo', variant: 'muted' as const }
  if (status === 'skipped_schedule') return { label: 'Fuera de horario', variant: 'muted' as const }
  if (status === 'config_error') return { label: 'Configuracion incompleta', variant: 'destructive' as const }
  return { label: 'Error en el ultimo envio', variant: 'destructive' as const }
}

function schedulerStatusMeta(status: string | null | undefined) {
  if (!status) return { label: 'Sin revision', variant: 'muted' as const }
  if (status === 'ok') return { label: 'Scheduler listo', variant: 'success' as const }
  if (status === 'skipped_disabled') return { label: 'Scheduler inactivo', variant: 'muted' as const }
  if (status === 'skipped_schedule') return { label: 'Fuera de horario', variant: 'muted' as const }
  if (status === 'config_error') return { label: 'Config incompleta', variant: 'destructive' as const }
  return { label: 'Error de scheduler', variant: 'destructive' as const }
}

function logStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    sent: 'Enviado',
    omitted_no_pending: 'Sin pendientes',
    skipped_no_email: 'Sin correo',
    skipped_inactive: 'Inactivo',
    skipped_not_recipient: 'Fuera de destinatarios',
    skipped_duplicate: 'Duplicado omitido',
    config_error: 'Config incompleta',
    error: 'Error',
  }
  return labels[status] ?? status
}

export function DailyActionSummarySettingsPage() {
  const { data: settings, isLoading, isError, error } = useDailyActionSummarySettings()
  const { data: logs = [] } = useDailyActionSummaryLogs(8)
  const { data: users = [] } = useUsers({ activo: true })
  const updateSettings = useUpdateDailyActionSummarySettings()
  const sendTest = useSendDailyActionSummaryTest()
  const [draft, setDraft] = useState<UpdateDailyActionSummarySettingsInput>(defaultDraft)
  const [testEmail, setTestEmail] = useState('')

  useEffect(() => {
    if (settings) setDraft(settingsToDraft(settings))
  }, [settings])

  const selectedUsers = useMemo(
    () => users.filter((user) => draft.selected_usuario_ids.includes(user.id)),
    [draft.selected_usuario_ids, users]
  )
  const meta = statusMeta(settings?.last_status)
  const schedulerMeta = schedulerStatusMeta(settings?.scheduler_last_status)
  const isSelectedMode = draft.recipient_mode === 'selected'

  const updateDraft = <K extends keyof UpdateDailyActionSummarySettingsInput>(
    key: K,
    value: UpdateDailyActionSummarySettingsInput[K]
  ) => setDraft((current) => ({ ...current, [key]: value }))

  const toggleSelectedUser = (id: string, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      selected_usuario_ids: checked
        ? [...new Set([...current.selected_usuario_ids, id])]
        : current.selected_usuario_ids.filter((userId) => userId !== id),
    }))
  }

  const handleSave = async () => {
    if (!draft.timezone.trim()) {
      toast.error('Indica una zona horaria valida.')
      return
    }
    if (draft.recipient_mode === 'selected' && draft.selected_usuario_ids.length === 0) {
      toast.error('Selecciona al menos un usuario destinatario.')
      return
    }

    try {
      await updateSettings.mutateAsync(draft)
      toast.success('Resumen diario actualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la configuracion.')
    }
  }

  const handleSendTest = async () => {
    const email = testEmail.trim()
    if (email && !EMAIL_PATTERN.test(email)) {
      toast.error('Indica un correo de prueba valido.')
      return
    }

    try {
      await sendTest.mutateAsync(email || undefined)
      toast.success('Correo de prueba solicitado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar el correo de prueba.')
    }
  }

  return (
    <SettingsPageShell width="wide" className="space-y-6">
      <SettingsPageHeader
        eyebrow="Recordatorios automaticos"
        title="Resumen diario de acciones"
        description="Envia automaticamente a los usuarios un resumen de acciones criticas, atrasadas y pendientes del dia."
      />

      {isError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'No se pudo cargar la configuracion.'}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  Resumen diario de acciones
                </CardTitle>
                <CardDescription>
                  Configura horario, destinatarios y reglas del correo ejecutivo individual.
                </CardDescription>
              </div>
              <Badge variant={draft.enabled ? 'success' : 'muted'}>
                {draft.enabled ? 'Resumen diario activo' : 'Resumen diario inactivo'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium">Activar resumen diario</span>
                <span className="block text-xs text-muted-foreground">El scheduler enviara correos en la ventana configurada.</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary"
                checked={draft.enabled}
                disabled={isLoading}
                onChange={(event) => updateDraft('enabled', event.target.checked)}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="daily-summary-time">Hora de envio</Label>
                <Input
                  id="daily-summary-time"
                  type="time"
                  value={draft.send_time}
                  onChange={(event) => updateDraft('send_time', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-summary-timezone">Zona horaria</Label>
                <Select value={draft.timezone} onValueChange={(value) => updateDraft('timezone', value)}>
                  <SelectTrigger id="daily-summary-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map((timezone) => (
                      <SelectItem key={timezone} value={timezone}>
                        {timezone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="daily-summary-days">Dias de envio</Label>
                <Select
                  value={draft.send_days}
                  onValueChange={(value) => updateDraft('send_days', value as DailySummarySendDays)}
                >
                  <SelectTrigger id="daily-summary-days">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEND_DAYS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="daily-summary-recipients">Destinatarios</Label>
                <Select
                  value={draft.recipient_mode}
                  onValueChange={(value) => updateDraft('recipient_mode', value as DailySummaryRecipientMode)}
                >
                  <SelectTrigger id="daily-summary-recipients">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECIPIENT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Enviar aunque no tenga pendientes</span>
                  <span className="block text-xs text-muted-foreground">Si esta apagado, se registra como sin pendientes.</span>
                </span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={draft.send_if_no_pending}
                  onChange={(event) => updateDraft('send_if_no_pending', event.target.checked)}
                />
              </label>
            </div>

            {isSelectedMode ? (
              <section className="space-y-3 rounded-lg border border-border/60 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Usuarios seleccionados</h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedUsers.length} destinatarios activos seleccionados
                    </p>
                  </div>
                </div>
                <div className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {users.map((user) => (
                    <label
                      key={user.id}
                      className="flex min-w-0 items-center gap-3 rounded-md border border-border/50 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-primary"
                        checked={draft.selected_usuario_ids.includes(user.id)}
                        onChange={(event) => toggleSelectedUser(user.id, event.target.checked)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{user.nombre}</span>
                        <span className="block truncate text-xs text-muted-foreground">{user.rol}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="grid gap-3 border-t border-border/60 pt-4 lg:grid-cols-[minmax(220px,1fr)_auto_auto] lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="daily-summary-test-email">Correo de prueba</Label>
                <Input
                  id="daily-summary-test-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="correo@empresa.com"
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleSendTest}
                disabled={sendTest.isPending || updateSettings.isPending}
              >
                <Send className="h-4 w-4" />
                {sendTest.isPending ? 'Enviando prueba...' : 'Enviar prueba'}
              </Button>
              <Button type="button" onClick={handleSave} disabled={updateSettings.isPending || isLoading}>
                <Save className="h-4 w-4" />
                {updateSettings.isPending ? 'Guardando...' : 'Guardar configuracion'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-primary" />
                Estado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Badge variant={meta.variant}>{meta.label}</Badge>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{formatDateTime(settings?.last_run_at)}</p>
                {settings?.last_message ? (
                  <p className="text-muted-foreground">{settings.last_message}</p>
                ) : null}
              </div>
              <div className="border-t border-border/60 pt-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Scheduler
                  </span>
                  <Badge variant={schedulerMeta.variant}>{schedulerMeta.label}</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">
                    {formatDateTime(settings?.scheduler_last_checked_at)}
                  </p>
                  {settings?.scheduler_last_message ? (
                    <p className="text-muted-foreground">{settings.scheduler_last_message}</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MailCheck className="h-4 w-4 text-primary" />
                Ultimos logs
              </CardTitle>
              <CardDescription>Diagnostico de envios y omisiones.</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin registros todavia.</p>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{logStatusLabel(log.status)}</span>
                        <Badge variant={log.status === 'sent' ? 'success' : log.status === 'error' ? 'destructive' : 'muted'}>
                          {log.is_test ? 'Prueba' : log.target_date}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{log.email ?? 'Sin correo'}</p>
                      {log.error_message ? (
                        <p className="mt-1 text-xs text-destructive">{log.error_message}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SettingsPageShell>
  )
}
