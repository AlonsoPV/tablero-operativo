import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, LayoutDashboard, Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { APP_NAME, ROUTES } from '@/constants'
import {
  GuideInviteMetaChip,
  GuideInviteShell,
} from '@/features/guide/components/GuideInviteShell'
import {
  GuidePresence,
  useStageOrbSize,
  type GuideMood,
} from '@/features/guide/components/GuidePresence'
import { GuideReportActions } from '@/features/guide/components/GuideReportActions'
import { GuideReportBody } from '@/features/guide/components/GuideReportBody'
import { useRetellGuideCall } from '@/features/guide/hooks/useRetellGuideCall'
import { guideVoiceLoginState } from '@/features/guide/voiceLogin'
import { cn } from '@/lib/utils'

type LinkReport = {
  report_status?: string
  entry_id?: string | null
  topic?: string | null
  summary?: string | null
  learning?: string | null
  intention?: string | null
  reflection_question?: string | null
  agent_inferences?: string | null
  executive_report?: string | null
  created_at?: string | null
  ok?: boolean
  code?: string
  preview?: string
  phone?: string | null
  sent?: boolean
  error?: string
}

function statusLabel(status: string, muted: boolean) {
  if (status === 'connecting') return 'Conectando'
  if (status === 'connected') return muted ? 'En silencio' : 'En llamada'
  if (status === 'ended') return 'Terminada'
  if (status === 'error') return 'Error'
  return 'Lista'
}

