import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SettingsPageHeader } from '@/components/layout/SettingsPageHeader'
import { SettingsPageShell } from '@/components/layout/SettingsPageShell'
import {
  whatsappIntegrationService,
  type UpdateWhatsAppFollowupSettingsInput,
  type WhatsAppFollowupSettings,
} from '@/services/whatsappIntegration.service'

const QUERY_KEY = ['whatsapp-followup-settings'] as const

const TEMPLATE_VARS = [
  'responsable_nombre',
  'titulo_accion',
  'fecha_compromiso',
  'checklist_bloque',
  'checkpoint_texto',
] as const

const SAMPLE: Record<(typeof TEMPLATE_VARS)[number], string> = {
  responsable_nombre: 'Ana Pérez',
  titulo_accion: 'Cerrar conciliación O2C',
  fecha_compromiso: '2026-11-05',
  checklist_bloque: '\nChecklist pendiente:\n1. Validar facturas\n2. Subir evidencia',
  checkpoint_texto: 'Validar facturas',
}

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

function TemplateEditor({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const preview = useMemo(() => renderPreview(value), [value])
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_VARS.map((token) => (
            <Button
              key={`${id}-${token}`}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => onChange(`${value}{{${token}}}`)}
            >
              {`{{${token}}}`}
            </Button>
          ))}
        </div>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="flex min-h-[6rem] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        <p className="text-[11px] font-medium text-muted-foreground">Preview</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{preview || '—'}</p>
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

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        title="WhatsApp"
        description="Retrasos de seguimiento y plantillas de texto para Cloud API (corporativo y equipos)."
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando configuración…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'No se pudo cargar la configuración'}
        </p>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seguimientos automáticos</CardTitle>
              <CardDescription>
                Tras el envío inicial (corporate) se programan N jobs a nivel acción con botones
                act:. El followup manual por checkpoint sigue usando chk:. Team usa tchk: por ítem.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wa-delay">Delay entre seguimientos (minutos)</Label>
                <Input
                  id="wa-delay"
                  type="number"
                  min={1}
                  max={240}
                  value={draft.followup_delay_minutes}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      followup_delay_minutes: Math.min(240, Math.max(1, Number(e.target.value) || 1)),
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-per-day">Seguimientos por día (0–12)</Label>
                <Input
                  id="wa-per-day"
                  type="number"
                  min={0}
                  max={12}
                  value={draft.followups_per_day}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      followups_per_day: Math.min(12, Math.max(0, Number(e.target.value) || 0)),
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plantillas de texto</CardTitle>
              <CardDescription>
                Se usan dentro de la ventana de 24 h. Fuera de ventana el envío usa la plantilla Meta configurada en secrets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <TemplateEditor
                id="wa-initial"
                label="Mensaje inicial"
                value={draft.initial_text_template}
                onChange={(initial_text_template) => setDraft((prev) => ({ ...prev, initial_text_template }))}
              />
              <TemplateEditor
                id="wa-followup"
                label="Seguimiento de checkpoint"
                value={draft.checkpoint_followup_template}
                onChange={(checkpoint_followup_template) =>
                  setDraft((prev) => ({ ...prev, checkpoint_followup_template }))
                }
              />
              <TemplateEditor
                id="wa-close"
                label="Cierre de compromiso"
                value={draft.commitment_close_template}
                onChange={(commitment_close_template) =>
                  setDraft((prev) => ({ ...prev, commitment_close_template }))
                }
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-2 h-4 w-4" aria-hidden />
              {save.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      )}
    </SettingsPageShell>
  )
}
