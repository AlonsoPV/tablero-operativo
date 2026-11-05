import { DemoRequestProvider } from '@/pages/product/DemoRequestContext'
import { LandingShell, Logo } from '@/pages/product/ProductUI'
import { AgentChannelsDemo, AgentProposalsDemo, WhatsAppInAction } from './AgentDemos'
import { AgentHero } from './AgentHero'
import {
  AgentCapabilitiesSection,
  AgentCloseSection,
  AgentCultureShiftSection,
  AgentMidPageCTA,
  AgentProblemSection,
} from './AgentSections'
import { AgentSeoHead } from './AgentSeoHead'

export function AgentLandingPage() {
  return (
    <DemoRequestProvider>
      <AgentSeoHead />
      <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/20">
        <AgentHero />
        <main className="overflow-x-hidden">
          <AgentProblemSection />
          <AgentCultureShiftSection />
          <WhatsAppInAction />
          <AgentProposalsDemo />
          <AgentMidPageCTA />
          <AgentChannelsDemo />
          <AgentCapabilitiesSection />
          <AgentCloseSection />
        </main>
        <footer className="border-t border-border/60 bg-foreground py-8 text-background">
          <LandingShell className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Logo light />
            <p className="text-xs text-background/60">
              Agente IA operativo · WhatsApp con confirmación humana.
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
