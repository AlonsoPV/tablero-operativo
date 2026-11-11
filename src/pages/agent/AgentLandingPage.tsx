import { DemoRequestProvider } from '@/pages/product/DemoRequestContext'
import { LandingShell, Logo } from '@/pages/product/ProductUI'
import { EnviardianDemo, InstructionDemo, TeamWhatsAppDemo } from './AgentDemos'
import { AgentHero } from './AgentHero'
import {
  AgentCloseSection,
  AgentContinuitySection,
  AgentControlSection,
} from './AgentSections'
import { AgentSeoHead } from './AgentSeoHead'
import { AgentStoryRail } from './AgentStoryRail'
import { HeroVideoBackdrop } from './HeroVideoBackdrop'

export function AgentLandingPage() {
  return (
    <DemoRequestProvider>
      <AgentSeoHead />
      <div className="home-particle-page min-h-screen font-sans text-foreground selection:bg-primary/20">
        <div className="agent-guide-line agent-guide-line--left hidden md:block" aria-hidden />
        <div className="agent-guide-line agent-guide-line--right hidden md:block" aria-hidden />
        <div className="home-particle-journey home-video-journey">
          <div
            className="home-particle-journey__field home-video-journey__field"
            aria-hidden
          >
            <HeroVideoBackdrop />
          </div>

          <div className="home-particle-journey__content">
            <AgentHero />
            <AgentStoryRail />
            <main className="home-post home-post--studio home-post--tight home-post--story overflow-x-hidden">
              <EnviardianDemo />
              <InstructionDemo />
              <TeamWhatsAppDemo />
              <AgentControlSection />
              <AgentContinuitySection />
              <AgentCloseSection />
            </main>
          </div>
        </div>

        <footer className="relative z-[1] border-t border-border/60 bg-foreground py-8 text-background">
          <LandingShell className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Logo light />
            <p className="text-xs text-background/60">
              Visibilidad, seguimiento y decisión. La empresa confirma antes de ejecutar.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="/producto"
                className="text-xs font-semibold text-background/70 transition-colors hover:text-background"
              >
                Producto
              </a>
              <a
                href="/login"
                className="text-xs font-semibold text-background/70 transition-colors hover:text-background"
              >
                Iniciar sesión
              </a>
            </div>
          </LandingShell>
        </footer>
      </div>
    </DemoRequestProvider>
  )
}
