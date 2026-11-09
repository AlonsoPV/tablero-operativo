import { useState } from 'react'
import { Copy, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { guideService } from '@/features/guide/services/guide.service'
import { useAuth } from '@/features/auth/hooks/useAuth'

export function GuidePersonalLinkButton({
  compact = false,
  usuarioId,
}: {
  compact?: boolean
  /** Si se omite, crea liga para el usuario actual. */
  usuarioId?: string
}) {
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)

  async function createLink() {
    const targetId = usuarioId || profile?.id
    if (!targetId) {
      setError('No hay usuario para generar la liga.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await guideService.createUserLink(targetId, 30)
      setLink(created.link)
      setExpiresAt(created.expires_at)
      try {
        await navigator.clipboard.writeText(created.link)
      } catch {
        /* clipboard opcional */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la liga.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size={compact ? 'sm' : 'default'}
        variant="outline"
        disabled={busy}
        onClick={() => void createLink()}
      >
        <Link2 className="mr-2 h-4 w-4" aria-hidden />
        {compact ? 'Mi liga' : 'Obtener mi liga'}
      </Button>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}

      <AlertDialog open={Boolean(link)} onOpenChange={(open) => !open && setLink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Liga personal de Guía</AlertDialogTitle>
            <AlertDialogDescription>
              Compártela solo con quien deba hablar como este perfil. Vigencia hasta{' '}
              {expiresAt ? new Date(expiresAt).toLocaleString('es-MX') : '—'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-all rounded-md bg-muted px-3 py-2 text-xs">{link}</p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (link) void navigator.clipboard.writeText(link)
              }}
            >
              <Copy className="mr-2 h-4 w-4" aria-hidden />
              Copiar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
