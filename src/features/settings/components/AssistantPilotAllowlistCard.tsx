import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { assistantPilotAllowlistService } from '@/services/assistantPilotAllowlist.service'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { isAppSuperAdminByAppRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'
import { useCurrentUser } from '@/features/users/hooks'

const QUERY_KEY = ['assistant-pilot-allowlist'] as const

export function AssistantPilotAllowlistCard() {
  const { data: appRole } = useAppRole()
  const { data: currentUser } = useCurrentUser()
  const isSuperAdmin = isAppSuperAdminByAppRole(appRole) || isSuperAdminByRole(currentUser?.rol)
  const qc = useQueryClient()
  const [usuarioId, setUsuarioId] = useState('')
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => assistantPilotAllowlistService.get(),
    enabled: isSuperAdmin,
  })
  const mutate = useMutation({
    mutationFn: ({ action, id }: { action: 'add' | 'remove'; id: string }) =>
      assistantPilotAllowlistService.update(action, id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QUERY_KEY })
      setUsuarioId('')
      toast.success('Piloto actualizado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo actualizar el piloto'),
  })

  if (!isSuperAdmin) return null

  const ids = query.data?.usuarioIds ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="h-4 w-4" aria-hidden />
          Piloto R2 / WhatsApp / R3
        </CardTitle>
        <CardDescription>
          Allowlist canónica (`agent_execution_gate`). Quitar un UUID revierte de inmediato. Añadir no activa a
          nadie si las listas env de Vercel siguen cerradas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Puerta {query.data?.enabled ? 'habilitada' : 'apagada'} · {ids.length} usuario(s)
        </p>
        <p className="text-xs text-muted-foreground">
          Capacidades: R2 {query.data?.capabilities?.r2Mode ?? '—'}
          {query.data?.capabilities?.r2Pilot ? ' (piloto)' : ''} · WhatsApp piloto{' '}
          {query.data?.capabilities?.whatsappPilot ? 'ON' : 'OFF'} · R3{' '}
          {query.data?.capabilities?.r3 ? 'ON' : 'OFF'} · envíos proactivos{' '}
          {query.data?.capabilities?.proactiveEnabled ? 'ON' : 'OFF'}
        </p>
        <p className="text-xs text-muted-foreground">
          Canales: web {query.data?.channels?.web ? 'ON' : 'OFF'} · WhatsApp{' '}
          {query.data?.channels?.whatsappPilot ? 'piloto' : 'legacy'} · global WhatsApp{' '}
          {query.data?.channels?.whatsappGlobal ? 'ON' : 'OFF'}
        </p>
        <p className="text-xs text-muted-foreground">
          Las variables de Vercel son kill switches. La cohorte se edita en BD. No añadir UUIDs en
          este ciclo.
        </p>
        <ul className="space-y-2">
          {ids.map((id) => {
            const user = query.data?.users.find((row) => row.id === id)
            return (
              <li key={id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {user?.nombre || id}
                  {user?.email ? ` · ${user.email}` : ''}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutate.isPending}
                  onClick={() => mutate.mutate({ action: 'remove', id })}
                >
                  Quitar
                </Button>
              </li>
            )
          })}
        </ul>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={usuarioId}
            onChange={(event) => setUsuarioId(event.target.value)}
            placeholder="UUID de usuario activo"
            className="font-mono text-xs"
          />
          <Button
            type="button"
            disabled={mutate.isPending || usuarioId.trim().length < 32}
            onClick={() => mutate.mutate({ action: 'add', id: usuarioId.trim() })}
          >
            Añadir
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
