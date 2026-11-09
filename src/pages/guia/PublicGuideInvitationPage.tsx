import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { guideService } from '@/features/guide/services/guide.service'

type LinkInfo = {
  user_name: string
  expires_at: string
  duration_minutes: number
}

export function PublicGuideInvitationPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [confirmIdentity, setConfirmIdentity] = useState(false)
  const [consent, setConsent] = useState(false)
  const [micOk, setMicOk] = useState(false)
  const [micBusy, setMicBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await guideService.validateUserLink(token, true)
        if (cancelled) return
        setInfo({
          user_name: result.user_name,
          expires_at: result.expires_at,
          duration_minutes: result.duration_minutes,
        })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'No se pudo validar la liga.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  async function testMic() {
    setMicBusy(true)
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setMicOk(true)
    } catch {
      setMicOk(false)
      setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
    } finally {
      setMicBusy(false)
    }
  }

  const canStart = Boolean(info && confirmIdentity && consent)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Guía · Scrumban
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Conversación por voz</h1>
        <p className="text-sm text-muted-foreground">
          Esta liga abre una sesión de {info?.duration_minutes ?? 15} minutos asociada al perfil
          dueño. No necesitas iniciar sesión en What2Do.
        </p>
      </header>

      {loading ? <p className="text-sm text-muted-foreground">Validando liga…</p> : null}
      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {info ? (
        <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
          <p className="text-sm">
            Perfil: <span className="font-semibold">{info.user_name}</span>
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmIdentity}
              onChange={(event) => setConfirmIdentity(event.target.checked)}
            />
            <span>Confirmo que soy {info.user_name}.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              Acepto el uso de micrófono, grabación y transcripción para esta conversación de voz.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={micBusy} onClick={() => void testMic()}>
              {micOk ? 'Micrófono listo' : 'Probar micrófono'}
            </Button>
            <Button
              type="button"
              disabled={!canStart}
              onClick={() =>
                navigate(ROUTES.GUIA_INVITACION_VOZ.replace(':token', encodeURIComponent(token)))
              }
            >
              Comenzar conversación
            </Button>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link className="underline" to={ROUTES.LOGIN}>
          Inicia sesión
        </Link>
      </p>
    </main>
  )
}
