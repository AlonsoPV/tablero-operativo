import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileStack } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { assistantDocumentsService } from '@/services/assistantDocuments.service'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { isAppSuperAdminByAppRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'
import { useCurrentUser } from '@/features/users/hooks'

const QUERY_KEY = ['assistant-r3-documents'] as const

export function AssistantDocumentsCard() {
  const { data: appRole } = useAppRole()
  const { data: currentUser } = useCurrentUser()
  const isSuperAdmin = isAppSuperAdminByAppRole(appRole) || isSuperAdminByRole(currentUser?.rol)
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [sourceLabel, setSourceLabel] = useState('sop-piloto')
  const [body, setBody] = useState('')
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => assistantDocumentsService.list(),
    enabled: isSuperAdmin,
  })
  const publish = useMutation({
    mutationFn: () =>
      assistantDocumentsService.publish({
        title,
        body,
        sourceLabel,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QUERY_KEY })
      setTitle('')
      setBody('')
      toast.success('Documento publicado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo publicar'),
  })
  const withdraw = useMutation({
    mutationFn: (logicalId: string) => assistantDocumentsService.withdraw(logicalId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: QUERY_KEY })
      toast.success('Documento retirado')
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo retirar'),
  })

  if (!isSuperAdmin) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <FileStack className="h-4 w-4" aria-hidden />
          Documentos R3
        </CardTitle>
        <CardDescription>
          Publica procedimientos autorizados para consulta con cita. Retirar deja el recall vacío. R3
          sigue limitado al piloto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {(query.data ?? []).slice(0, 8).map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{row.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.sourceLabel} · v{row.version} · {row.status}
                </span>
              </span>
              {row.status === 'published' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={withdraw.isPending}
                  onClick={() => withdraw.mutate(row.logicalId)}
                >
                  Retirar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título del SOP" />
        <Input
          value={sourceLabel}
          onChange={(event) => setSourceLabel(event.target.value)}
          placeholder="Etiqueta (p. ej. sop-piloto)"
        />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Cuerpo del procedimiento (sin datos confidenciales)"
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button
          type="button"
          disabled={publish.isPending || title.trim().length < 3 || body.trim().length < 12}
          onClick={() => publish.mutate()}
        >
          Publicar
        </Button>
      </CardContent>
    </Card>
  )
}
