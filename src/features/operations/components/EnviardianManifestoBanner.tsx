import { useState } from 'react'
import { ChevronDown, Heart } from 'lucide-react'
import { ENVIARDIAN_MANIFESTO } from '@/constants/enviardianManifesto'
import { cn } from '@/lib/utils'

const togglePillClass =
  'inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.04] px-2.5 py-1 text-[10px] font-medium text-primary/80 sm:gap-1.5 sm:px-3 sm:text-[11px]'

export function EnviardianManifestoBanner({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <section
      id="kanban-enviardian-manifesto"
      className={cn(
        'relative overflow-hidden rounded-xl border border-primary/15 bg-card/90 shadow-sm backdrop-blur-sm transition-[box-shadow,background-color] duration-300',
        open && 'shadow-md shadow-primary/5',
        className
      )}
      aria-label="Declaración Enviardián"
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-r transition-opacity duration-300',
          open
            ? 'from-primary/[0.08] via-transparent to-primary/[0.04] opacity-100'
            : 'from-primary/[0.04] via-transparent to-transparent opacity-80'
        )}
        aria-hidden
      />

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="enviardian-manifesto-body"
        className={cn(
          'relative flex w-full transition-colors duration-200 hover:bg-primary/[0.03]',
          open
            ? 'flex-col items-center gap-2.5 px-4 py-4 text-center sm:px-6'
            : 'flex-row items-center justify-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-3'
        )}
      >
        <span
          className={cn(
            'min-w-0',
            open ? 'flex flex-col items-center gap-1' : 'flex items-baseline gap-1.5 sm:gap-2'
          )}
        >
          <span
            className={cn(
              'font-medium uppercase text-muted-foreground',
              open ? 'text-xs tracking-[0.2em]' : 'text-[10px] tracking-[0.14em] sm:text-[11px]'
            )}
          >
            Soy
          </span>
          <span
            className={cn(
              'font-semibold tracking-tight text-foreground',
              open ? 'text-2xl sm:text-[1.65rem]' : 'text-base sm:text-lg'
            )}
          >
            Enviardián
          </span>
        </span>

        <span className={togglePillClass}>
          {open ? 'Ocultar declaración' : 'Ver declaración'}
          <ChevronDown
            className={cn('h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-300', open && 'rotate-180')}
            aria-hidden
          />
        </span>
      </button>

      <div
        id="enviardian-manifesto-body"
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="mx-auto max-w-xl space-y-5 border-t border-primary/10 px-5 pb-6 pt-4 text-center sm:px-8 sm:pb-7">
            <div className="space-y-3">
              <p className="text-lg font-medium leading-snug tracking-tight text-foreground/90 sm:text-xl">
                {ENVIARDIAN_MANIFESTO.line1}
              </p>
              <p className="text-lg font-medium leading-snug tracking-tight text-foreground/90 sm:text-xl">
                {ENVIARDIAN_MANIFESTO.line2}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 px-4">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-border sm:w-24" />
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/8 ring-1 ring-primary/10">
                <Heart className="h-3.5 w-3.5 text-primary/80" aria-hidden />
              </span>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-border sm:w-24" />
            </div>

            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
              Cada acción en este tablero impacta a personas reales. Operamos con propósito,
              disciplina y humanidad.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
