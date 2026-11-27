import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getAssistantAuthHeaders } from '@/lib/assistantApiAuth'
import { supabase } from '@/lib/supabase/client'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { isAppSuperAdminByAppRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'
import { useCurrentUser } from '@/features/users/hooks'

const SETTINGS_KEY = ['whatsapp-proactive-global'] as const

export function ProactiveFollowupGlobalCard() {
  const { data: appRole } = useAppRole()
  const { data: currentUser } = useCurrentUser()
  const isSuperAdmin = isAppSuperAdminByAppRole(appRole) || isSuperAdminByRole(currentUser?.rol)
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_followup_settings')
        .select('proactive_enabled')
        .eq('id', 'default')
        .maybeSingle()
      if (error) throw error
      return { proactiveEnabled: data?.proactive_enabled === true }
    },
  })
  const forceOff = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('whatsapp_followup_settings')
        .update({ proactive_enabled: false })
        .eq('id', 'default')
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: SETTINGS_KEY })
      toast.success('Envíos proactivos desactivados')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo desactivar'),
  })
  const dryRun = useMutation({
    mutationFn: async () => {
      const headers = await getAssistantAuthHeaders()
      const response = await fetch('/api/whatsapp-proactive-planner', { method: 'POST', headers })
      const data = (await response.json().catch(() => ({}))) as {
        error?: string
        dryRun?: boolean
        insertedJobs?: number
        candidates?: number
        wouldSend?: number
        logged?: number
        grouped?: Array<{
          usuarioId: string
          allowed: boolean
          includedCount: number
          suppressedCount: number
          suppressedReasons: string[]
          preview: string | null
          missingConsent?: boolean
        }>
      }
      if (!response.ok) throw new Error(data.error || `http_${response.status}`)
      return data
    },
    onSuccess: (data) => {
      toast.success(
        `Dry-run agrupado: ${data.candidates ?? 0} candidatos, ${data.wouldSend ?? 0} resúmenes, ${data.insertedJobs ?? 0} jobs.`
      )
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo evaluar'),
  })

  if (!isSuperAdmin) return null

  const enabled = query.data?.proactiveEnabled === true
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldAlert className="h-4 w-4" aria-hidden />
          Envíos proactivos (global)
        </CardTitle>
        <CardDescription>
          Kill switch de envíos automáticos. Permanece apagado: el planner solo evalúa en seco y no
          encola WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <p className="w-full text-xs text-muted-foreground">
          Estado: {enabled ? 'ENCENDIDO (no autorizado en este ciclo)' : 'OFF'}
        </p>
        <Button type="button" variant="outline" disabled={forceOff.isPending || !enabled} onClick={() => forceOff.mutate()}>
          Forzar OFF
        </Button>
        <Button type="button" disabled={dryRun.isPending} onClick={() => dryRun.mutate()}>
          {dryRun.isPending ? 'Evaluando…' : 'Evaluar en seco'}
        </Button>
        {dryRun.data?.grouped?.length ? (
          <ul className="w-full space-y-2 text-xs text-muted-foreground">
            {dryRun.data.grouped.slice(0, 6).map((row) => (
              <li key={row.usuarioId} className="rounded-md border border-border/60 p-2">
                <p>
                  {row.usuarioId.slice(0, 8)}… · {row.allowed ? 'resumen' : 'suprimido'} · incl.{' '}
                  {row.includedCount} · omit. {row.suppressedCount}
                  {row.suppressedReasons.length ? ` (${row.suppressedReasons.join(', ')})` : ''}
                </p>
                {row.preview ? <p className="mt-1 whitespace-pre-wrap text-foreground">{row.preview}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
