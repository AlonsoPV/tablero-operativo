import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Columns3,
  LifeBuoy,
  Lightbulb,
  Target,
  Calendar,
  BookOpen,
  GraduationCap,
  Sparkles,
  FolderKanban,
  Network,
  ChevronDown,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ROUTES, APP_NAME } from '@/constants'
import { useAppStore } from '@/store'
import { useRouteAccess } from '@/features/auth/hooks/useRouteAccess'
import { Button } from '@/components/ui/button'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
}

type NavGroup = {
  id: string
  label: string
  items: NavItem[]
}

/** Navegación por módulos (spec §5). */
const navGroups: NavGroup[] = [
  {
    id: 'operacion',
    label: 'Operacion',
    items: [
      { to: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
      { to: ROUTES.KANBAN, label: 'Kanban', icon: Columns3 },
      { to: ROUTES.TEAM_KANBAN, label: 'Equipos', icon: FolderKanban },
    ],
  },
  {
    id: 'organizacion',
    label: 'Organizacion',
    items: [
      { to: ROUTES.ORG_CHART, label: 'Organigrama', icon: Network },
      { to: ROUTES.DISCIPLINA, label: 'Disciplina', icon: Target },
      { to: ROUTES.CALENDARIO, label: 'Calendario', icon: Calendar },
    ],
  },
  {
    id: 'mejora',
    label: 'Mejora',
    items: [
      { to: ROUTES.CHALLENGES, label: 'Challenges', icon: Lightbulb },
      { to: ROUTES.ACADEMIA, label: 'Academia', icon: GraduationCap },
    ],
  },
  {
    id: 'ayuda',
    label: 'Ayuda',
    items: [
      { to: ROUTES.TICKETS, label: 'Tickets', icon: LifeBuoy },
      { to: ROUTES.MANUAL, label: 'Manual', icon: BookOpen },
      { to: ROUTES.AI_ASSIST, label: 'Asistente IA', icon: Sparkles },
    ],
  },
]

const DEFAULT_OPEN_GROUP_IDS = new Set(['operacion'])

const MOBILE_MQ = '(max-width: 1023px)'

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches
}

function isRouteActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function groupHasActiveRoute(pathname: string, items: NavItem[]) {
  return items.some((item) => isRouteActive(pathname, item.to))
}

