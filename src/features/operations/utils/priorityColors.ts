import { cn } from '@/lib/utils'

export type PriorityColor = 'verde' | 'amarillo' | 'rojo'

export function normalizePriorityColor(value: string | null | undefined): PriorityColor | null {
  if (value === 'verde' || value === 'amarillo' || value === 'rojo') return value
  return null
}

export function inferPriorityColor(nombre: string): PriorityColor {
  const key = nombre.trim().toLowerCase()
  if (key.includes('p1') || key.includes('crit') || key.includes('alta') || key.includes('urgent')) return 'rojo'
  if (key.includes('p2') || key.includes('media') || key.includes('normal')) return 'amarillo'
  return 'verde'
}

export function priorityColorFor(nombre: string, color?: string | null): PriorityColor {
  return normalizePriorityColor(color) ?? inferPriorityColor(nombre)
}

export function priorityColorClasses(color: PriorityColor, selected = false): string {
  const classes: Record<PriorityColor, string> = {
    verde: selected
      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
    amarillo: selected
      ? 'border-amber-500 bg-amber-500/18 text-amber-950 dark:text-amber-100'
      : 'border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-200',
    rojo: selected
      ? 'border-red-500 bg-red-500/15 text-red-950 dark:text-red-100'
      : 'border-red-500/35 bg-red-500/10 text-red-950 dark:text-red-200',
  }
  return cn(classes[color], selected && 'shadow-sm ring-1 ring-current/15')
}

export function priorityDotClasses(color: PriorityColor): string {
  const classes: Record<PriorityColor, string> = {
    verde: 'bg-emerald-500',
    amarillo: 'bg-amber-500',
    rojo: 'bg-red-500',
  }
  return classes[color]
}
