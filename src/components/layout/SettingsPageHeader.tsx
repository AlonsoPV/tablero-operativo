import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsPageHeaderProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  action?: ReactNode
  onAdd?: () => void
  addLabel?: string
  className?: string
}

export function SettingsPageHeader({
  eyebrow = 'Configuración',
  title,
  description,
  action,
  onAdd,
  addLabel = 'Crear',
  className,
}: SettingsPageHeaderProps) {
  const primaryAction =
    action
      ? action
      : onAdd
        ? (
            <Button onClick={onAdd} className="h-10 w-full shrink-0 shadow-sm sm:w-auto">
              <Plus className="mr-2 h-4 w-4 shrink-0" />
              {addLabel}
            </Button>
          )
        : null

  return (
    <header
      className={cn(
        'rounded-xl border border-border/60 bg-card/70 px-4 py-4 shadow-sm sm:px-5 sm:py-5',
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              {description}
            </p>
          ) : null}
        </div>
        {primaryAction ? (
          <div className="w-full shrink-0 sm:w-auto">{primaryAction}</div>
        ) : null}
      </div>
    </header>
  )
}
