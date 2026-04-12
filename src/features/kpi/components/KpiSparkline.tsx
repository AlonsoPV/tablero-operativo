import { cn } from '@/lib/utils'

const DEFAULT_W = 112
const DEFAULT_H = 28
const PAD = 2

type Props = {
  values: number[]
  className?: string
  /** Etiqueta accesible */
  label?: string
  width?: number
  height?: number
}

/**
 * Mini serie (línea) de valores medidos; escala min–max local.
 */
export function KpiSparkline({
  values,
  className,
  label = 'Últimas mediciones',
  width = DEFAULT_W,
  height = DEFAULT_H,
}: Props) {
  const n = values.length
  if (n < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const innerW = width - PAD * 2
  const innerH = height - PAD * 2

  const pts = values.map((v, i) => {
    const x = PAD + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1))
    const t = (v - min) / range
    const y = PAD + innerH * (1 - t)
    return { x, y }
  })

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0 text-primary', className)}
      role="img"
      aria-label={label}
    >
      <path d={d} fill="none" className="stroke-current" strokeWidth={1.5} strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.5} className="fill-current" />
      ))}
    </svg>
  )
}
