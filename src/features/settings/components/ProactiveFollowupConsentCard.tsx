import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase/client'
import { useCurrentUser } from '@/features/users/hooks'

const QUERY_KEY = ['whatsapp-proactive-preferences'] as const
const CATEGORIES = [
  { id: 'overdue_alert', label: 'Vencidas' },
  { id: 'stale_blocker', label: 'Bloqueos' },
  { id: 'pending_verification', label: 'Verificación' },
  { id: 'daily_summary', label: 'Resumen diario' },
] as const

type Prefs = {
  consent: boolean
  windowStartHour: number
  windowEndHour: number
  maxPerDay: number
  enabledCategories: string[]
}

const DEFAULT_PREFS: Prefs = {
  consent: false,
  windowStartHour: 8,
  windowEndHour: 19,
  maxPerDay: 3,
  enabledCategories: ['overdue_alert', 'stale_blocker', 'pending_verification', 'daily_summary'],
}

export function ProactiveFollowupConsentCard() {
  const { data: currentUser } = useCurrentUser()
  const usuarioId = currentUser?.id
  const qc = useQueryClient()
  const [draft, setDraft] = useState<Prefs>(DEFAULT_PREFS)
  const query = useQuery({
    queryKey: [...QUERY_KEY, usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_proactive_preferences')
        .select('consent,window_start_hour,window_end_hour,max_per_day,enabled_categories')
        .eq('usuario_id', usuarioId!)
        .maybeSingle()
      if (error) throw error
      return {
        consent: data?.consent === true,
        windowStartHour: data?.window_start_hour ?? 8,
        windowEndHour: data?.window_end_hour ?? 19,
        maxPerDay: data?.max_per_day ?? 3,
        enabledCategories: Array.isArray(data?.enabled_categories)
          ? data.enabled_categories.map(String)
          : DEFAULT_PREFS.enabledCategories,
      } satisfies Prefs
    },
  })
  useEffect(() => {
    if (query.data) setDraft(query.data)
  }, [query.data])

  const mutate = useMutation({
    mutationFn: async (next: Prefs) => {
      if (!usuarioId) throw new Error('Sesión no disponible')
      const { error } = await supabase.from('whatsapp_proactive_preferences').upsert({
        usuario_id: usuarioId,
        consent: next.consent,
        window_start_hour: next.windowStartHour,
        window_end_hour: next.windowEndHour,
        max_per_day: next.maxPerDay,
        enabled_categories: next.enabledCategories,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Preferencia de seguimiento actualizada')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar'),
  })

  const toggleCategory = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      enabledCategories: prev.enabledCategories.includes(id)
        ? prev.enabledCategories.filter((item) => item !== id)
        : [...prev.enabledCategories, id],
    }))
  }

  const preview = [
    `Seguimiento SCRUMBAN (vista previa, envíos OFF):`,
    draft.enabledCategories.includes('stale_blocker') ? '1) alerta de bloqueo prolongado' : null,
    draft.enabledCategories.includes('overdue_alert') ? '2) alerta de acción vencida' : null,
    `Ventana ${draft.windowStartHour}:00–${draft.windowEndHour}:00 · tope ${draft.maxPerDay}/día · consentimiento ${draft.consent ? 'sí' : 'no'}`,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <BellOff className="h-4 w-4" aria-hidden />
          Seguimiento proactivo
        </CardTitle>
        <CardDescription>
          Los envíos automáticos siguen desactivados. Guarda consentimiento, ventana y tope para cuando
          se autorice el canal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={draft.consent ? 'default' : 'outline'}
            disabled={mutate.isPending || !usuarioId}
            onClick={() => {
              const next = { ...draft, consent: true }
              setDraft(next)
              mutate.mutate(next)
            }}
          >
            Autorizar alertas
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mutate.isPending || !usuarioId}
            onClick={() => {
              const next = { ...draft, consent: false }
              setDraft(next)
              mutate.mutate(next)
            }}
          >
            Desactivar
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-muted-foreground">
            Desde
            <Input
              type="number"
              min={0}
              max={23}
              value={draft.windowStartHour}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, windowStartHour: Number(event.target.value) || 0 }))
              }
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Hasta
            <Input
              type="number"
              min={1}
              max={24}
              value={draft.windowEndHour}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, windowEndHour: Number(event.target.value) || 19 }))
              }
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            Tope / día
            <Input
              type="number"
              min={0}
              max={12}
              value={draft.maxPerDay}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, maxPerDay: Number(event.target.value) || 0 }))
              }
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => (
            <Button
              key={category.id}
              type="button"
              size="sm"
              variant={draft.enabledCategories.includes(category.id) ? 'default' : 'outline'}
              onClick={() => toggleCategory(category.id)}
            >
              {category.label}
            </Button>
          ))}
        </div>
        <pre className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">{preview}</pre>
        <Button type="button" variant="outline" disabled={mutate.isPending || !usuarioId} onClick={() => mutate.mutate(draft)}>
          Guardar preferencias
        </Button>
      </CardContent>
    </Card>
  )
}
