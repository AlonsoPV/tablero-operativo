import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, Loader2, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { GuidePresence, useStageOrbSize } from '@/features/guide/components/GuidePresence'
import { guideService } from '@/features/guide/services/guide.service'
import { guideVoiceLoginState } from '@/features/guide/voiceLogin'
import { cn } from '@/lib/utils'

type LinkInfo = {
  user_name: string
  expires_at: string
  duration_minutes: number
}

function formatExpiry(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function readInviteToken(raw: string | undefined) {
  const value = (raw ?? '').trim()
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function PublicGuideInvitationPage() {
  const params = useParams()
  const token = readInviteToken(params.token)
  const navigate = useNavigate()
  const orbSize = useStageOrbSize(168, 212)
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
      if (!token) {
        setLoading(false)
        setError('Falta el token de la liga.')
        return
      }
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
  const minutes = info?.duration_minutes ?? 15
  const expiry = info ? formatExpiry(info.expires_at) : null

  return (
    <main className="relative min-h-dvh bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(90%_55%_at_50%_0%,hsl(var(--primary)/0.22),transparent_58%),radial-gradient(40%_35%_at_100%_100%,hsl(262_83%_58%/0.12),transparent_70%),linear-gradient(180deg,hsl(var(--muted)/0.45),hsl(var(--background))_42%)]"
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Guía · What2Do
          </p>
          <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-border/60">
            {minutes} min
          </span>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <GuidePresence
            mood={loading ? 'connecting' : 'idle'}
            size={orbSize}
            caption={loading ? 'Revisando tu liga…' : info ? `Hola, ${info.user_name}` : 'Guía'}
          />
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {loading ? 'Un momento' : info ? `Hola, ${info.user_name}` : 'Conversación por voz'}
          </h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {info
              ? `Una sesión de ${minutes} minutos con Guía, asociada a tu perfil. No necesitas iniciar sesión.`
              : 'Esta liga abre una conversación de voz con Guía. No necesitas iniciar sesión.'}
          </p>
        </section>

        {error ? (
          <p className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {info ? (
          <section className="space-y-3 rounded-[1.6rem] bg-background/80 p-3 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.55)] ring-1 ring-border/60 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 px-1.5 pt-1">
              <p className="text-sm">
                Perfil <span className="font-semibold">{info.user_name}</span>
              </p>
              {expiry ? <p className="text-[11px] text-muted-foreground">Hasta {expiry}</p> : null}
            </div>

            <ConsentRow
              checked={confirmIdentity}
              onChange={setConfirmIdentity}
              title={`Soy ${info.user_name}`}
              detail="Confirmo que esta liga es para mí."
            />
            <ConsentRow
              checked={consent}
              onChange={setConsent}
              title="Micrófono y transcripción"
              detail="Acepto grabar y transcribir esta conversación."
            />

            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-[auto_1fr]">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full"
                disabled={micBusy}
                onClick={() => void testMic()}
              >
                {micBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : micOk ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden />
                )}
                {micOk ? 'Micrófono listo' : 'Probar micrófono'}
              </Button>
              <Button
                type="button"
                className="h-11 rounded-full"
                disabled={!canStart}
                onClick={() =>
                  navigate(ROUTES.GUIA_INVITACION_VOZ.replace(':token', encodeURIComponent(token)))
                }
              >
                Comenzar conversación
              </Button>
            </div>
            {!canStart ? (
              <p className="px-1.5 pb-1 text-center text-[11px] text-muted-foreground">
                Confirma tu identidad y el uso del micrófono para entrar.
              </p>
            ) : null}
          </section>
        ) : loading ? (
          <p className="text-center text-sm text-muted-foreground">Validando liga…</p>
        ) : null}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={ROUTES.LOGIN}
            state={guideVoiceLoginState}
          >
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  )
}

function ConsentRow({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  title: string
  detail: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 text-left ring-1 transition',
        checked ? 'bg-primary/10 ring-primary/30' : 'bg-muted/30 ring-transparent hover:bg-muted/50'
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
    </label>
  )
}