export function GuideVoiceInvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const orbSize = useStageOrbSize(188, 248)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<LinkReport | null>(null)
  const [reportBusy, setReportBusy] = useState(false)
  const callIdRef = useRef('')
  const finalizedRef = useRef(false)
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

  const requestReport = async (action: 'status' | 'finalize' | 'retry' | 'whatsapp', confirm = false) => {
    const response = await fetch('/api/guide-link-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guide_token: token,
        action,
        call_id: callIdRef.current || undefined,
        confirm,
        messages: retell.messages.map((message) => ({ role: message.role, content: message.content })),
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as LinkReport
    if (!response.ok) throw new Error(payload.error || 'No se pudo leer el informe.')
    return payload
  }

  useEffect(() => {
    if (retell.status !== 'ended') return
    if (finalizedRef.current) return
    finalizedRef.current = true
    let cancelled = false
    setReportBusy(true)
    void requestReport('finalize')
      .then((payload) => {
        if (!cancelled) setReport(payload)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo generar el informe.')
      })
      .finally(() => {
        if (!cancelled) setReportBusy(false)
      })
    return () => {
      cancelled = true
    }
    // La transcripcion se lee al cerrar; no rehacer el informe en cada mensaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retell.status])

  useEffect(() => {
    const status = report?.report_status
    if (status !== 'pending' && status !== 'processing') return
    const timer = window.setInterval(() => {
      void requestReport('status')
        .then((payload) => setReport(payload))
        .catch(() => undefined)
    }, 3000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.report_status])

  const live = retell.status === 'connecting' || retell.status === 'connected'
  const mood: GuideMood =
    retell.status === 'connecting'
      ? 'connecting'
      : retell.status === 'connected' && retell.agentTalking
        ? 'speaking'
        : retell.status === 'connected' && retell.muted
          ? 'muted'
          : retell.status === 'connected'
            ? 'listening'
            : retell.status === 'error'
              ? 'muted'
              : 'idle'

  const caption =
    retell.status === 'ended'
      ? 'Conversación terminada'
      : retell.status === 'error'
        ? 'No se pudo conectar'
        : retell.status === 'idle'
          ? 'Lista para escucharte'
          : undefined

  const recent = retell.messages.slice(-4)
  const reportReady = report?.report_status === 'ready' || report?.report_status === 'insufficient'
  const reportPending =
    reportBusy || report?.report_status === 'pending' || report?.report_status === 'processing'

  return (
    <GuideInviteShell
      intensity="stage"
      leading={
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            className="h-9 rounded-xl px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate(landingHref)}
            aria-label="Volver a la invitación"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold tracking-tight">{APP_NAME}</p>
              <p className="text-[11px] text-muted-foreground">
                {live ? 'Guía · en llamada' : 'Guía · voz'}
              </p>
            </div>
          </div>
        </div>
      }
      meta={<GuideInviteMetaChip>{statusLabel(retell.status, retell.muted)}</GuideInviteMetaChip>}
      contentClassName="pb-6"
    >
      <section
        className={cn(
          'flex flex-col items-center justify-center px-5 py-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500',
          reportReady ? 'flex-none py-5' : 'flex-1'
        )}
      >
        <GuidePresence mood={mood} size={reportReady ? Math.round(orbSize * 0.72) : orbSize} showCaption caption={caption} />
        <p className="mt-2 max-w-xs text-center text-xs leading-5 text-muted-foreground">
          {retell.status === 'ended'
            ? 'Puedes iniciar otra llamada o volver a la invitación.'
            : 'Máximo 15 minutos. Habla con naturalidad; Guía te escucha.'}
        </p>
      </section>

      {error ? (
        <div
          className="relative z-10 mx-auto mb-3 flex w-full max-w-md gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.07] px-3.5 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="leading-snug">{error}</p>
        </div>
      ) : null}

      {reportPending ? (
        <p className="relative z-10 px-5 pb-2 text-center text-sm text-muted-foreground motion-safe:animate-pulse">
          Generando el informe…
        </p>
      ) : null}

      {report?.report_status === 'failed' ? (
        <div className="relative z-10 mx-auto w-full max-w-md px-5 pb-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() =>
              void requestReport('retry')
                .then(setReport)
                .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo reintentar.'))
            }
          >
            Reintentar informe
          </Button>
        </div>
      ) : null}

      {report && reportReady ? (
        <section className="relative z-10 mx-auto w-full max-w-lg space-y-4 px-5 pb-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
          <GuideReportBody
            executiveReport={report.executive_report}
            summary={report.summary}
            agentInferences={report.agent_inferences}
            learning={report.learning}
            intention={report.intention}
            reflectionQuestion={report.reflection_question}
          />
          <GuideReportActions
            topic={report.topic}
            dateLabel="Entrevista por liga"
            executiveReport={report.executive_report}
            summary={report.summary}
            learning={report.learning}
            intention={report.intention}
            createdAt={report.created_at}
            entryId={report.entry_id}
            onShare={async (confirm) => {
              const payload = await requestReport('whatsapp', confirm)
              return {
                ok: Boolean(payload.ok),
                code: payload.code || '',
                preview: payload.preview || '',
                phone: payload.phone ?? null,
                sent: Boolean(payload.sent),
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            También queda en el historial al{' '}
            <Link className="underline underline-offset-4" to={ROUTES.LOGIN} state={guideVoiceLoginState}>
              iniciar sesión
            </Link>{' '}
            con este perfil.
          </p>
        </section>
      ) : null}

      {recent.length > 0 && !reportReady ? (
        <ul className="relative z-10 mx-auto flex max-h-[28vh] w-full max-w-md flex-col gap-2 overflow-y-auto px-5 pb-2">
          {recent.map((message) => (
            <li
              key={message.id}
              className={cn(
                'max-w-[88%] px-3.5 py-2 text-[13px] leading-5',
                message.role === 'user'
                  ? 'self-end rounded-2xl rounded-br-md bg-primary text-primary-foreground'
                  : 'self-start rounded-2xl rounded-bl-md bg-background/85 text-foreground ring-1 ring-border/50'
              )}
            >
              {message.content}
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="relative z-10 mx-auto mt-auto flex w-full max-w-md flex-col items-center gap-3 px-5 pt-3">
        {live ? (
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant={retell.muted ? 'secondary' : 'outline'}
              className="h-14 w-14 rounded-2xl bg-background/80"
              disabled={retell.status !== 'connected'}
              onClick={() => retell.toggleMute()}
              aria-label={retell.muted ? 'Activar micrófono' : 'Silenciar micrófono'}
            >
              {retell.muted ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-16 w-16 rounded-2xl"
              onClick={() => retell.stop()}
              aria-label="Colgar"
            >
              <PhoneOff className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="h-12 rounded-xl px-8 text-base shadow-[0_16px_32px_-18px_hsl(var(--primary)/0.75)]"
            onClick={() => {
              setError(null)
              finalizedRef.current = false
              setReport(null)
              void retell
                .start()
                .then((started) => {
                  callIdRef.current = started.callId
                })
                .catch((err) => {
                  setError(err instanceof Error ? err.message : 'No se pudo iniciar la voz.')
                })
            }}
          >
            <Phone className="h-4 w-4" aria-hidden />
            {retell.status === 'ended' || retell.status === 'error' ? 'Llamar de nuevo' : 'Iniciar llamada'}
          </Button>
        )}
        <Link
          className="text-xs text-muted-foreground underline underline-offset-4"
          to={ROUTES.LOGIN}
          state={guideVoiceLoginState}
        >
          Ir al inicio de sesión
        </Link>
      </footer>
    </GuideInviteShell>
  )
}
