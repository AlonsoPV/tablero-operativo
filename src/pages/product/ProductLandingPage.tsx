import {
  CollaborationDemo,
  DashboardDemo,
  EnviardianBridgeDemo,
  FollowUpDemo,
  ProductInAction,
} from './ProductDemos'
import { DemoRequestProvider } from './DemoRequestContext'
import { LandingSeoHead } from './LandingSeoHead'
import {
  CloseSection,
  ContinuousImprovementSection,
  CoordinationSection,
} from './ProductSections'
import { ProductHero } from './ProductHero'
import { ProductStoryRail } from './ProductStoryRail'
import { LandingShell, Logo } from './ProductUI'
import { HeroVideoBackdrop } from '@/pages/agent/HeroVideoBackdrop'

export function ProductLandingPage() {
  return (
    <DemoRequestProvider>
      <LandingSeoHead />
      <div className="home-particle-page min-h-screen font-sans text-foreground selection:bg-primary/20">
        <div className="agent-guide-line agent-guide-line--left hidden md:block" aria-hidden />
        <div className="agent-guide-line agent-guide-line--right hidden md:block" aria-hidden />
        <div className="home-particle-journey home-video-journey">
          <div className="home-particle-journey__field home-video-journey__field" aria-hidden>
            <HeroVideoBackdrop />
          </div>

          <div className="home-particle-journey__content">
            <ProductHero />
            <ProductStoryRail />
            <main className="home-post home-post--studio home-post--tight home-post--story overflow-x-hidden">
              <CoordinationSection />
              <ProductInAction />
              <DashboardDemo />
              <FollowUpDemo />
              <CollaborationDemo />
              <ContinuousImprovementSection />
              <EnviardianBridgeDemo />
              <CloseSection />
            </main>
          </div>
        </div>

        <footer className="relative z-[1] border-t border-white/10 bg-black py-8 text-white">
          <LandingShell className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Logo light />
            <p className="text-xs text-white/55">
              Estrategia, operación y resultados en un mismo sistema.
            </p>
            <div className="flex items-center gap-4">
              <a
                href="/agente"
                className="text-xs font-semibold text-white/70 transition-colors hover:text-white"
              >
                Enviardián
              </a>
              <a
                href="/login"
                className="text-xs font-semibold text-white/70 transition-colors hover:text-white"
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
