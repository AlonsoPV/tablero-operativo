import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, Check, Clock, Loader2, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { APP_NAME, ROUTES } from '@/constants'
import {
  GuideInviteMetaChip,
  GuideInviteShell,
} from '@/features/guide/components/GuideInviteShell'
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
  const orbSize = useStageOrbSize(148, 188)
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
  const showActions = Boolean(info) && !loading
  const unavailable = !loading && !info

  return (
    <GuideInviteShell
      meta={
        info ? (
          <GuideInviteMetaChip>
            <Clock className="mr-1.5 h-3 w-3" aria-hidden />
            {minutes} min
          </GuideInviteMetaChip>
        ) : null
      }
      contentClassName="mx-auto w-full max-w-md px-5 pb-8 pt-2 sm:pb-10"
    >
      <section
        className={cn(
          'flex flex-col items-center text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500',
          unavailable || loading ? 'flex-1 justify-center py-6' : 'pt-4 pb-5'
        )}
      >
        <GuidePresence
          mood={loading ? 'connecting' : unavailable ? 'muted' : 'idle'}
          size={orbSize}
          showCaption={loading}
          caption={loading ? 'Revisando tu liga…' : undefined}
        />

        <h1 className="mt-2 max-w-[18rem] text-balance text-2xl font-semibold tracking-tight sm:max-w-none sm:text-[1.7rem]">
          {loading
            ? 'Un momento'
            : info
              ? `Hola, ${info.user_name}`
              : 'Liga no disponible'}
        </h1>
        <p className="mt-1.5 max-w-sm text-pretty text-sm leading-6 text-muted-foreground">
          {info
            ? `Una sesión de ${minutes} minutos con Guía, asociada a tu perfil. No necesitas iniciar sesión.`
            : unavailable
              ? error ||
                'Esta invitación no se pudo abrir. Pide una liga nueva o entra con tu cuenta.'
              : `Esta liga abre una conversación de voz con Guía en ${APP_NAME}.`}
        </p>
      </section>

      {error && info ? (
        <div
          className="mb-4 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.07] px-3.5 py-3 text-left text-sm text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium leading-snug">{error}</p>
        </div>
      ) : null}

      {showActions ? (
        <section className="space-y-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-500">
          <div className="flex items-center justify-between gap-3 px-0.5">
            <p className="text-sm text-muted-foreground">
              Perfil <span className="font-semibold text-foreground">{info!.user_name}</span>
            </p>
            {expiry ? (
              <p className="text-[11px] tabular-nums text-muted-foreground">Hasta {expiry}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <ConsentRow
              checked={confirmIdentity}
              onChange={setConfirmIdentity}
              title={`Soy ${info!.user_name}`}
              detail="Confirmo que esta liga es para mí."
            />
            <ConsentRow
              checked={consent}
              onChange={setConsent}
              title="Micrófono y transcripción"
              detail="Acepto grabar y transcribir esta conversación."
            />
          </div>

          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-[auto_1fr]">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl"
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
              className={cn(
                'h-11 rounded-xl transition-shadow',
                canStart && 'shadow-[0_14px_28px_-18px_hsl(var(--primary)/0.85)]'
              )}
              disabled={!canStart}
              onClick={() =>
                navigate(ROUTES.GUIA_INVITACION_VOZ.replace(':token', encodeURIComponent(token)))
              }
            >
              Comenzar conversación
            </Button>
          </div>
          {!canStart ? (
            <p className="px-0.5 text-center text-[11px] leading-5 text-muted-foreground">
              Confirma tu identidad y el uso del micrófono para entrar.
            </p>
          ) : null}
        </section>
      ) : null}

      {unavailable ? (
        <div className="flex flex-col items-center gap-3">
          <Button asChild className="h-11 rounded-xl px-6">
            <Link to={ROUTES.LOGIN} state={guideVoiceLoginState}>
              Ir al inicio de sesión
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Si te compartieron esta liga por WhatsApp, pide una nueva.
          </p>
        </div>
      ) : (
        <p className="mt-auto pt-8 text-center text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{' '}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={ROUTES.LOGIN}
            state={guideVoiceLoginState}
          >
            Inicia sesión
          </Link>
        </p>
      )}
    </GuideInviteShell>
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
        'flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3.5 text-left ring-1 transition-colors',
        checked
          ? 'bg-primary/[0.08] ring-primary/25'
          : 'bg-background/70 ring-border/60 hover:bg-muted/40'
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
