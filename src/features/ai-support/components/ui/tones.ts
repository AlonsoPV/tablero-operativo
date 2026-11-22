export type AssistantTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'violet'

/** Clases de superficie suave + texto por tono, basadas en tokens del tema. */
export const toneSoftClass: Record<AssistantTone, string> = {
  neutral: 'bg-foreground/[0.04] text-foreground ring-border/70',
  primary: 'bg-primary/10 text-primary ring-primary/20',
  success: 'bg-success/10 text-success ring-success/25',
  warning: 'bg-warning/10 text-warning ring-warning/25',
  danger: 'bg-destructive/10 text-destructive ring-destructive/25',
  info: 'bg-info/10 text-info ring-info/20',
  violet: 'bg-status-ejecucion/10 text-status-ejecucion ring-status-ejecucion/25',
}

export const toneDotClass: Record<AssistantTone, string> = {
  neutral: 'bg-muted-foreground/50',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  violet: 'bg-status-ejecucion',
}

export const toneRailClass: Record<AssistantTone, string> = {
  neutral: 'bg-border',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  violet: 'bg-status-ejecucion',
}
