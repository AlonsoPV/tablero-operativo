import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, User, LogOut, Settings, MapPinned, Moon, Star, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { canAccessRouteByRole } from '@/features/auth/lib/permissions'
import { NotificationHeaderButton } from '@/features/notifications'
import { useActionGamificationScore } from '@/features/disciplina/hooks/useActionGamificationScore'
import { hasPlanAccionAccess } from '@/features/plan-accion/lib/planAccionAccess'
import { APP_NAME, ROUTES } from '@/constants'
import { cn } from '@/lib/utils'

const DISCIPLINE_SCORE_LABEL = 'Cumplimiento'

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const resetOnLogout = useAppStore((s) => s.resetOnLogout)
  const { profile, logout } = useAuth()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const { metrics: gamificationMetrics, isLoading: gamificationLoading } = useActionGamificationScore(profile?.id, {
    enabled: Boolean(profile?.id),
  })
  const showPlanAccion = hasPlanAccionAccess(profile) && canAccessRouteByRole(profile?.rol, ROUTES.PLAN_ACCION)
  const showNotifications = canAccessRouteByRole(profile?.rol, ROUTES.NOTIFICACIONES)
  const showDisciplineScore = canAccessRouteByRole(profile?.rol, ROUTES.DISCIPLINA)

  const handleLogout = async () => {
    resetOnLogout()
    await logout()
    navigate(ROUTES.LOGIN, { replace: true })
  }

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b bg-card px-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label="Alternar menú"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold truncate">{APP_NAME}</h1>
      </div>
      <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" aria-hidden />
          ) : (
            <Moon className="h-4 w-4" aria-hidden />
          )}
        </Button>
        {showPlanAccion ? (
          <Button
            variant={location.pathname === ROUTES.PLAN_ACCION ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'shrink-0 gap-1.5 text-xs sm:text-sm',
              location.pathname === ROUTES.PLAN_ACCION && 'font-medium'
            )}
            asChild
          >
            <Link to={ROUTES.PLAN_ACCION}>
              <MapPinned className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Plan de acción</span>
              <span className="sm:hidden">Plan</span>
            </Link>
          </Button>
        ) : null}
        {profile ? (
          <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
            {showDisciplineScore ? (
              <DisciplineScoreHeaderChip
                percent={gamificationMetrics.fulfillmentPercent}
                points={gamificationMetrics.totalPoints}
                loading={gamificationLoading}
              />
            ) : null}
            <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="min-w-0 gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <span className="hidden min-w-0 max-w-[96px] truncate md:max-w-[120px] lg:max-w-[160px] sm:inline">
                    {profile.nombre}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm font-medium">
                  {profile.nombre}
                </div>
                <p className="px-2 pb-2 text-xs text-muted-foreground truncate">
                  {profile.rol}
                  {profile.area ? ` · ${profile.area}` : ''}
                </p>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={ROUTES.SETTINGS_PROFILE} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Mi perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to={ROUTES.SETTINGS} className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Configuración
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {showNotifications ? (
              <NotificationHeaderButton userId={profile.id} />
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  )
}

function DisciplineScoreHeaderChip({
  percent,
  points,
  loading,
}: {
  percent: number
  points: number
  loading: boolean
}) {
  const ringPercent = Math.max(0, Math.min(100, percent))

  return (
    <Link
      to={ROUTES.DISCIPLINA}
      className={cn(
        'hidden shrink-0 items-center gap-2 rounded-full border py-1 pl-2.5 pr-2 text-xs font-bold tabular-nums leading-none transition-colors hover:bg-muted/40 sm:inline-flex',
        scoreChipClass(percent)
      )}
      title={`${DISCIPLINE_SCORE_LABEL}: ${percent}% · ${points} puntos`}
      aria-label={`${DISCIPLINE_SCORE_LABEL}: ${percent} por ciento, ${points} puntos`}
    >
      <span className="inline-flex items-center gap-1">
        <Star className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden />
        {loading ? '—' : points}
      </span>
      <span className="h-3.5 w-px bg-current opacity-20" aria-hidden />
      <span className="inline-flex items-center gap-1">
        <span
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(currentColor ${ringPercent}%, transparent 0)`,
            opacity: loading ? 0.3 : 1,
          }}
          aria-hidden
        >
          <span className="h-2.5 w-2.5 rounded-full bg-card" />
        </span>
        {loading ? '—' : `${percent}%`}
      </span>
    </Link>
  )
}

function scoreChipClass(percent: number) {
  if (percent >= 85) return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
  if (percent >= 60) return 'border-amber-500/30 bg-amber-500/10 text-amber-700'
  if (percent > 0) return 'border-destructive/30 bg-destructive/10 text-destructive'
  return 'border-border bg-muted/40 text-muted-foreground'
}
