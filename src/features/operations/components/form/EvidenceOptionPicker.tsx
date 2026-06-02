import { useMemo } from 'react'
import {
  Camera,
  FileText,
  ClipboardList,
  Monitor,
  FileWarning,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type EvidenceCatalogOption = {
  id: string
  value: string
  label: string
}

const ICON_BY_KEYWORD: { pattern: RegExp; icon: LucideIcon }[] = [
  { pattern: /foto|imagen|captura|pantalla|screenshot/i, icon: Camera },
  { pattern: /pdf|documento|archivo/i, icon: FileText },
  { pattern: /reporte|informe/i, icon: ClipboardList },
  { pattern: /minuta|acta|reunion/i, icon: ClipboardList },
  { pattern: /pantalla|screen|monitor/i, icon: Monitor },
  { pattern: /otro|especificar/i, icon: FileWarning },
]

function iconForLabel(label: string, value: string): LucideIcon {
  const text = `${label} ${value}`
  for (const { pattern, icon } of ICON_BY_KEYWORD) {
    if (pattern.test(text)) return icon
  }
  return FileText
}

type EvidenceOptionPickerProps = {
  options: EvidenceCatalogOption[]
  selectedValue: string
  onSelect: (value: string, label: string) => void
  /** Valor interno para «Otro (especificar)». */
  otherInternalValue?: string
  disabled?: boolean
}

export function EvidenceOptionPicker({
  options,
  selectedValue,
  onSelect,
  otherInternalValue,
  disabled,
}: EvidenceOptionPickerProps) {
  const cards = useMemo(() => {
    const list = options.map((o) => ({
      ...o,
      Icon: iconForLabel(o.label, o.value),
    }))
    if (otherInternalValue && !options.some((o) => o.value.toLowerCase() === 'otro')) {
      list.push({
        id: '__otro__',
        value: otherInternalValue,
        label: 'Otro',
        Icon: CircleHelp,
      })
    }
    return list
  }, [options, otherInternalValue])

  return (
    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">
      {cards.map((opt) => {
        const selected = selectedValue === opt.value
        const Icon = opt.Icon
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.value, opt.label)}
            className={cn(
              'flex min-h-[4.5rem] flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors sm:min-h-0',
              selected
                ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                : 'border-border bg-background hover:border-primary/40 hover:bg-muted/30',
              disabled && 'pointer-events-none opacity-50'
            )}
          >
            <Icon
              className={cn('h-5 w-5', selected ? 'text-primary' : 'text-muted-foreground')}
              aria-hidden
            />
            <span className="text-sm font-medium leading-tight">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
