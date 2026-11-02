import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants'
import { useRouteAccess } from '@/features/auth/hooks/useRouteAccess'
import { isOperacionRoute } from '@/features/ai-support/operacionRoutes'
import { cn } from '@/lib/utils'

const AiAssistPage = lazy(() =>
  import('@/features/ai-support/pages/AiAssistPage').then((module) => ({
    default: module.AiAssistPage,
  }))
)

export function AiAssistFloatingButton() {
  const location = useLocation()
  const { canAccessRoute } = useRouteAccess()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const canUseAssistant = canAccessRoute(ROUTES.AI_ASSIST)
  const onOperacion = isOperacionRoute(location.pathname)
  const onAssistantPage =
    location.pathname === ROUTES.AI_ASSIST ||
    location.pathname.startsWith(`${ROUTES.AI_ASSIST}/`)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('textarea, button, [href], input, select')
        ?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [open])

  if (!canUseAssistant || !onOperacion || onAssistantPage) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2.5 sm:bottom-5 sm:right-5">
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className={cn(
            'pointer-events-auto flex w-[min(100vw-1.25rem,23.5rem)] flex-col overflow-hidden',
            'h-[min(70dvh,35rem)] rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-md',
            'ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200',
            'sm:w-[25.5rem] sm:h-[min(74dvh,37rem)] dark:ring-white/10'
          )}
        >
          <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-gradient-to-r from-primary/10 via-background to-background px-3 py-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Bot className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-sm font-semibold tracking-tight">
                Asistente IA
              </h2>
              <p className="truncate text-[10px] text-muted-foreground">
                Chat · acciones · Guia
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setOpen(false)}
              aria-label="Cerrar asistente"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Cargando…
                </div>
              }
            >
              <AiAssistPage variant="popup" />
            </Suspense>
          </div>
        </div>
      ) : null}

      {!open ? (
        <Button
          type="button"
          size="lg"
          onClick={() => setOpen(true)}
          aria-label="Abrir Asistente IA"
          aria-expanded={false}
          title="Asistente IA"
          className={cn(
            'pointer-events-auto h-12 gap-2 rounded-full px-4 shadow-lg',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">Asistente</span>
        </Button>
      ) : null}
    </div>
  )
}
