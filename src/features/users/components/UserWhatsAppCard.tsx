import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { whatsappIntegrationService } from '@/services/whatsappIntegration.service'

const identityKey = (usuarioId: string) => ['whatsapp-identity', usuarioId] as const

type Props = {
  usuarioId: string
  userNombre: string
  canManage: boolean
}

/** Normaliza a digitos; si son 10 (MX local) antepone 52. */
function normalizeWhatsAppPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `52${digits}`
  return digits
}

function formatPhoneHint(digits: string): string {
  if (!digits) return ''
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
  }
  return `+${digits}`
}

export function UserWhatsAppCard({ usuarioId, userNombre, canManage }: Props) {
  const qc = useQueryClient()
  const { data: identity, isLoading } = useQuery({
    queryKey: identityKey(usuarioId),
    queryFn: () => whatsappIntegrationService.getIdentity(usuarioId),
    enabled: Boolean(usuarioId),
  })

  const [phone, setPhone] = useState('')
  const [displayName, setDisplayName] = useState('')

  useEffect(() => {
    setPhone(identity?.external_user_id ?? '')
    setDisplayName(identity?.display_name ?? '')
  }, [identity?.external_user_id, identity?.display_name])

  const normalized = useMemo(() => normalizeWhatsAppPhone(phone), [phone])
  const canSave = normalized.length >= 10 && normalized.length <= 15
  const isLinked = Boolean(identity?.external_user_id && identity.status === 'active')

  const save = useMutation({
    mutationFn: () =>
      whatsappIntegrationService.upsertIdentity({
        usuarioId,
        phone: normalized,
        displayName: displayName || userNombre,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: identityKey(usuarioId) })
      toast.success('Celular / WhatsApp guardado')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el número')
    },
  })

  const clear = useMutation({
    mutationFn: () => whatsappIntegrationService.clearIdentity(usuarioId),
    onSuccess: async () => {
      setPhone('')
      setDisplayName('')
      await qc.invalidateQueries({ queryKey: identityKey(usuarioId) })
      toast.success('WhatsApp desvinculado')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo desvincular')
    },
  })

  const busy = save.isPending || clear.isPending

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4" aria-hidden />
            Celular / WhatsApp
          </CardTitle>
          {isLinked ? (
            <Badge variant="success">Vinculado</Badge>
          ) : (
            <Badge variant="muted">Sin número</Badge>
          )}
        </div>
        <CardDescription>
          Número para notificaciones y seguimientos por WhatsApp Cloud API. Usa código de país
          (México: 52). Ejemplo: <span className="font-mono">5511981149</span> o{' '}
          <span className="font-mono">525511981149</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`wa-phone-${usuarioId}`}>Número celular</Label>
                <Input
                  id={`wa-phone-${usuarioId}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="55 1198 1149"
                  disabled={!canManage || busy}
                  inputMode="tel"
                  autoComplete="tel"
                />
                {normalized ? (
                  <p className="text-[11px] text-muted-foreground">
                    Se guardará como{' '}
                    <span className="font-mono">{formatPhoneHint(normalized)}</span>
                    {!canSave ? ' (revisa la longitud)' : ''}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`wa-name-${usuarioId}`}>Nombre en WhatsApp (opcional)</Label>
                <Input
                  id={`wa-name-${usuarioId}`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={userNombre}
                  disabled={!canManage || busy}
                />
              </div>
            </div>

            {identity?.last_seen_at ? (
              <p className="text-xs text-muted-foreground">
                Última actividad WhatsApp:{' '}
                {new Date(identity.last_seen_at).toLocaleString('es-MX')}
              </p>
            ) : null}

            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => save.mutate()}
                  disabled={busy || !canSave}
                >
                  {save.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando…
                    </>
                  ) : isLinked ? (
                    'Actualizar número'
                  ) : (
                    'Guardar número'
                  )}
                </Button>
                {isLinked ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => clear.mutate()}
                    disabled={busy}
                  >
                    {clear.isPending ? 'Quitando…' : 'Quitar vínculo'}
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isLinked
                  ? `Número vinculado: ${formatPhoneHint(identity?.external_user_id ?? '')}`
                  : 'Solo quien administra usuarios puede capturar el celular.'}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
