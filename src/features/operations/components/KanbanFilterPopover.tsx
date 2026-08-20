import {
  forwardRef,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const PANEL_Z_INDEX = 400
const VIEWPORT_GAP = 8
const TRIGGER_GAP = 4

type Align = 'start' | 'end'

function computeStyle(
  trigger: HTMLElement,
  align: Align,
  minWidth: number,
  panelHeight: number
): CSSProperties {
  const rect = trigger.getBoundingClientRect()
  const width = Math.min(Math.max(rect.width, minWidth), window.innerWidth - VIEWPORT_GAP * 2)
  const maxLeft = window.innerWidth - width - VIEWPORT_GAP
  const left =
    align === 'end'
      ? Math.min(Math.max(VIEWPORT_GAP, rect.right - width), maxLeft)
      : Math.min(Math.max(VIEWPORT_GAP, rect.left), maxLeft)

  const below = rect.bottom + TRIGGER_GAP
  const spaceBelow = window.innerHeight - below
  const spaceAbove = rect.top - TRIGGER_GAP
  const placeAbove =
    panelHeight > 0 && spaceBelow < Math.min(panelHeight, 220) && spaceAbove > spaceBelow
  const top = placeAbove
    ? Math.max(VIEWPORT_GAP, rect.top - TRIGGER_GAP - panelHeight)
    : below

  return {
    position: 'fixed',
    top,
    left,
    width,
    zIndex: PANEL_Z_INDEX,
  }
}

export const KanbanFilterPopover = forwardRef<
  HTMLDivElement,
  {
    open: boolean
    triggerRef: RefObject<HTMLElement | null> | RefObject<HTMLButtonElement | null>
    align?: Align
    minWidth?: number
    className?: string
  } & HTMLAttributes<HTMLDivElement>
>(function KanbanFilterPopover(
  { open, triggerRef, align = 'start', minWidth = 224, className, children, style: styleProp, ...props },
  ref
) {
  const [style, setStyle] = useState<CSSProperties>()
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null)

  const setRefs = (node: HTMLDivElement | null) => {
    setPanelEl(node)
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined)
      return
    }

    const update = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      setStyle(computeStyle(trigger, align, minWidth, panelEl?.offsetHeight ?? 0))
    }

    update()
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [open, triggerRef, align, minWidth, panelEl])

  if (!open) return null

  return createPortal(
    <div
      ref={setRefs}
      style={{ ...style, ...styleProp }}
      className={cn(className)}
      {...props}
    >
      {children}
    </div>,
    document.body
  )
})
