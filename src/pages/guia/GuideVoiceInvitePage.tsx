import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { useRetellGuideCall } from '@/features/guide/hooks/useRetellGuideCall'

export function GuideVoiceInvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const landingHref = useMemo(
    () => ROUTES.GUIA_INVITACION.replace(':token', encodeURIComponent(token)),
    [token]
  )

  const retell = useRetellGuideCall({
    guideToken: token,
    onError: (message) => setError(message),
    onRemoteEnded: () => {
      setError(null)
    },
  })

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Guía · voz
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Sesión de voz</h1>
        <p className="text-sm text-muted-foreground">
          Duración máxima 15 minutos. Al terminar puedes volver a la invitación.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Estado:{' '}
          <span className="font-medium text-foreground">
            {retell.status === 'idle'
              ? 'Listo'
              : retell.status === 'connecting'
                ? 'Conectando…'
                : retell.status === 'connected'
                  ? retell.agentTalking
                    ? 'Asistente hablando'
                    : 'En llamada'
                  : retell.status === 'ended'
                    ? 'Finalizada'
                    : 'Error'}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {retell.status === 'idle' || retell.status === 'ended' || retell.status === 'error' ? (
            <Button
              type="button"
              onClick={() => {
                setError(null)
                void retell.start().catch((err) => {
                  setError(err instanceof Error ? err.message : 'No se pudo iniciar la voz.')
                })
              }}
            >
              Iniciar llamada
            </Button>
          ) : (
            <Button type="button" variant="destructive" onClick={() => retell.stop()}>
              Colgar
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => navigate(landingHref)}>
            Volver a la invitación
          </Button>
        </div>
        {retell.messages.length > 0 ? (
          <ul className="max-h-64 space-y-2 overflow-auto text-sm">
            {retell.messages.map((message) => (
              <li key={message.id} className="rounded-md bg-muted/40 px-2 py-1.5">
                <span className="font-medium">
                  {message.role === 'user' ? 'Tú' : 'Guía'}:{' '}
                </span>
                {message.content}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="text-xs text-muted-foreground">
        <Link className="underline" to={ROUTES.LOGIN}>
          Ir al inicio de sesión
        </Link>
      </p>
    </main>
  )
}
