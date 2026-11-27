import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { useCurrentUser } from '@/features/users/hooks'

const QUERY_KEY = ['whatsapp-proactive-preferences'] as const

export function ProactiveFollowupConsentCard() {
  const { data: currentUser } = useCurrentUser()
  const usuarioId = currentUser?.id
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: [...QUERY_KEY, usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_proactive_preferences')
        .select('consent')
        .eq('usuario_id', usuarioId!)
        .maybeSingle()
      if (error) throw error
      return { consent: data?.consent === true }
    },
  })
  const mutate = useMutation({
    mutationFn: async (consent: boolean) => {
      if (!usuarioId) throw new Error('Sesión no disponible')
      const { error } = await supabase.from('whatsapp_proactive_preferences').upsert({
        usuario_id: usuarioId,
        consent,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <BellOff className="h-4 w-4" aria-hidden />
          Seguimiento proactivo
        </CardTitle>
        <CardDescription>
          Los envíos automáticos siguen desactivados. Esta preferencia guarda consentimiento y permite
          desactivar futuras alertas cuando se autorice el canal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={query.data?.consent ? 'default' : 'outline'}
          disabled={mutate.isPending || !usuarioId}
          onClick={() => mutate.mutate(true)}
        >
          Autorizar alertas
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={mutate.isPending || !usuarioId}
          onClick={() => mutate.mutate(false)}
        >
          Desactivar
        </Button>
      </CardContent>
    </Card>
  )
}