export function Sidebar() {
  const location = useLocation()
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const { canAccessRoute } = useRouteAccess()
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => new Set(DEFAULT_OPEN_GROUP_IDS))

  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessRoute(item.to)),
    }))
    .filter((group) => group.items.length > 0)

  /** Al navegar, abrir el grupo de la ruta activa si estaba cerrado. */
  useEffect(() => {
    const activeGroup = navGroups.find((group) =>
      group.items.some(
        (item) => canAccessRoute(item.to) && isRouteActive(location.pathname, item.to)
      )
    )
    if (!activeGroup) return
    setOpenGroupIds((prev) => {
      if (prev.has(activeGroup.id)) return prev
      return new Set(prev).add(activeGroup.id)
    })
  }, [canAccessRoute, location.pathname])

  /** Antes del primer pintado en móvil: menú cerrado para evitar flash del overlay a pantalla completa. */
  useLayoutEffect(() => {
    if (isMobileViewport()) {
      setSidebarOpen(false)
    }
  }, [setSidebarOpen])

  /** Cerrar offcanvas con Escape solo en móvil. */
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileViewport()) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen, setSidebarOpen])

  /** Foco en el botón cerrar al abrir el panel móvil (accesibilidad). */
  useEffect(() => {
    if (!sidebarOpen || !isMobileViewport()) return
    const id = window.requestAnimationFrame(() => closeBtnRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [sidebarOpen])

  const closeMobileMenu = useCallback(() => {
    if (isMobileViewport()) {
      setSidebarOpen(false)
    }
  }, [setSidebarOpen])

  const toggleGroup = useCallback((groupId: string) => {
    setOpenGroupIds((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }, [])

  const renderNavLink = (
    item: NavItem,
    opts: { showLabels: boolean; mobile?: boolean; onActivate?: () => void }
  ) => {
    const { showLabels, mobile, onActivate } = opts
    const { to, label, icon: Icon } = item
    const isActive = isRouteActive(location.pathname, to)
    return (
      <Link
        key={to}
        to={to}
        onClick={() => onActivate?.()}
        title={!showLabels ? label : undefined}
        className={cn(
          'group/link relative flex items-center gap-3 font-medium transition-colors',
          mobile ? 'rounded-xl px-3 py-3.5 text-base' : 'rounded-lg px-2.5 py-2 text-sm',
          isActive
            ? 'bg-sidebar-primary text-primary-foreground shadow-sm'
            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground'
        )}
      >
        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0 opacity-90',
            mobile && 'h-6 w-6',
            !isActive && 'text-sidebar-foreground/70 group-hover/link:text-sidebar-foreground'
          )}
          aria-hidden
        />
        {showLabels ? <span className="flex-1 truncate tracking-tight">{label}</span> : null}
      </Link>
    )
  }

  const renderNavGroups = (opts: { showLabels: boolean; mobile?: boolean; onActivate?: () => void }) => {
    const { showLabels, mobile, onActivate } = opts

    if (!showLabels) {
      return visibleNavGroups.map((group, groupIndex) => (
        <div key={group.id} className={cn('flex flex-col gap-1', groupIndex > 0 && 'mt-1.5')}>
          {groupIndex > 0 ? (
            <div className="mx-2 mb-1.5 border-t border-sidebar-accent/55" aria-hidden />
          ) : null}
          {group.items.map((item) =>
            renderNavLink(item, { showLabels: false, mobile, onActivate })
          )}
        </div>
      ))
    }

    return visibleNavGroups.map((group) => {
      const isExpanded = openGroupIds.has(group.id)
      const hasActive = groupHasActiveRoute(location.pathname, group.items)
      const panelId = `nav-group-panel-${group.id}`
      const triggerId = `nav-group-trigger-${group.id}`

      return (
        <section
          key={group.id}
          className={cn(
            'overflow-hidden rounded-xl border transition-colors',
            isExpanded
              ? 'border-sidebar-accent/70 bg-sidebar-accent/25'
              : hasActive
                ? 'border-sidebar-primary/35 bg-sidebar-accent/15'
                : 'border-transparent bg-transparent hover:border-sidebar-accent/40 hover:bg-sidebar-accent/10'
          )}
        >
          <button
            id={triggerId}
            type="button"
            aria-expanded={isExpanded}
            aria-controls={panelId}
            onClick={() => toggleGroup(group.id)}
            className={cn(
              'flex w-full items-center gap-2 px-2.5 text-left transition-colors',
              mobile ? 'min-h-11 py-2.5' : 'min-h-9 py-2',
              'hover:bg-sidebar-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/40'
            )}
          >
            <span
              className={cn(
                'flex-1 text-[11px] font-semibold uppercase tracking-[0.08em]',
                hasActive ? 'text-sidebar-foreground' : 'text-sidebar-foreground/55'
              )}
            >
              {group.label}
            </span>
            {hasActive && !isExpanded ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-primary" aria-hidden />
            ) : null}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-sidebar-foreground/45 transition-transform duration-200',
                isExpanded && 'rotate-180 text-sidebar-foreground/70'
              )}
              aria-hidden
            />
          </button>

          <div
            id={panelId}
            role="region"
            aria-labelledby={triggerId}
            className={cn(
              'grid transition-[grid-template-rows] duration-200 ease-out',
              isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}
          >
            <div className="overflow-hidden">
              <div className={cn('flex flex-col gap-0.5 px-1.5 pb-1.5', mobile && 'gap-1 pb-2')}>
                {group.items.map((item) =>
                  renderNavLink(item, {
                    showLabels: true,
                    mobile,
                    onActivate,
                  })
                )}
              </div>
            </div>
          </div>
        </section>
      )
    })
  }

  return (
    <>
      {/* Escritorio: barra lateral colapsable */}
      <aside
        className={cn(
          'hidden flex-col border-r border-sidebar-accent/50 bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out lg:flex',
          sidebarOpen ? 'w-56' : 'w-16'
        )}
      >
        <nav
          className={cn(
            'flex flex-1 flex-col overflow-y-auto overscroll-contain p-2',
            sidebarOpen ? 'gap-1.5' : 'gap-1'
          )}
          aria-label="Navegación principal"
        >
          {renderNavGroups({ showLabels: sidebarOpen })}
        </nav>
      </aside>

      {/* Móvil / tablet: menú a pantalla completa — sin contenido de la app visible detrás */}
      {sidebarOpen ? (
        <div
          className={cn(
            'fixed inset-0 z-[100] flex flex-col bg-sidebar text-sidebar-foreground lg:hidden',
            'duration-200 animate-in fade-in-0',
            'supports-[height:100dvh]:min-h-[100dvh]'
          )}
          style={{ minHeight: '100vh' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-nav-title"
        >
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-sidebar-accent/70 px-4 shadow-sm">
            <div className="min-w-0">
              <p id="mobile-nav-title" className="truncate text-base font-semibold tracking-tight">
                {APP_NAME}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/65">Menú de navegación</p>
            </div>
            <Button
              ref={closeBtnRef}
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
              onClick={() => setSidebarOpen(false)}
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" aria-hidden />
            </Button>
          </header>
          <nav
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3 pb-8"
            aria-label="Enlaces de la aplicación"
          >
            {renderNavGroups({ showLabels: true, mobile: true, onActivate: closeMobileMenu })}
          </nav>
        </div>
      ) : null}
    </>
  )
}
