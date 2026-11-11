import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'
import { LandingShell } from '@/pages/product/ProductUI'
import { AGENT_STORY_RAIL } from './agentStory'

const SECTION_IDS = AGENT_STORY_RAIL.map((item) => item.href.replace('#', ''))

export function AgentStoryRail({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion()
  const [activeHref, setActiveHref] = useState(AGENT_STORY_RAIL[0].href)
  const listRef = useRef<HTMLOListElement>(null)
  const activeIndex = Math.max(
    0,
    AGENT_STORY_RAIL.findIndex((item) => item.href === activeHref)
  )

  useEffect(() => {
    const nodes = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (node): node is HTMLElement => Boolean(node)
    )
    if (nodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]
        if (!top?.target?.id) return
        setActiveHref(`#${top.target.id}`)
      },
      {
        root: null,
        // Prefer the section occupying the mid-upper viewport while scrolling the journey.
        rootMargin: '-28% 0px -48% 0px',
        threshold: [0.08, 0.2, 0.35, 0.5],
      }
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    // Solo desplazar el carril horizontal: scrollIntoView también mueve la página y bloquea el scroll.
    if (list.scrollWidth <= list.clientWidth + 1) return
    const active = list.querySelector<HTMLElement>(`[data-rail-href="${activeHref}"]`)
    if (!active) return
    const left = active.offsetLeft - (list.clientWidth - active.clientWidth) / 2
    list.scrollTo({
      left: Math.max(0, left),
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [activeHref, reduceMotion])

  return (
    <div
      className={cn('relative z-[1] py-4 sm:py-6', className)}
      aria-label="Recorrido de la historia"
    >
      <LandingShell>
        <div className="relative">
          {/* Progress track (desktop) */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-[1.35rem] hidden h-px bg-white/10 sm:block"
            aria-hidden
          >
            <motion.div
              className="h-full origin-left bg-gradient-to-r from-white/70 via-white/40 to-white/10"
              initial={false}
              animate={{
                scaleX: reduceMotion
                  ? (activeIndex + 1) / AGENT_STORY_RAIL.length
                  : (activeIndex + 0.35) / AGENT_STORY_RAIL.length,
              }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            />
          </div>

          <motion.ol
            ref={listRef}
            className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-6 sm:gap-3 sm:overflow-visible sm:pb-0"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
            variants={{
              hidden: {},
              show: {
                transition: {
                  staggerChildren: reduceMotion ? 0 : 0.08,
                },
              },
            }}
          >
            {AGENT_STORY_RAIL.map((item, index) => {
              const active = item.href === activeHref
              const passed = index < activeIndex

              return (
                <motion.li
                  key={item.step}
                  data-rail-href={item.href}
                  className="min-w-[8rem] shrink-0 sm:min-w-0"
                  variants={{
                    hidden: {
                      opacity: 0,
                      y: reduceMotion ? 0 : 16,
                      scale: reduceMotion ? 1 : 0.96,
                    },
                    show: {
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                    },
                  }}
                >
                  <motion.div
                    whileHover={reduceMotion ? undefined : { y: -3, scale: 1.02 }}
                    className={cn(
                      'liquid-glass relative rounded-2xl px-3 py-3 transition-colors',
                      active
                        ? 'bg-white/[0.1] ring-1 ring-white/25'
                        : passed
                          ? 'bg-white/[0.04]'
                          : 'bg-transparent'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'relative grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold tabular-nums',
                          active
                            ? 'bg-white text-black'
                            : passed
                              ? 'bg-white/25 text-white'
                              : 'bg-white/10 text-white/70'
                        )}
                      >
                        {item.step.replace(/^0/, '')}
                        {active && !reduceMotion ? (
                          <span className="absolute inset-0 animate-ping rounded-full bg-white/35" />
                        ) : null}
                      </span>
                      <p
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-[0.14em]',
                          active ? 'text-white/80' : 'text-white/40'
                        )}
                      >
                        {item.step}
                      </p>
                    </div>
                    <p
                      className={cn(
                        'mt-2 text-sm font-semibold',
                        active ? 'text-white' : 'text-white/85'
                      )}
                    >
                      {item.verb}
                    </p>
                    <p
                      className={cn(
                        'mt-0.5 text-xs',
                        active ? 'text-white/70' : 'text-white/45'
                      )}
                    >
                      {item.object}
                    </p>
                  </motion.div>
                </motion.li>
              )
            })}
          </motion.ol>
        </div>
      </LandingShell>
    </div>
  )
}
