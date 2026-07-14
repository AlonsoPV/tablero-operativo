import { useMemo, useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/constants'
import { useAuth } from '@/features/auth/hooks/useAuth'
import {
  canAccessRouteByRole,
  canManageAcademyModulesByRole,
  isAnalystByRole,
} from '@/features/auth/lib/permissions'
import { useAppRole } from '@/features/auth/hooks/useAppRole'
import { HorizontalNavScroller } from '@/components/layout/HorizontalNavScroller'
import {
  Users,
  FolderOpen,
  Shield,
  MapPin,
  Flag,
  ArrowUpCircle,
  List,
  Target,
  UserCircle,
  AlertTriangle,
  GraduationCap,
  BellRing,
  ChevronDown,
  Settings2,
  type LucideIcon,
} from 'lucide-react'

const SETTINGS_LINKS = [
  { to: ROUTES.SETTINGS_PROFILE, label: 'Mi perfil', icon: UserCircle },
  { to: ROUTES.SETTINGS_REMINDERS, label: 'Recordatorios', icon: BellRing },
  { to: ROUTES.SETTINGS_USERS, label: 'Usuarios', icon: Users },
  { to: ROUTES.SETTINGS_ACADEMY_MODULES, label: 'Academia', icon: GraduationCap, superAdminOnly: true },
  { to: ROUTES.SETTINGS_CATALOGS, label: 'Catálogos', icon: FolderOpen },
] as const

const CATALOG_LINKS = [
  { to: ROUTES.SETTINGS_CATALOGS, label: 'Inicio', icon: FolderOpen },
  { to: ROUTES.SETTINGS_CATALOGS_ROLES, label: 'Roles', icon: Shield },
  { to: ROUTES.SETTINGS_CATALOGS_AREAS, label: 'Áreas', icon: MapPin },
  { to: ROUTES.SETTINGS_CATALOGS_STATUSES, label: 'Estatus', icon: Flag },
  { to: ROUTES.SETTINGS_CATALOGS_PRIORITIES, label: 'Prioridades', icon: ArrowUpCircle },
  { to: ROUTES.SETTINGS_CATALOGS_DROPDOWNS, label: 'Listas', icon: List },
  { to: ROUTES.SETTINGS_CATALOGS_KPIS, label: 'KPIs', icon: Target },
  { to: ROUTES.SETTINGS_CATALOGS_GAPS, label: 'Brechas O2C', icon: AlertTriangle },
] as const

type NavLink = { to: string; label: string; icon: LucideIcon }

function isActivePath(pathname: string, to: string, options?: { exact?: boolean }) {
  if (options?.exact) return pathname === to
  if (to === ROUTES.SETTINGS_CATALOGS) {
    return pathname === to
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

function NavItem({
  to,
  label,
  icon: Icon,
  active,
  nested = false,
}: {
  to: string
  label: string
  icon: LucideIcon
  active: boolean
  nested?: boolean
}) {
  return (
    <Link
      id={`settings-nav-${to.replace(/\//g, '-').replace(/^-/, '')}`}
      to={to}
      aria-current={active ? 'page' : undefined}
      data-nav-active={active ? 'true' : undefined}
      className={cn(
        'group flex min-w-0 items-center gap-2.5 rounded-lg text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        nested ? 'px-2.5 py-2' : 'px-3 py-2.5',
        active
          ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/15'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
          active ? 'bg-primary/15 text-primary' : 'bg-muted/70 text-muted-foreground group-hover:bg-muted'
        )}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="truncate">{label}</span>
    </Link>
  )
}

function MobilePill({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string
  label: string
  icon: LucideIcon
  active: boolean
}) {
  return (
    <Link
      to={to}
      data-nav-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground'
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {label}
    </Link>
  )
}

export function SettingsLayout() {
  const location = useLocation()
  const { profile } = useAuth()
  const { data: appRole } = useAppRole()
  const onCatalogs = location.pathname.startsWith('/settings/catalogs')
  const [catalogsOpen, setCatalogsOpen] = useState(onCatalogs)

  const visibleSettingsLinks = useMemo(
    () =>
      SETTINGS_LINKS.filter(
        (link) =>
          canAccessRouteByRole(profile?.rol, link.to, appRole) &&
          (!('superAdminOnly' in link) || canManageAcademyModulesByRole(profile?.rol))
      ) as NavLink[],
    [appRole, profile?.rol]
  )

  const visibleCatalogLinks = useMemo(
    () =>
      CATALOG_LINKS.filter((link) =>
        canAccessRouteByRole(profile?.rol, link.to, appRole)
      ) as NavLink[],
    [appRole, profile?.rol]
  )

  const showCatalogNav = visibleCatalogLinks.length > 0
  const catalogsExpanded = catalogsOpen || onCatalogs

  if (isAnalystByRole(profile?.rol) && location.pathname !== ROUTES.SETTINGS_PROFILE) {
    return <Navigate to={ROUTES.SETTINGS_PROFILE} replace />
  }

  return (
    <div
      id="settings-layout"
      className="min-w-0 space-y-4 lg:flex lg:flex-row lg:items-start lg:gap-6 lg:space-y-0 xl:gap-8"
    >
      {/* Mobile / tablet: pills horizontales */}
      <div id="settings-nav-mobile" className="space-y-3 lg:hidden">
        <div className="rounded-xl border border-border/60 bg-card/95 p-3 shadow-sm">
          <HorizontalNavScroller activeKey={location.pathname} label="Configuración">
            {visibleSettingsLinks
              .filter((link) => link.to !== ROUTES.SETTINGS_CATALOGS)
              .map((link) => (
                <MobilePill
                  key={link.to}
                  to={link.to}
                  label={link.label}
                  icon={link.icon}
                  active={isActivePath(location.pathname, link.to)}
                />
              ))}
            {showCatalogNav ? (
              <MobilePill
                to={ROUTES.SETTINGS_CATALOGS}
                label="Catálogos"
                icon={FolderOpen}
                active={onCatalogs}
              />
            ) : null}
          </HorizontalNavScroller>

          {showCatalogNav && onCatalogs ? (
            <div className="mt-3 border-t border-border/50 pt-3">
              <HorizontalNavScroller activeKey={location.pathname} label="Catálogos">
                {visibleCatalogLinks.map((link) => (
                  <MobilePill
                    key={link.to}
                    to={link.to}
                    label={link.label}
                    icon={link.icon}
                    active={isActivePath(location.pathname, link.to, {
                      exact: link.to === ROUTES.SETTINGS_CATALOGS,
                    })}
                  />
                ))}
              </HorizontalNavScroller>
            </div>
          ) : null}
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside id="settings-nav-desktop" className="hidden min-w-0 shrink-0 lg:block lg:w-60 xl:w-64">
        <div
          className={cn(
            'sticky top-4 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm',
            'ring-1 ring-border/30'
          )}
        >
          <div className="border-b border-border/50 bg-gradient-to-br from-muted/40 via-card to-card px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                <Settings2 className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Ajustes
                </p>
                <p className="truncate text-sm font-semibold text-foreground">Configuración</p>
              </div>
            </div>
          </div>

          <nav id="settings-nav-configuracion" aria-label="Configuración" className="space-y-1 p-2.5">
            {visibleSettingsLinks
              .filter((link) => link.to !== ROUTES.SETTINGS_CATALOGS)
              .map((link) => (
                <NavItem
                  key={link.to}
                  to={link.to}
                  label={link.label}
                  icon={link.icon}
                  active={isActivePath(location.pathname, link.to)}
                />
              ))}

            {showCatalogNav ? (
              <div className="pt-1">
                <div
                  className={cn(
                    'overflow-hidden rounded-xl border transition-colors',
                    onCatalogs
                      ? 'border-primary/20 bg-primary/[0.04]'
                      : 'border-border/50 bg-muted/20'
                  )}
                >
                  <div
                    className={cn(
                      'flex w-full items-center gap-1 pr-1 text-sm font-medium',
                      onCatalogs ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <Link
                      id="settings-nav-catalogos-home"
                      to={ROUTES.SETTINGS_CATALOGS}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        onCatalogs ? 'text-primary' : 'hover:text-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                          onCatalogs ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                        )}
                        aria-hidden
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">Catálogos</span>
                    </Link>
                    <button
                      id="settings-nav-catalogos-toggle"
                      type="button"
                      aria-expanded={catalogsExpanded}
                      aria-label={catalogsExpanded ? 'Ocultar catálogos' : 'Mostrar catálogos'}
                      onClick={() => setCatalogsOpen((open) => !open)}
                      className={cn(
                        'mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                        'hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    >
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 transition-transform',
                          catalogsExpanded && 'rotate-180'
                        )}
                        aria-hidden
                      />
                    </button>
                  </div>

                  {catalogsExpanded ? (
                    <div
                      id="settings-nav-catalogos"
                      aria-label="Catálogos"
                      className="space-y-0.5 border-t border-border/40 px-1.5 py-1.5"
                    >
                      {visibleCatalogLinks.map((link) => (
                        <NavItem
                          key={link.to}
                          to={link.to}
                          label={link.label}
                          icon={link.icon}
                          nested
                          active={isActivePath(location.pathname, link.to, {
                            exact: link.to === ROUTES.SETTINGS_CATALOGS,
                          })}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </nav>
        </div>
      </aside>

      <main id="settings-main" className="min-w-0 flex-1 pb-2 lg:pb-4">
        <Outlet />
      </main>
    </div>
  )
}
