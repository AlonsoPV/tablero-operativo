import { cn } from '@/lib/utils'

export function SessionStat({ text, className }: { text: string; className?: string }) {
  return (
    <p
      className={cn(
        'rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm',
        className
      )}
    >
      {text}
    </p>
  )
}
