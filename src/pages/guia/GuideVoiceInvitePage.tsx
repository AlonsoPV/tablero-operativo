import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
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

  return (
    <main className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(80%_50%_at_50%_18%,hsl(var(--primary)/0.28),transparent_62%),radial-gradient(36%_30%_at_85%_90%,hsl(262_83%_58%/0.16),transparent_70%)]"
        aria-hidden
      />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          className="h-9 rounded-full px-3 text-xs"
          onClick={() => navigate(landingHref)}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Invitación
        </Button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Guía · voz
        </p>
      </header>

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-4">
        <GuidePresence mood={mood} size={orbSize} showCaption caption={caption} />
        <p className="mt-2 max-w-xs text-center text-xs leading-5 text-muted-foreground">
          {retell.status === 'ended'
            ? 'Puedes iniciar otra llamada o volver a la invitación.'
            : 'Máximo 15 minutos. Los ojos de Guía siguen tu cursor.'}
        </p>
      </section>

      {error ? (
        <p className="relative z-10 mx-auto mb-3 w-full max-w-md rounded-2xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {reportBusy || report?.report_status === 'pending' || report?.report_status === 'processing' ? (
        <p className="relative z-10 px-5 text-center text-sm text-muted-foreground">Generando el informe…</p>
      ) : null}
      {report?.report_status === 'failed' ? (
        <div className="relative z-10 mx-auto w-full max-w-md px-5">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => void requestReport('retry').then(setReport).catch((err) => setError(err instanceof Error ? err.message : 'No se pudo reintentar.'))}>
            Reintentar informe
          </Button>
        </div>
      ) : null}
      {report && (report.report_status === 'ready' || report.report_status === 'insufficient') ? (
        <section className="relative z-10 mx-auto w-full max-w-lg space-y-4 px-5 pb-2">
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
            Tambien queda en el historial al{' '}
            <Link className="underline underline-offset-4" to={ROUTES.LOGIN} state={guideVoiceLoginState}>
              iniciar sesión
            </Link>{' '}
            con este perfil.
          </p>
        </section>
      ) : null}

      {recent.length > 0 && report?.report_status !== 'ready' ? (
        <ul className="relative z-10 mx-auto flex max-h-[28vh] w-full max-w-md flex-col gap-2 overflow-y-auto px-5 pb-2">
          {recent.map((message) => (
            <li
              key={message.id}
              className={cn(
                'max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-5',
                message.role === 'user'
                  ? 'self-end rounded-br-md bg-primary text-primary-foreground'
                  : 'self-start rounded-bl-md bg-background/85 text-foreground shadow-sm ring-1 ring-border/50'
              )}
            >
              {message.content}
            </li>
          ))}
        </ul>
      ) : null}

      <footer className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center gap-3 px-5 pb-6 pt-2">
        {live ? (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant={retell.muted ? 'secondary' : 'outline'}
              className="h-14 w-14 rounded-full bg-background/80"
              disabled={retell.status !== 'connected'}
              onClick={() => retell.toggleMute()}
              aria-label={retell.muted ? 'Activar micrófono' : 'Silenciar micrófono'}
            >
              {retell.muted ? <MicOff className="h-5 w-5" aria-hidden /> : <Mic className="h-5 w-5" aria-hidden />}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-16 w-16 rounded-full shadow-[0_16px_30px_-16px_hsl(var(--destructive)/0.8)]"
              onClick={() => retell.stop()}
              aria-label="Colgar"
            >
              <PhoneOff className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            className="h-14 rounded-full px-8 text-base shadow-[0_18px_36px_-18px_hsl(var(--primary)/0.8)]"
            onClick={() => {
              setError(null)
              finalizedRef.current = false
              setReport(null)
              void retell.start().then((started) => {
                callIdRef.current = started.callId
              }).catch((err) => {
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
    </main>
  )
}
