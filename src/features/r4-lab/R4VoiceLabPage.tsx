import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  VolumeX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES, isVoiceR4UiEnabled } from '@/constants'
import { GuidePresence, useStageOrbSize } from '@/features/guide/components/GuidePresence'
import { cn } from '@/lib/utils'
import { R4_LAB_SCENARIOS, moodFromPhase, type R4LabScenario } from './labScenarios'
import { useR4VoiceSession } from './useR4VoiceSession'

export function R4VoiceLabPage() {
  if (!isVoiceR4UiEnabled()) {
    return <Navigate to={ROUTES.AI_ASSIST} replace />
  }
  return <R4VoiceLabExperience />
}

function R4VoiceLabExperience() {
  const [scenario, setScenario] = useState<R4LabScenario>('active')
  const [micConsent, setMicConsent] = useState(false)
  const [scopeConsent, setScopeConsent] = useState(false)
  const [draft, setDraft] = useState('Que acciones tengo vencidas?')
  const session = useR4VoiceSession(scenario)
  const { snapshot } = session
  const orbSize = useStageOrbSize(160, 220)
  const consented = micConsent && scopeConsent
  const live =
    snapshot.phase === 'listening' ||
    snapshot.phase === 'speaking' ||
    snapshot.phase === 'paused' ||
    snapshot.phase === 'recovering'
  const ended = snapshot.phase === 'ended'

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
      <header className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
          Laboratorio R4 · simulado
        </p>
        <h1 className="text-xl font-semibold tracking-tight">Sesion de voz y liga</h1>
        <p className="text-sm leading-5 text-muted-foreground">
          Sin Retell, STT/TTS de pago ni ligas reales. La Guía de producción no cambia.
        </p>
        <Link
          to={`${ROUTES.AI_ASSIST}?lane=talk`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Volver a Hablar
        </Link>
      </header>

      <label className="space-y-1 text-sm">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          Escenario de liga
        </span>
        <select
          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
          value={scenario}
          onChange={(event) => {
            setScenario(event.target.value as R4LabScenario)
            setMicConsent(false)
            setScopeConsent(false)
            session.reset()
          }}
        >
          {R4_LAB_SCENARIOS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <section className="rounded-2xl bg-card px-4 py-4 ring-1 ring-border/50">
        <GuidePresence
          mood={moodFromPhase(snapshot.phase)}
          size={orbSize}
          showCaption
          caption={captionFor(snapshot.phase, snapshot.lastError?.message)}
        />
      </section>

      {!snapshot.consented ? (
        <section className="space-y-3 rounded-2xl bg-muted/30 px-4 py-3 ring-1 ring-border/40">
          <p className="text-sm font-medium">Consentimiento</p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={micConsent}
              onChange={(event) => setMicConsent(event.target.checked)}
            />
            Autorizo el uso del microfono (simulado).
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scopeConsent}
              onChange={(event) => setScopeConsent(event.target.checked)}
            />
            Entiendo el alcance de la liga y que las confirmaciones requieren autenticacion.
          </label>
          <Button
            className="min-h-11 w-full"
            disabled={!consented}
            onClick={() => void session.consent()}
          >
            Aceptar y continuar
          </Button>
        </section>
      ) : null}

      {snapshot.lastError ? (
        <div
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/25"
        >
          {snapshot.lastError.message}
          {snapshot.phase === 'recovering' || snapshot.phase === 'error' ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" className="min-h-11" onClick={() => void session.recover()}>
                Recuperar
              </Button>
              <Button size="sm" variant="outline" className="min-h-11" onClick={session.reset}>
                Salir
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {snapshot.consented && !ended ? (
        <div className="space-y-3">
          {!live ? (
            <Button className="min-h-11 w-full" onClick={() => void session.start()}>
              <Mic className="h-4 w-4" aria-hidden />
              Iniciar sesion
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {snapshot.phase === 'paused' ? (
                <Button className="min-h-11" onClick={() => void session.resume()}>
                  <Play className="h-4 w-4" aria-hidden />
                  Reanudar
                </Button>
              ) : (
                <Button variant="secondary" className="min-h-11" onClick={() => void session.pause()}>
                  <Pause className="h-4 w-4" aria-hidden />
                  Pausar
                </Button>
              )}
              <Button variant="outline" className="min-h-11" onClick={() => void session.interruptSpeech()}>
                <VolumeX className="h-4 w-4" aria-hidden />
                Interrumpir
              </Button>
              <Button variant="destructive" className="min-h-11" onClick={() => void session.end()}>
                <Square className="h-4 w-4" aria-hidden />
                Finalizar
              </Button>
              <Button
                variant="ghost"
                className="min-h-11 col-span-2 sm:col-span-1"
                onClick={() => void session.cancelTurn()}
              >
                Cancelar turno
              </Button>
            </div>
          )}

          {live ? (
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Hablar (transcripcion simulada, revisable)
              </label>
              <textarea
                className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button
                className="min-h-11 w-full"
                disabled={snapshot.phase === 'paused'}
                onClick={() => void session.speak(draft)}
              >
                Enviar turno
              </Button>
            </div>
          ) : null}

          <Button
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => session.confirmAction()}
          >
            Confirmar accion protegida
          </Button>
        </div>
      ) : null}

      {snapshot.transcript.length > 0 ? (
        <ol className="space-y-2">
          {snapshot.transcript.map((item) => (
            <li
              key={item.id}
              className={cn(
                'rounded-xl px-3 py-2 text-sm leading-5',
                item.role === 'user' ? 'bg-primary/10' : 'bg-muted/50'
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
                {item.role === 'user' ? 'Tu' : 'Guia'}
              </p>
              <p>{item.text}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {ended && snapshot.report ? (
        <section className="space-y-3 rounded-2xl bg-card px-4 py-4 ring-1 ring-border/50">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
            Resumen de sesion
          </p>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Hallazgo
            </p>
            <p className="text-sm">
              Sesion {snapshot.report.sessionId} cerrada a las {snapshot.report.finalizedAt}.
              {snapshot.reportDuplicate ? ' (cierre duplicado ignorado)' : ''}
            </p>
          </div>
          <div className="rounded-xl border border-[#7C3AED]/25 bg-[#7C3AED]/[0.06] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7C3AED]">
              Recomendacion · no es una decision confirmada
            </p>
            <p className="mt-1 text-sm">Prioriza las acciones vencidas visibles en tu alcance.</p>
          </div>
          <Button variant="outline" className="min-h-11 w-full" onClick={session.reset}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Nueva sesion
          </Button>
        </section>
      ) : null}
    </div>
  )
}

function captionFor(phase: string, error?: string) {
  if (error && (phase === 'error' || phase === 'denied' || phase === 'recovering')) return error
  const copy: Record<string, string> = {
    consent: 'Acepta el consentimiento para entrar.',
    connecting: 'Conectando sesion simulada…',
    listening: 'Te escucha. Envia un turno cuando quieras.',
    speaking: 'Respondiendo…',
    paused: 'Sesion en pausa.',
    recovering: 'Intentando recuperar la sesion…',
    ended: 'Sesion finalizada.',
    denied: 'Acceso denegado.',
    error: 'Hay un problema recuperable.',
  }
  return copy[phase] ?? phase
}
