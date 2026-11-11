import { ChevronLeft, ChevronRight, Menu, MessageCircle, Mic, PhoneOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { GuidePresence } from '@/features/guide/components/GuidePresence'
import { cn } from '@/lib/utils'
import {
  LandingShell,
  Logo,
  PrimaryCTA,
} from '@/pages/product/ProductUI'
import { AGENT_STORY } from './agentStory'
import { AGENT_LANDING_SEO } from './agentSeo'
import { AgentSectionSeo } from './AgentSeoHead'
import { useDemoRequest } from '@/pages/product/DemoRequestContext'

const nav = [
  ['Visibilidad', '#visibilidad'],
  ['Acción', '#accion'],
  ['WhatsApp', '#whatsapp'],
  ['Asistente', '#asistente'],
] as const

function formatCallTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function DemoPillButton({
  full = false,
  onNavigate,
}: {
  full?: boolean
  onNavigate?: () => void
}) {
  const { openDemoRequest } = useDemoRequest()

  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.()
        openDemoRequest()
      }}
      className={cn(
        'group inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98]',
        full && 'w-full'
      )}
    >
      <span>Solicitar demostración</span>
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-px" aria-hidden />
    </button>
  )
}

export function AgentNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-5 sm:px-6 lg:px-8">
        <Logo light />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Navegación principal">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              {label}
            </a>
          ))}
          <a
            href="/producto"
            className="text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            Producto
          </a>
        </nav>
        <div className="hidden md:block">
          <DemoPillButton />
        </div>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white md:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open ? (
        <div className="mx-auto max-w-7xl space-y-2 px-3 pb-4 sm:px-6 md:hidden lg:px-8">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
            >
              {label}
            </a>
          ))}
          <a
            href="/producto"
            onClick={() => setOpen(false)}
            className="block rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
          >
            Producto
          </a>
          <DemoPillButton full onNavigate={() => setOpen(false)} />
        </div>
      ) : null}
    </header>
  )
}

function InterviewDevice({ line }: { line: number }) {
  const [elapsed, setElapsed] = useState(8)

  useEffect(() => {
    const clock = window.setInterval(() => setElapsed((current) => current + 1), 1000)
    return () => window.clearInterval(clock)
  }, [])

  return (
    <div id="entrevista" className="relative mx-auto w-full max-w-[280px]">
      <div
        className="pointer-events-none absolute left-1/2 top-10 h-40 w-40 -translate-x-1/2 rounded-full bg-white/10 blur-3xl"
        aria-hidden
      />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#141416] shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between px-3 pb-1 pt-3 text-white/80">
          <span className="grid h-7 w-7 place-items-center text-white/70" aria-hidden>
            <ChevronLeft className="h-4 w-4" />
          </span>
          <div className="min-w-0 text-center">
            <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white">
              <i className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Enviardián
            </p>
            <p className="text-[11px] text-white/55">Te escucho</p>
          </div>
          <p className="w-8 text-right text-[11px] tabular-nums text-white/70">{formatCallTime(elapsed)}</p>
        </div>
        <div className="flex flex-col items-center px-4 pb-4 pt-1">
          <GuidePresence mood="speaking" size={112} announce={false} />
          <p className="text-center text-[11px] text-white/45">Habla cuando quieras · puedes interrumpir</p>
          <p className="mt-3 text-center text-[13px] font-semibold leading-snug text-white" aria-live="polite">
            {AGENT_STORY.interviewLines[line]}
          </p>
          <div className="mt-4 flex items-center justify-center gap-4" aria-hidden>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white">
              <Mic className="h-4 w-4" />
            </span>
            <span className="grid h-12 w-12 place-items-center rounded-full bg-red-500 text-white">
              <PhoneOff className="h-4 w-4" />
            </span>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white">
              <MessageCircle className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-[10px] text-white/35">Simulación · no inicia una llamada</p>
        </div>
      </div>
    </div>
  )
}

export function AgentHero() {
  const [line, setLine] = useState(0)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) return
    const rotator = window.setInterval(
      () => setLine((current) => (current + 1) % AGENT_STORY.interviewLines.length),
      7000
    )
    return () => window.clearInterval(rotator)
  }, [])

  return (
    <>
      <AgentNav />
      <section
        id="inicio"
        className={cn(
          'home-hero-stage relative overflow-hidden bg-transparent',
          'pt-24 pb-16',
          'lg:flex lg:min-h-screen lg:items-center lg:pb-10 lg:pt-20'
        )}
      >
        <AgentSectionSeo description={AGENT_LANDING_SEO.sections.inicio.description} />
        <LandingShell className="w-full">
          <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] lg:gap-20">
            <div className="relative max-w-md">
              <div
                className="pointer-events-none absolute -inset-x-6 -inset-y-8 -z-10 rounded-[2rem] bg-gradient-to-r from-black/55 via-black/35 to-transparent blur-2xl"
                aria-hidden
              />
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
                <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.65)]" aria-hidden />
                Visibilidad para dirigir
              </p>
              <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white [text-shadow:0_2px_28px_rgba(0,0,0,0.45)] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
                Tu operación, bajo control.
              </h1>
              <p className="mt-4 max-w-sm text-base leading-relaxed text-white/80 [text-shadow:0_1px_18px_rgba(0,0,0,0.4)]">
                Consulta tu empresa, asigna compromisos y da seguimiento a tu equipo por voz, chat y
                WhatsApp.
              </p>
              <div className="mt-8">
                <PrimaryCTA dark className="bg-white text-black shadow-lg shadow-black/30 hover:bg-white/90">
                  Solicitar demostración
                </PrimaryCTA>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <InterviewDevice line={line} />
            </div>
          </div>
        </LandingShell>
      </section>
    </>
  )
}
