import { Link } from 'react-router-dom'
import { useId, useState } from 'react'
import {
  Users,
  Shield,
  Building2,
  ListOrdered,
  ListTree,
  BarChart3,
  type LucideIcon,
  RefreshCw,
  AlertTriangle,
  Info,
  ArrowUpRight,
} from 'lucide-react'
import { ROUTES } from '@/constants'
import { cn } from '@/lib/utils'
import { SettingsPageShell } from '@/components/layout/SettingsPageShell'
import { SettingsPageHeader } from '@/components/layout/SettingsPageHeader'

type CatalogEntry = {
  title: string
  description: string
  href: string
  cta: string
  icon: LucideIcon
  iconClass: string
}

type CatalogGroup = {
  key: string
  title: string
  subtitle: string
  ringClass: string
  items: CatalogEntry[]
}

const GROUPS: CatalogGroup[] = [
  {
    key: 'organizacion',
    title: 'Organización',
    subtitle: 'Define quién usa el sistema y cómo se estructura el equipo.',
    ringClass: 'ring-blue-500/15',
    items: [
      {
        title: 'Usuarios',
        description: 'Altas, perfiles, responsables y acceso al tablero.',
        href: ROUTES.SETTINGS_USERS,
        cta: 'Ver usuarios',
        icon: Users,
        iconClass: 'bg-blue-500/12 text-blue-700 dark:text-blue-400',
      },
      {
        title: 'Roles',
        description: 'Perfiles visibles y base para permisos por rol.',
        href: ROUTES.SETTINGS_CATALOGS_ROLES,
        cta: 'Configurar roles',
        icon: Shield,
        iconClass: 'bg-blue-500/12 text-blue-700 dark:text-blue-400',
      },
      {
        title: 'Áreas',
        description: 'Departamentos para usuarios, filtros y reportes.',
        href: ROUTES.SETTINGS_CATALOGS_AREAS,
        cta: 'Gestionar áreas',
        icon: Building2,
        iconClass: 'bg-blue-500/12 text-blue-700 dark:text-blue-400',
      },
    ],
  },
  {
    key: 'operacion',
    title: 'Operación diaria',
    subtitle: 'Configura cómo se registra y prioriza el trabajo día a día.',
    ringClass: 'ring-amber-500/15',
    items: [
      {
        title: 'Estatus',
        description: 'Estados del flujo operativo, orden y reglas de cierre.',
        href: ROUTES.SETTINGS_CATALOGS_STATUSES,
        cta: 'Configurar estatus',
        icon: RefreshCw,
        iconClass: 'bg-amber-500/12 text-amber-800 dark:text-amber-300',
      },
      {
        title: 'Prioridades',
        description: 'Niveles de urgencia para acciones y tablero.',
        href: ROUTES.SETTINGS_CATALOGS_PRIORITIES,
        cta: 'Editar prioridades',
        icon: ListOrdered,
        iconClass: 'bg-amber-500/12 text-amber-800 dark:text-amber-300',
      },
      {
        title: 'Listas desplegables',
        description: 'Valores reutilizables (catálogo + opciones) en formularios.',
        href: ROUTES.SETTINGS_CATALOGS_DROPDOWNS,
        cta: 'Gestionar listas',
        icon: ListTree,
        iconClass: 'bg-amber-500/12 text-amber-800 dark:text-amber-300',
      },
    ],
  },
  {
    key: 'medicion',
    title: 'Medición y mejora',
    subtitle: 'Define cómo se mide el desempeño y dónde están las brechas O2C.',
    ringClass: 'ring-emerald-500/15',
    items: [
      {
        title: 'KPIs',
        description: 'Indicadores: unidad, meta, periodicidad y vínculo a gaps.',
        href: ROUTES.SETTINGS_CATALOGS_KPIS,
        cta: 'Editar KPIs',
        icon: BarChart3,
        iconClass: 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300',
      },
      {
        title: 'Brechas (Gaps O2C)',
        description: 'Brechas operativas, área, avance y relación con KPIs y acciones.',
        href: ROUTES.SETTINGS_CATALOGS_GAPS,
        cta: 'Gestionar brechas',
        icon: AlertTriangle,
        iconClass: 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300',
      },
    ],
  },
]

function CatalogItemInfo({
  description,
  open,
  onOpenChange,
  panelId,
}: {
  description: string
  open: boolean
  onOpenChange: (open: boolean) => void
  panelId: string
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`Información: ${description}`}
      title={open ? 'Ocultar descripción' : 'Ver descripción'}
      onClick={() => onOpenChange(!open)}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors sm:hidden',
        'hover:bg-muted hover:text-foreground',
        open && 'bg-muted text-foreground'
      )}
    >
      <Info className="h-4 w-4" aria-hidden />
    </button>
  )
}

function CatalogRow({ item }: { item: CatalogEntry }) {
  const Icon = item.icon
  const [infoOpen, setInfoOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border/55 px-3 py-3 last:border-b-0 sm:items-start sm:gap-x-4 sm:px-4 sm:py-3">
      <div
        className={cn(
          'row-start-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/10',
          item.iconClass
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>

      <div className="row-start-1 min-w-0 space-y-0.5 self-center sm:self-start sm:pt-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <p className="truncate text-sm font-semibold leading-snug text-foreground">{item.title}</p>
          <CatalogItemInfo
            description={item.description}
            open={infoOpen}
            onOpenChange={setInfoOpen}
            panelId={panelId}
          />
        </div>
        <p className="hidden text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere] sm:block sm:text-sm">
          {item.description}
        </p>
      </div>

      <Link
        to={item.href}
        aria-label={item.cta}
        title={item.cta}
        className={cn(
          'row-start-1 inline-flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-xl',
          'border border-border/60 bg-muted/25 text-muted-foreground transition-colors',
          'hover:border-primary/30 hover:bg-primary/10 hover:text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
      >
        <ArrowUpRight className="h-5 w-5" aria-hidden />
      </Link>

      {infoOpen ? (
        <div
          id={panelId}
          role="region"
          aria-label="Descripción del catálogo"
          className="col-span-3 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5 sm:hidden"
        >
          <p className="text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]">{item.description}</p>
        </div>
      ) : null}
    </div>
  )
}

export function CatalogsHomePage() {
  return (
    <SettingsPageShell width="wide" className="space-y-8 sm:space-y-10">
      <SettingsPageHeader
        eyebrow="Catálogos"
        title="Catálogos del sistema"
        description="Listas maestras y parámetros agrupados por lógica de negocio. Elige un bloque y abre solo lo que necesitas."
      />

      <div className="space-y-10">
        {GROUPS.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`catalog-group-${group.key}`}
            className="space-y-3"
          >
            <div className="space-y-1 px-0.5">
              <h2 id={`catalog-group-${group.key}`} className="text-lg font-semibold tracking-tight sm:text-xl">
                {group.title}
              </h2>
              <p className="max-w-3xl text-sm text-muted-foreground">{group.subtitle}</p>
            </div>
            <div
              className={cn(
                'overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-[2px]',
                'ring-1 ring-inset',
                group.ringClass
              )}
            >
              {group.items.map((item) => (
                <CatalogRow key={item.href} item={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </SettingsPageShell>
  )
}
