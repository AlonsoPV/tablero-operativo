import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, Loader2, X } from 'lucide-react'
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-end gap-2.5 p-3 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:p-0">
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className={cn(
            'pointer-events-auto flex w-full max-w-[min(100vw-1.5rem,26rem)] flex-col overflow-hidden',
            'h-[min(78dvh,40rem)] rounded-[1.75rem] border border-border/50 bg-background shadow-[0_28px_70px_-28px_rgba(15,23,42,0.5)]',
            'ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200',
            'sm:w-[26rem] sm:h-[min(80dvh,42rem)] dark:ring-white/10'
          )}
        >
          <header className="relative z-10 flex shrink-0 items-center gap-2.5 px-3 pb-1.5 pt-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_10px_22px_-12px_hsl(var(--primary)/0.7)]">
              <Bot className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="truncate text-sm font-semibold tracking-tight">
                Asistente
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                Conversar o escribir al tablero
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-full"
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
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir Asistente IA"
          aria-expanded={false}
          title="Asistente IA"
          className={cn(
            'pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground',
            'shadow-[0_10px_28px_-12px_rgba(15,23,42,0.45),0_2px_8px_-2px_rgba(15,23,42,0.18)]',
            'transition duration-200 ease-out',
            'hover:-translate-y-0.5 hover:bg-primary/90',
            'hover:shadow-[0_16px_34px_-14px_rgba(15,23,42,0.5),0_4px_10px_-2px_rgba(15,23,42,0.2)]',
            'active:translate-y-0 active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
          )}
        >
          <Bot className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
