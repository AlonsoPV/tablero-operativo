import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  SectionCard,
  SectionCardBody,
  SectionCardHeader,
} from '@/components/SectionCard'
import {
  disconnectGoogleConnection,
  fetchGoogleConnectionStatus,
  startGoogleOAuth,
} from '../services/googleConnectionClient'

const statusKey = ['google-workspace-connection'] as const

export function UserGoogleCard() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const { data, isLoading } = useQuery({
    queryKey: statusKey,
    queryFn: fetchGoogleConnectionStatus,
  })

  useEffect(() => {
    const flag = searchParams.get('google')
    if (!flag) return
    if (flag === 'connected') toast.success('Google Workspace conectado.')
    else if (flag === 'denied') toast.error('No se concedio el acceso a Google.')
    else toast.error('No se pudo completar la conexion con Google.')
    const next = new URLSearchParams(searchParams)
    next.delete('google')
    next.delete('reason')
    setSearchParams(next, { replace: true })
    void qc.invalidateQueries({ queryKey: statusKey })
  }, [qc, searchParams, setSearchParams])

  const connect = useMutation({
    mutationFn: startGoogleOAuth,
    onSuccess: (url) => {
      window.location.href = url
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo conectar Google.')
    },
  })

  const disconnect = useMutation({
    mutationFn: disconnectGoogleConnection,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: statusKey })
      toast.success('Google Workspace desconectado.')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'No se pudo desconectar.')
    },
  })

  const connected = Boolean(data?.connected)
  const needsReauth = data?.status === 'needs_reauth'
  const busy = connect.isPending || disconnect.isPending

  return (
    <SectionCard>
      <SectionCardHeader title="Google Workspace" icon={Mail} />
      <SectionCardBody className="space-y-3 p-4 sm:p-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando conexion…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {connected ? (
                <Badge variant="success">Conectado</Badge>
              ) : needsReauth ? (
                <Badge variant="destructive">Reconectar</Badge>
              ) : (
                <Badge variant="muted">Sin conectar</Badge>
              )}
            </div>
            <p className="text-sm text-foreground">
              {data?.google_email || 'Ninguna cuenta de Google vinculada a tu usuario.'}
            </p>
            {data?.scope_labels?.length ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {data.scope_labels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Shaman usa tu Gmail y Calendar, no la cuenta de administracion del tablero.
                Lectura inmediata; envios y eventos solo despues de que confirmes.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                className="h-8"
                disabled={busy}
                onClick={() => connect.mutate()}
              >
                {connect.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                {connected ? 'Reconectar' : needsReauth ? 'Reconectar' : 'Conectar'}
              </Button>
              {connected || needsReauth ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busy}
                  onClick={() => disconnect.mutate()}
                >
                  Desconectar
                </Button>
              ) : null}
            </div>
          </>
        )}
      </SectionCardBody>
    </SectionCard>
  )
}
