{% raw %}
# Landing `/producto` — código completo para replicar

Documento generado desde el código fuente de `src/pages/product/` y sus dependencias UI.
Ruta pública: `/producto` → `ProductLandingPage`.

## Índice de archivos

| Archivo | Rol |
|---|---|
| `ProductLandingPage.tsx` | Orquestador de la página |
| `ProductHero.tsx` | Nav + hero |
| `ProductSections.tsx` | Problema, cultura, CTAs, capacidades, cierre |
| `ProductDemos.tsx` | Demos interactivos (Kanban, Dashboard, IA) |
| `ProductUI.tsx` | Shell, tipografía, CTAs, cards |
| `ProductVisual.tsx` | Patrones visuales / paneles |
| `landingSeo.ts` + `LandingSeoHead.tsx` | SEO / JSON-LD |
| `DemoRequest*.tsx` + `demoRequest.types.ts` | Modal solicitar demo |
| `RevealSection.tsx`, `CountUpValue.tsx`, `StatusToken.tsx`, `ExecutiveCaseSplit.tsx` | Utilidades UI |
| shadcn UI + `SectionCard` + formularios de acción + `globals.css` | Dependencias de réplica |

## Stack y dependencias npm

- React + TypeScript + Tailwind CSS
- `react-router-dom` (ruta lazy)
- `lucide-react` (iconos)
- `@dnd-kit/core` (demo Kanban drag & drop)
- `react-hook-form` + `zod` + `@hookform/resolvers` (formulario demo)
- `clsx` + `tailwind-merge` (`cn`)
- `class-variance-authority` (button/badge/label)
- `@radix-ui/react-slot`, `@radix-ui/react-dialog`, `@radix-ui/react-label`, `@radix-ui/react-select`, `@radix-ui/react-tooltip`

## Ruta

```tsx
{
  path: '/producto',
  lazy: async () => {
    const { ProductLandingPage } = await import('@/pages/product/ProductLandingPage')
    return { Component: ProductLandingPage }
  },
},
```

## Árbol de composición

```
DemoRequestProvider
├── LandingSeoHead
├── ProductHero (ProductNav + HeroProduct)
├── ProblemSection
├── CultureShiftSection
├── ProductInAction      (ProductDemos)
├── DashboardDemo        (ProductDemos)
├── MidPageCTA
├── AIDemo               (ProductDemos)
├── MoreCapabilitiesSection
├── CloseSection
└── Footer
```

---

## Código fuente — `src/pages/product/`

### `src/pages/product/CountUpValue.tsx`

```tsx
import { cn } from '@/lib/utils'
import { useCountUp, useCountUpDecimal } from '@/hooks/useCountUp'

export function CountUpInteger({
  target,
  suffix = '',
  className,
}: {
  target: number
  suffix?: string
  className?: string
}) {
  const { ref, value } = useCountUp(target)
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {value}
      {suffix}
    </span>
  )
}

export function CountUpDecimal({
  target,
  suffix = '',
  className,
}: {
  target: number
  suffix?: string
  className?: string
}) {
  const { ref, value } = useCountUpDecimal(target)
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {value.toFixed(1)}
      {suffix}
    </span>
  )
}
```

### `src/pages/product/demoRequest.types.ts`

```ts
import { z } from 'zod'

export const demoTeamSizeOptions = [
  { value: '1-15', label: '1–15 personas' },
  { value: '16-50', label: '16–50 personas' },
  { value: '51-200', label: '51–200 personas' },
  { value: '200+', label: '200+ personas' },
] as const

export const demoNeedOptions = [
  { value: 'visibilidad', label: 'Visibilidad para dirección' },
  { value: 'seguimiento', label: 'Seguimiento de compromisos' },
  { value: 'indicadores', label: 'Indicadores / OKRs' },
  { value: 'comunicacion', label: 'Comunicación entre equipos' },
] as const

export const demoRequestSchema = z.object({
  name: z.string().trim().min(2, 'Indica tu nombre'),
  email: z.string().trim().email('Email corporativo válido'),
  company: z.string().trim().min(2, 'Indica tu empresa'),
  teamSize: z.enum(['1-15', '16-50', '51-200', '200+']),
  need: z.enum(['visibilidad', 'seguimiento', 'indicadores', 'comunicacion']),
})

export type DemoRequestValues = z.infer<typeof demoRequestSchema>

export function demoNeedLabel(value: DemoRequestValues['need']) {
  return demoNeedOptions.find((option) => option.value === value)?.label ?? value
}

export function demoTeamSizeLabel(value: DemoRequestValues['teamSize']) {
  return demoTeamSizeOptions.find((option) => option.value === value)?.label ?? value
}

export function buildDemoMailto(values: DemoRequestValues) {
  const subject = encodeURIComponent(`Demo SCRUMBAN — ${values.company}`)
  const body = encodeURIComponent(
    [
      'Hola, me gustaría conocer SCRUMBAN.',
      '',
      `Nombre: ${values.name}`,
      `Email: ${values.email}`,
      `Empresa: ${values.company}`,
      `Tamaño del equipo: ${demoTeamSizeLabel(values.teamSize)}`,
      `Necesidad principal: ${demoNeedLabel(values.need)}`,
    ].join('\n')
  )
  return `mailto:demo@scrumban.mx?subject=${subject}&body=${body}`
}
```

### `src/pages/product/DemoRequestContext.tsx`

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { DemoRequestDialog } from './DemoRequestDialog'

type DemoRequestContextValue = {
  openDemoRequest: () => void
}

const DemoRequestContext = createContext<DemoRequestContextValue | null>(null)

export function DemoRequestProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openDemoRequest = useCallback(() => setOpen(true), [])

  const value = useMemo(() => ({ openDemoRequest }), [openDemoRequest])

  return (
    <DemoRequestContext.Provider value={value}>
      {children}
      <DemoRequestDialog open={open} onOpenChange={setOpen} />
    </DemoRequestContext.Provider>
  )
}

export function useDemoRequest() {
  const context = useContext(DemoRequestContext)
  if (!context) {
    throw new Error('useDemoRequest debe usarse dentro de DemoRequestProvider')
  }
  return context
}
```

### `src/pages/product/DemoRequestDialog.tsx`

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  buildDemoMailto,
  demoNeedOptions,
  demoRequestSchema,
  demoTeamSizeOptions,
  type DemoRequestValues,
} from './demoRequest.types'

async function submitDemoRequest(values: DemoRequestValues) {
  const response = await fetch('/api/demo-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  if (!response.ok) {
    throw new Error('submit_failed')
  }
}

export function DemoRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [success, setSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const form = useForm<DemoRequestValues>({
    resolver: zodResolver(demoRequestSchema),
    defaultValues: {
      name: '',
      email: '',
      company: '',
      teamSize: '16-50',
      need: 'visibilidad',
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = form

  const teamSize = watch('teamSize')
  const need = watch('need')

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    if (!next) {
      window.setTimeout(() => {
        setSuccess(false)
        setSubmitError(null)
        reset()
      }, 200)
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      await submitDemoRequest(values)
      setSuccess(true)
    } catch {
      try {
        window.location.href = buildDemoMailto(values)
        setSuccess(true)
      } catch {
        setSubmitError('No pudimos enviar la solicitud. Escríbenos a demo@scrumban.mx')
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="border-b border-border/60 bg-gradient-to-br from-muted/40 via-background to-primary/[0.04] px-5 py-5 sm:px-6">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-xl font-semibold tracking-tight">
              Solicitar demo
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Cuatro datos. Te contactamos en menos de 24 h.
            </DialogDescription>
          </DialogHeader>
        </div>

        {success ? (
          <div className="space-y-4 px-5 py-8 text-center sm:px-6">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <p className="text-base font-semibold text-foreground">Solicitud recibida</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Un asesor revisará tu caso y te escribirá pronto para agendar la demo.
              </p>
            </div>
            <Button
              type="button"
              className="w-full rounded-full"
              onClick={() => handleOpenChange(false)}
            >
              Entendido
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 px-5 py-5 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="demo-name">Nombre</Label>
                <Input
                  id="demo-name"
                  autoComplete="name"
                  placeholder="Ana Martínez"
                  className="h-10 rounded-lg"
                  {...register('name')}
                />
                {errors.name ? (
                  <p className="text-xs text-destructive">{errors.name.message}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="demo-email">Email corporativo</Label>
                <Input
                  id="demo-email"
                  type="email"
                  autoComplete="email"
                  placeholder="ana@empresa.com"
                  className="h-10 rounded-lg"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="demo-company">Empresa</Label>
              <Input
                id="demo-company"
                autoComplete="organization"
                placeholder="Nombre de la organización"
                className="h-10 rounded-lg"
                {...register('company')}
              />
              {errors.company ? (
                <p className="text-xs text-destructive">{errors.company.message}</p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tamaño del equipo</Label>
                <Select
                  value={teamSize}
                  onValueChange={(value) =>
                    setValue('teamSize', value as DemoRequestValues['teamSize'], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {demoTeamSizeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>¿Qué necesitas?</Label>
                <Select
                  value={need}
                  onValueChange={(value) =>
                    setValue('need', value as DemoRequestValues['need'], { shouldValidate: true })
                  }
                >
                  <SelectTrigger className="h-10 rounded-lg">
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {demoNeedOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}

            <Button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'h-11 w-full gap-2 rounded-full text-sm font-semibold shadow-lg shadow-primary/20'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Enviando…
                </>
              ) : (
                <>
                  Enviar solicitud
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Sin compromiso · Demo personalizada · Respuesta en 24 h
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

### `src/pages/product/ExecutiveCaseSplit.tsx`

```tsx
/**
 * Argumento ejecutivo: dolor vs resultado con SCRUMBAN.
 * Cifras de ejemplo — validar con negocio antes de publicar.
 */
export function ExecutiveCaseSplit() {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-border/60 md:grid-cols-2">
      <div className="flex flex-col justify-center bg-muted/40 p-8 md:p-10">
        <span className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
          Sin visibilidad
        </span>
        <p className="mt-3 text-lg leading-relaxed text-foreground/90">
          Un compromiso lleva 6 días atrasado. Nadie te avisó porque nadie lo vio como riesgo — hasta
          que se convierte en el problema que explicas en el comité.
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Te enteras en la junta. Reaccionas, no diriges.
        </p>
      </div>
      <div className="flex flex-col justify-center bg-foreground p-8 text-background md:p-10">
        <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">
          Con SCRUMBAN
        </span>
        <p className="mt-3 text-lg leading-relaxed">
          El mismo compromiso se marca en rojo el día 2. Tu tablero te lo muestra antes de que sea una
          junta de crisis.
        </p>
        <p className="mt-4 text-sm text-background/70">
          Intervienes a tiempo. Diriges, no reaccionas.
        </p>
      </div>
    </div>
  )
}
```

### `src/pages/product/landingSeo.ts`

```ts
/** Metadescripciones de la landing SCRUMBAN — fuente única para `<head>` y JSON-LD. */
export const LANDING_SEO = {
  siteName: 'SCRUMBAN',
  title: 'SCRUMBAN | Gestión operativa visible y medible',
  description:
    'SCRUMBAN centraliza compromisos operativos con responsables, KPIs y trazabilidad. Visibilidad para dirección sin perseguir pendientes por chat.',
  keywords:
    'gestión operativa, kanban, compromisos, KPIs, OKR, tablero operativo, scrumban, visibilidad dirección',
  path: '/producto',
  sections: {
    inicio: {
      id: 'inicio',
      name: 'Cultura de ejecución visible',
      description:
        'Construye una cultura de ejecución visible, medible y responsable. Convierte pendientes dispersos en compromisos con dueño, fecha y KPIs conectados.',
    },
    problema: {
      id: 'problema',
      name: 'El costo de operar a ciegas',
      description:
        'Información dispersa, compromisos ambiguos y decisiones tardías erosionan la coordinación. SCRUMBAN unifica comunicación, asignación y seguimiento.',
    },
    cultura: {
      id: 'cultura',
      name: 'De seguimiento informal a ejecución medible',
      description:
        'Pasa de chats y juntas sin trazabilidad a solicitudes centralizadas, responsables claros y KPIs ligados a la operación diaria.',
    },
    producto: {
      id: 'como-funciona',
      name: 'Producto en acción',
      description:
        'Cada solicitud se convierte en compromiso gestionable: kanban con estados, responsable, evidencia y trazabilidad hasta verificación.',
    },
    indicadores: {
      id: 'indicadores',
      name: 'Valor para Dirección',
      description:
        'Atención inmediata, ICO, tiempos de cierre y OKRs en un tablero ejecutivo. Detecta retrasos y riesgos antes de la junta de crisis.',
    },
    diagnostico: {
      id: 'diagnostico',
      name: 'Diagnóstico operativo',
      description:
        'Identifica dónde pierde seguimiento tu operación hoy. Agenda un diagnóstico personalizado con el equipo SCRUMBAN.',
    },
    ia: {
      id: 'ia',
      name: 'Asistente IA operativo',
      description:
        'Ante un bloqueo, el asistente valida contexto, evidencia de cierre y próximos pasos con el mismo flujo del tablero real.',
    },
    capacidades: {
      id: 'capacidades',
      name: 'Capacidades conectadas',
      description:
        'Comunicación operativa, gestión de compromisos, trazabilidad, KPIs y visibilidad para dirección en un solo sistema integrado.',
    },
    cierre: {
      id: 'cierre',
      name: 'Resultado para Dirección',
      description:
        'Saber qué ocurre en la operación sin preguntarlo: visibilidad en tiempo real, intervención oportuna y confiabilidad en los compromisos.',
    },
  },
} as const

export type LandingSectionSeoKey = keyof typeof LANDING_SEO.sections

export function getLandingCanonicalUrl(path = LANDING_SEO.path) {
  const base = import.meta.env.VITE_APP_URL?.replace(/\/$/, '') ?? 'https://scrumbanemx.vercel.app'
  return `${base}${path}`
}

export function getLandingSectionUrl(sectionId: string) {
  return `${getLandingCanonicalUrl()}#${sectionId}`
}
```

### `src/pages/product/LandingSeoHead.tsx`

```tsx
import { useEffect } from 'react'
import { getLandingCanonicalUrl, getLandingSectionUrl, LANDING_SEO } from './landingSeo'

const JSON_LD_ID = 'scrumban-landing-jsonld'

function upsertMeta(selector: string, create: () => HTMLMetaElement, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = create()
    document.head.appendChild(element)
  }
  element.content = content
}

function upsertLink(rel: string, href: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }
  element.href = href
}

function buildJsonLd() {
  const url = getLandingCanonicalUrl()
  const sections = Object.values(LANDING_SEO.sections)

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: LANDING_SEO.siteName,
        url,
        description: LANDING_SEO.description,
      },
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        url,
        name: LANDING_SEO.title,
        description: LANDING_SEO.description,
        isPartOf: { '@id': `${url}#website` },
        about: {
          '@type': 'SoftwareApplication',
          name: LANDING_SEO.siteName,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: LANDING_SEO.description,
        },
        hasPart: sections.map((section) => ({
          '@type': 'WebPageElement',
          name: section.name,
          description: section.description,
          url: getLandingSectionUrl(section.id),
        })),
      },
    ],
  }
}

/** Metadatos globales de la landing (`<head>` + JSON-LD por sección). */
export function LandingSeoHead() {
  useEffect(() => {
    const previousTitle = document.title
    const canonical = getLandingCanonicalUrl()

    document.title = LANDING_SEO.title

    upsertMeta(
      'meta[name="description"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'description'
        return meta
      },
      LANDING_SEO.description
    )

    upsertMeta(
      'meta[name="keywords"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'keywords'
        return meta
      },
      LANDING_SEO.keywords
    )

    upsertMeta(
      'meta[property="og:title"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:title')
        return meta
      },
      LANDING_SEO.title
    )

    upsertMeta(
      'meta[property="og:description"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:description')
        return meta
      },
      LANDING_SEO.description
    )

    upsertMeta(
      'meta[property="og:type"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:type')
        return meta
      },
      'website'
    )

    upsertMeta(
      'meta[property="og:url"]',
      () => {
        const meta = document.createElement('meta')
        meta.setAttribute('property', 'og:url')
        return meta
      },
      canonical
    )

    upsertMeta(
      'meta[name="twitter:card"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:card'
        return meta
      },
      'summary_large_image'
    )

    upsertMeta(
      'meta[name="twitter:title"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:title'
        return meta
      },
      LANDING_SEO.title
    )

    upsertMeta(
      'meta[name="twitter:description"]',
      () => {
        const meta = document.createElement('meta')
        meta.name = 'twitter:description'
        return meta
      },
      LANDING_SEO.description
    )

    upsertLink('canonical', canonical)

    let jsonLd = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null
    if (!jsonLd) {
      jsonLd = document.createElement('script')
      jsonLd.id = JSON_LD_ID
      jsonLd.type = 'application/ld+json'
      document.head.appendChild(jsonLd)
    }
    jsonLd.textContent = JSON.stringify(buildJsonLd())

    return () => {
      document.title = previousTitle
    }
  }, [])

  return null
}

/** Metadescripción accesible por sección (complementa el JSON-LD). */
export function LandingSectionSeo({ description }: { description: string }) {
  return <p className="sr-only">{description}</p>
}
```

### `src/pages/product/ProductDemos.tsx`

```tsx
/**
 * Demos locales de la landing.
 * Todo el estado vive en memoria del componente: no llama servicios, no escribe
 * en Supabase, no toca el Kanban real ni guarda en localStorage/sessionStorage.
 */
import { useState, type FormEvent } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  FileCheck,
  Filter,
  GripVertical,
  ListChecks,
  MoreVertical,
  PlayCircle,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { AccionFormBlock } from '@/features/operations/components/form/AccionFormBlock'
import { AccionFormField } from '@/features/operations/components/AccionFormSection'
import { AccionPriorityBadge } from '@/features/operations/components/AccionPriorityBadge'
import { cn } from '@/lib/utils'
import { useCountUp } from '@/hooks/useCountUp'
import { CountUpDecimal, CountUpInteger } from './CountUpValue'
import {
  Eyebrow,
  LandingCard,
  LandingSection,
  LandingShell,
  SectionLead,
  SectionTitle,
} from './ProductUI'
import { ModuleMetaBadge, StatusPill } from './ProductVisual'
import { LANDING_SEO } from './landingSeo'

const owners = ['Ana Martínez', 'Juan Reyes', 'Laura Cruz'] as const
const priorities = [
  { value: 'Alta', dot: 'bg-destructive' },
  { value: 'Media', dot: 'bg-amber-500' },
  { value: 'Baja', dot: 'bg-emerald-500' },
] as const
const validations = ['Correo de validación', 'Evidencia adjunta', 'Checklist completo'] as const

type ColumnId = 'asignado' | 'seguimiento' | 'retraso' | 'hecho' | 'verificado'

type DemoCard = {
  id: string
  publicId: string
  title: string
  description: string
  owner: string
  ownerName: string
  date: string
  priority: 'Alta' | 'Media' | 'Baja'
  column: ColumnId
  validation: string
  checklist: { total: number; completed: number }
  ageLabel: string
}

const initialCards: DemoCard[] = [
  {
    id: '1',
    publicId: 'AC-1042',
    title: 'Validar propuesta con Finanzas',
    description:
      'Revisar condiciones comerciales y obtener validación formal de Finanzas antes de enviar al cliente.',
    owner: 'AM',
    ownerName: 'Ana Martínez',
    date: 'Hoy',
    priority: 'Alta',
    column: 'asignado',
    validation: 'Correo de validación',
    checklist: { total: 3, completed: 1 },
    ageLabel: 'Abierta hace 2 días',
  },
  {
    id: '2',
    publicId: 'AC-1048',
    title: 'Actualizar política de devoluciones',
    description:
      'Alinear la política con operaciones y publicar la versión vigente para el equipo comercial.',
    owner: 'JR',
    ownerName: 'Juan Reyes',
    date: '19 sep',
    priority: 'Media',
    column: 'asignado',
    validation: 'Checklist completo',
    checklist: { total: 2, completed: 0 },
    ageLabel: 'Abierta hace 1 día',
  },
  {
    id: '3',
    publicId: 'AC-1051',
    title: 'Revisar evidencia de entrega',
    description:
      'Confirmar que la evidencia adjunta cubre el criterio de cierre y deja trazabilidad del compromiso.',
    owner: 'LC',
    ownerName: 'Laura Cruz',
    date: '20 sep',
    priority: 'Baja',
    column: 'seguimiento',
    validation: 'Evidencia adjunta',
    checklist: { total: 4, completed: 2 },
    ageLabel: 'Abierta hace 3 días',
  },
  {
    id: '4',
    publicId: 'AC-1055',
    title: 'Confirmar cierre con cliente',
    description:
      'Validar aceptación del cliente y dejar registro de la confirmación para mover a verificado.',
    owner: 'MP',
    ownerName: 'Mario Pérez',
    date: '21 sep',
    priority: 'Media',
    column: 'hecho',
    validation: 'Correo de validación',
    checklist: { total: 2, completed: 2 },
    ageLabel: 'Abierta hace 4 días',
  },
  {
    id: '5',
    publicId: 'AC-1038',
    title: 'Renovar contrato con proveedor',
    description:
      'Fecha límite vencida; escalar con legal y obtener firma antes del cierre del mes.',
    owner: 'JR',
    ownerName: 'Juan Reyes',
    date: 'Vencida',
    priority: 'Alta',
    column: 'retraso',
    validation: 'Correo de validación',
    checklist: { total: 3, completed: 1 },
    ageLabel: 'Abierta hace 6 días',
  },
  {
    id: '6',
    publicId: 'AC-1031',
    title: 'Publicar reporte mensual',
    description:
      'Reporte operativo cerrado y verificado con evidencia adjunta en el tablero.',
    owner: 'LC',
    ownerName: 'Laura Cruz',
    date: '18 sep',
    priority: 'Baja',
    column: 'verificado',
    validation: 'Evidencia adjunta',
    checklist: { total: 2, completed: 2 },
    ageLabel: 'Cerrada hace 2 días',
  },
]

const columns: Array<{
  id: ColumnId
  title: string
  estadoLabel: string
  Icon: typeof Clock
  border: string
  bg: string
  iconClass: string
}> = [
  {
    id: 'asignado',
    title: 'Pendiente',
    estadoLabel: 'Pendiente',
    Icon: Clock,
    border: 'border-l-slate-400',
    bg: 'bg-slate-500/5',
    iconClass: 'text-slate-500',
  },
  {
    id: 'seguimiento',
    title: 'En ejecución',
    estadoLabel: 'En ejecución',
    Icon: PlayCircle,
    border: 'border-l-blue-400',
    bg: 'bg-blue-500/5',
    iconClass: 'text-blue-600',
  },
  {
    id: 'retraso',
    title: 'Retraso',
    estadoLabel: 'Retraso',
    Icon: AlertTriangle,
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/5',
    iconClass: 'text-orange-600',
  },
  {
    id: 'hecho',
    title: 'Hecho',
    estadoLabel: 'Hecho',
    Icon: CheckCircle2,
    border: 'border-l-emerald-400',
    bg: 'bg-emerald-500/5',
    iconClass: 'text-emerald-600',
  },
  {
    id: 'verificado',
    title: 'Verificado',
    estadoLabel: 'Verificado',
    Icon: BadgeCheck,
    border: 'border-l-violet-400',
    bg: 'bg-violet-500/5',
    iconClass: 'text-violet-600',
  },
]

const estadoBadgeClass: Record<ColumnId, string> = {
  asignado: 'bg-slate-500/15 text-slate-800 dark:text-slate-200',
  seguimiento: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  retraso: 'bg-orange-500/15 text-orange-800 dark:text-orange-200',
  hecho: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  verificado: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
}

function DemoReadonlyValue({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 min-h-5 whitespace-pre-wrap break-words text-sm font-medium text-foreground">
        {value || <span className="text-muted-foreground">Sin dato</span>}
      </div>
    </div>
  )
}

const inputBase =
  'rounded-md border-input bg-background shadow-sm focus-visible:ring-1 focus-visible:ring-ring'

function formatDemoDueLabel(fecha: string, hora: string): string {
  if (!fecha) return hora || 'Sin fecha'
  const date = new Date(`${fecha}T12:00:00`)
  if (Number.isNaN(date.getTime())) return `${fecha} · ${hora}`
  const day = date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  return `${day} · ${hora}`
}

function DemoCreateAccionForm({
  onCreate,
  created,
}: {
  created: boolean
  onCreate: (input: {
    title: string
    description: string
    ownerName: string
    priority: DemoCard['priority']
    dateLabel: string
    validation: string
  }) => void
}) {
  const [title, setTitle] = useState('Confirmar alcance y fecha de entrega con el cliente')
  const [description, setDescription] = useState(
    'Definir alcance, fecha compromiso y evidencia de validación con el cliente para cerrar sin ambigüedad.'
  )
  const [owner, setOwner] = useState<string>(owners[0])
  const [priority, setPriority] = useState<DemoCard['priority']>('Alta')
  const [fecha, setFecha] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 2)
    return d.toISOString().slice(0, 10)
  })
  const [hora, setHora] = useState('18:00')
  const [requiereEvidencia, setRequiereEvidencia] = useState(true)
  const [validation, setValidation] = useState<string>(validations[0])
  const [blocksOpen, setBlocksOpen] = useState({ principal: false, validacion: false })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onCreate({
      title: title.trim() || 'Acción demo',
      description: description.trim(),
      ownerName: owner,
      priority,
      dateLabel: formatDemoDueLabel(fecha, hora),
      validation: requiereEvidencia ? validation : 'No requiere evidencia',
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-col overflow-hidden"
      data-accion-form-mode="create"
    >
      <div className="shrink-0 border-b border-border/60 bg-card px-3 py-2.5 sm:px-4 sm:py-3">
        <h2 className="text-sm font-semibold leading-tight tracking-tight sm:text-base">Nueva acción</h2>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">
          Completa los datos para crear la acción
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-3 py-3 sm:space-y-4 sm:px-5 sm:py-4">
        <AccionFormBlock
          blockId="demo-block-principal"
          step={1}
          title="Información principal"
          subtitle="¿Qué se hará, quién lo hará y para cuándo?"
          icon={CalendarClock}
          expanded={blocksOpen.principal}
          onToggle={() => setBlocksOpen((b) => ({ ...b, principal: !b.principal }))}
          collapsedSummary={title}
        >
          <fieldset className="space-y-4">
            <AccionFormField label="Título de la acción" htmlFor="demo-titulo" required>
              <Input
                id="demo-titulo"
                value={title}
                maxLength={70}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej: Revisar informe mensual"
                className={cn(inputBase, 'h-10')}
              />
              <p className="text-xs text-muted-foreground">{title.length}/70</p>
            </AccionFormField>

            <AccionFormField label="Descripción" htmlFor="demo-descripcion" required>
              <textarea
                id="demo-descripcion"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Describe la acción: qué implica, qué buscas lograr y para qué."
                className={cn(
                  inputBase,
                  'flex min-h-[88px] w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring'
                )}
              />
            </AccionFormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
              <AccionFormField
                label="Responsable de ejecutar"
                htmlFor="demo-responsable"
                hint="Persona que ejecuta y cierra la acción."
                hintAsIcon
                required
              >
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger id="demo-responsable" className={cn(inputBase, 'h-10')}>
                    <SelectValue placeholder="Seleccionar responsable" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccionFormField>

              <AccionFormField
                label="Prioridad"
                htmlFor="demo-prioridad"
                hint="Urgencia según el catálogo O2C."
                hintAsIcon
                required
              >
                <div className="flex flex-wrap gap-2" id="demo-prioridad">
                  {priorities.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setPriority(item.value)}
                      className={cn(
                        'rounded-md transition',
                        priority === item.value && 'ring-2 ring-primary/25'
                      )}
                    >
                      <AccionPriorityBadge
                        prioridad={item.value}
                        className={priority === item.value ? 'shadow-sm' : undefined}
                      />
                    </button>
                  ))}
                </div>
              </AccionFormField>
            </div>

            <AccionFormField label="Fecha y hora límite" htmlFor="demo-fecha" required>
              <div className="grid gap-2 min-[380px]:grid-cols-[minmax(0,1fr)_8.5rem]">
                <Input
                  id="demo-fecha"
                  type="date"
                  value={fecha}
                  onChange={(event) => setFecha(event.target.value)}
                  className={cn(inputBase, 'h-10')}
                />
                <Input
                  id="demo-hora"
                  type="time"
                  value={hora}
                  step={60}
                  onChange={(event) => setHora(event.target.value)}
                  className={cn(inputBase, 'h-10')}
                />
              </div>
            </AccionFormField>
          </fieldset>
        </AccionFormBlock>

        <AccionFormBlock
          blockId="demo-block-validacion"
          step={2}
          title="Evidencia y validación"
          subtitle="Opcional: define evidencia solo si hace falta comprobar el cierre."
          icon={FileCheck}
          expanded={blocksOpen.validacion}
          onToggle={() => setBlocksOpen((b) => ({ ...b, validacion: !b.validacion }))}
        >
          <label
            htmlFor="demo-requiere-evidencia"
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
          >
            <input
              id="demo-requiere-evidencia"
              type="checkbox"
              checked={requiereEvidencia}
              onChange={(event) => setRequiereEvidencia(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-1"
            />
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm font-medium text-foreground">Requiere evidencia</span>
              <span className="block text-xs text-muted-foreground">
                Actívalo solo si el cierre debe comprobarse con un tipo de evidencia.
              </span>
            </span>
          </label>

          {requiereEvidencia ? (
            <AccionFormField
              label="¿Qué evidencia comprobará que se hizo?"
              htmlFor="demo-evidencia"
              required
            >
              <Select value={validation} onValueChange={setValidation}>
                <SelectTrigger id="demo-evidencia" className={cn(inputBase, 'h-10')}>
                  <SelectValue placeholder="Seleccionar evidencia" />
                </SelectTrigger>
                <SelectContent>
                  {validations.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </AccionFormField>
          ) : null}
        </AccionFormBlock>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 bg-card/95 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              'text-xs font-semibold',
              created ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
            )}
          >
            {created
              ? '✓ Solo en esta demo · No se guardó nada'
              : 'Interactiva · No crea acciones reales'}
          </span>
          <div className="flex items-center gap-2">
            <Button type="submit" className="h-10 rounded-lg px-4 font-semibold">
              Crear acción
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}

function KanbanCardFace({ card }: { card: DemoCard }) {
  return (
    <div className="scale-[1.02] cursor-grabbing rounded-xl border border-border/60 bg-card p-3 text-left shadow-xl ring-2 ring-primary/15">
      <div className="flex items-start gap-2 pr-1">
        <AccionPriorityBadge prioridad={card.priority} compact className="mt-0.5 max-w-[6.5rem] shrink-0" />
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{card.title}</p>
      </div>
      <p className="mt-1 truncate pl-[18px] text-xs text-muted-foreground">{card.ownerName}</p>
    </div>
  )
}

function DraggableCard({
  card,
  onOpen,
}: {
  card: DemoCard
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { column: card.column },
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group transition-all duration-200 ease-out',
        isDragging ? 'z-20 opacity-30' : 'opacity-100'
      )}
    >
      <div className="flex items-start gap-0.5">
        <button
          type="button"
          className="mt-3 shrink-0 cursor-grab touch-none rounded-md p-0.5 text-muted-foreground hover:bg-muted/60 active:cursor-grabbing"
          aria-label="Arrastrar acción"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'rounded-xl border border-border/60 bg-card p-3 shadow-sm',
              'transition-all duration-200 hover:border-border hover:shadow-md'
            )}
          >
            <div className="flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => onOpen(card.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-start gap-2 pr-1">
                  <AccionPriorityBadge
                    prioridad={card.priority}
                    compact
                    className="mt-0.5 max-w-[6.5rem] shrink-0"
                  />
                  <p
                    className="line-clamp-2 text-sm font-medium leading-snug text-foreground"
                    title={card.title}
                  >
                    {card.title}
                  </p>
                </div>
                <p className="mt-1 truncate pl-[18px] text-xs text-muted-foreground">
                  <span>{card.ownerName}</span>
                  <span className="text-muted-foreground/50"> • </span>
                  <span className="font-medium tabular-nums text-foreground/80">
                    {card.checklist.completed}/{card.checklist.total}
                  </span>
                  <span className="text-muted-foreground/50"> • </span>
                  <span className="font-medium">{card.ageLabel.replace(/^Abierta\s+/i, '')}</span>
                </p>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:bg-muted/60"
                aria-label="Ver acción"
                onClick={() => onOpen(card.id)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DemoAccionDetailModal({
  card,
  onClose,
}: {
  card: DemoCard
  onClose: () => void
}) {
  const column = columns.find((item) => item.id === card.column)
  const estadoLabel = column?.estadoLabel ?? 'Pendiente'

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end bg-foreground/40 p-0 backdrop-blur-sm sm:place-items-center sm:p-5"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Acción ${card.publicId}`}
        className={cn(
          'flex w-full max-w-none flex-col overflow-hidden border border-border/60 bg-card shadow-xl',
          'h-[min(92dvh,900px)] rounded-t-2xl sm:h-auto sm:max-h-[min(90dvh,900px)] sm:max-w-2xl sm:rounded-lg'
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-border/60 bg-card px-3 py-2.5 pr-11 sm:px-4 sm:py-3 sm:pr-12">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 pr-1">
              <h2 className="text-sm font-semibold leading-tight tracking-tight sm:text-base">
                Editar acción
              </h2>
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground sm:text-xs">
                Demo local · No modifica el tablero real
              </p>
            </div>
            <div
              className="inline-flex w-fit max-w-full min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1 sm:max-w-[60%] sm:shrink-0"
              aria-label={`Acción ${card.publicId}, estado ${estadoLabel}, prioridad ${card.priority}`}
            >
              <span className="truncate text-xs font-semibold tabular-nums text-foreground">
                {card.publicId}
              </span>
              <span className="h-3 w-px shrink-0 bg-border/80" aria-hidden />
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                  estadoBadgeClass[card.column]
                )}
              >
                {estadoLabel}
              </span>
              <span className="h-3 w-px shrink-0 bg-border/80" aria-hidden />
              <AccionPriorityBadge prioridad={card.priority} compact className="max-w-[9rem]" />
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3 h-10 w-10 text-muted-foreground sm:right-4 sm:top-4 sm:h-8 sm:w-8"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-3 py-3 sm:space-y-5 sm:px-5 sm:py-4 md:px-6 md:py-5">
          <SectionCard className="border-primary/25 shadow-sm ring-1 ring-primary/10">
            <div className="flex items-start gap-2.5 border-b border-border/50 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 sm:h-10 sm:w-10">
                <CalendarClock className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                  Paso 1
                </p>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground sm:text-[15px]">
                  Información principal
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ¿Qué se hará, quién lo hará y para cuándo?
                </p>
              </div>
            </div>
            <SectionCardBody className="space-y-3 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DemoReadonlyValue label="Título de la acción" value={card.title} />
                <DemoReadonlyValue label="Responsable de ejecutar" value={card.ownerName} />
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Prioridad
                  </p>
                  <div className="mt-1.5">
                    <AccionPriorityBadge prioridad={card.priority} />
                  </div>
                </div>
                <div>
                  <DemoReadonlyValue label="Fecha y hora límite" value={`${card.date} · 18:00`} />
                  <p className="mt-1 px-1 text-xs font-medium text-muted-foreground">{card.ageLabel}</p>
                </div>
                <div className="sm:col-span-2">
                  <DemoReadonlyValue label="Descripción" value={card.description} />
                </div>
              </div>
            </SectionCardBody>
          </SectionCard>

          <SectionCard>
            <div className="flex items-start gap-2.5 border-b border-border/50 px-3 py-3 sm:gap-3 sm:px-4 sm:py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20 sm:h-10 sm:w-10">
                <FileCheck className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                  Paso 2
                </p>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground sm:text-[15px]">
                  Evidencia y validación
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Criterio de cierre y avance del checklist.
                </p>
              </div>
            </div>
            <SectionCardBody className="space-y-3 p-3 sm:p-4">
              <DemoReadonlyValue label="Evidencia esperada" value={card.validation} />
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Checklist
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {card.checklist.completed}/{card.checklist.total} completados
                  </p>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {Math.round((card.checklist.completed / Math.max(card.checklist.total, 1)) * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.round(
                        (card.checklist.completed / Math.max(card.checklist.total, 1)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </SectionCardBody>
          </SectionCard>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border/70 bg-card/95 px-3 py-3 backdrop-blur-sm sm:px-5 sm:py-4 md:px-6">
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-lg px-4" onClick={onClose}>
              Cerrar
            </Button>
            <Button type="button" className="h-10 rounded-lg px-4" disabled title="Solo demo">
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DropColumn({
  column,
  cards,
  onOpen,
  highlighted = false,
  dimmed = false,
}: {
  column: (typeof columns)[number]
  cards: DemoCard[]
  onOpen: (id: string) => void
  highlighted?: boolean
  dimmed?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, data: { column: column.id } })
  const Icon = column.Icon
  return (
    <div
      className={cn(
        'flex w-[min(240px,calc(100vw-2.5rem))] shrink-0 snap-start flex-col rounded-2xl border border-border/50 border-l-4 transition-all duration-300 sm:w-[240px]',
        column.border,
        column.bg,
        isOver && 'ring-2 ring-primary/25 ring-offset-2 ring-offset-background',
        highlighted && 'z-10 scale-[1.02] shadow-lg ring-2 ring-primary/40',
        dimmed && 'opacity-45 saturate-50'
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className={cn('h-4 w-4 shrink-0', column.iconClass)} />
          <h3 className="truncate text-sm font-semibold text-foreground">{column.title}</h3>
          <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {cards.length}
          </span>
        </div>
      </div>
      <div ref={setNodeRef} className="min-h-[220px] flex-1 space-y-2 px-2.5 pb-3">
        {cards.length === 0 ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 px-3 py-6 text-center">
            <Icon className={cn('mb-2 h-6 w-6 opacity-60', column.iconClass)} />
            <p className="text-xs font-medium text-muted-foreground">Suelta aquí</p>
          </div>
        ) : (
          cards.map((card) => <DraggableCard key={card.id} card={card} onOpen={onOpen} />)
        )}
      </div>
    </div>
  )
}

function resolveDropColumn(overId: string, cards: DemoCard[]): ColumnId | null {
  if (columns.some((column) => column.id === overId)) {
    return overId as ColumnId
  }
  const overCard = cards.find((card) => card.id === overId)
  return overCard?.column ?? null
}

function CollapsedCreateActionPanel({
  created,
  onCreate,
}: {
  created: boolean
  onCreate: (input: {
    title: string
    description: string
    ownerName: string
    priority: DemoCard['priority']
    dateLabel: string
    validation: string
  }) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <LandingCard className="mt-4 overflow-hidden border-emerald-500/15 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/25 sm:px-5"
        aria-expanded={open}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <Plus className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Nueva acción</span>
            <ModuleMetaBadge code="FRM·002" className="hidden sm:inline-flex" />
            {created ? (
              <Badge variant="outline" className="h-5 border-emerald-500/30 text-[10px] text-emerald-700">
                Demo creada
              </Badge>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Mismo flujo del tablero: información principal y evidencia de cierre
          </span>
        </span>
        <ChevronDown
          className={cn('h-5 w-5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="border-t border-border/50 bg-card">
          <DemoCreateAccionForm created={created} onCreate={onCreate} />
        </div>
      ) : null}
    </LandingCard>
  )
}

const SCROLL_STORY: Array<{
  column: ColumnId
  eyebrow: string
  title: string
  copy: string
}> = [
  {
    column: 'asignado',
    eyebrow: 'Entrada',
    title: 'Una solicitud entra con responsable y fecha',
    copy: 'Responsable, prioridad y evidencia desde el primer minuto — no en el chat del viernes.',
  },
  {
    column: 'seguimiento',
    eyebrow: 'Seguimiento',
    title: 'El avance vive en un solo tablero',
    copy: 'Cada movimiento de columna deja trazabilidad. Nadie persigue por WhatsApp.',
  },
  {
    column: 'retraso',
    eyebrow: 'Riesgo visible',
    title: 'El retraso se ve antes de la junta',
    copy: 'Las acciones vencidas saltan a Retraso. Dirección interviene con datos, no con sorpresas.',
  },
  {
    column: 'verificado',
    eyebrow: 'Cierre',
    title: 'Compromiso cerrado con evidencia',
    copy: 'Hecho con validación y verificado — el ciclo completo en el mismo lugar.',
  },
]

function KanbanDemoPanel({
  visibleCards,
  highOnly,
  onToggleHighOnly,
  highlightColumn,
  onOpen,
  sensors,
  draggingCard,
  onDragStart,
  onDragEnd,
}: {
  visibleCards: DemoCard[]
  highOnly: boolean
  onToggleHighOnly: () => void
  highlightColumn?: ColumnId
  onOpen: (id: string) => void
  sensors: ReturnType<typeof useSensors>
  draggingCard: DemoCard | null
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: (event: DragEndEvent) => void
}) {
  return (
    <LandingCard className="overflow-hidden shadow-lg ring-1 ring-border/40">
      <div className="flex flex-col gap-3 border-b border-border/50 bg-gradient-to-r from-muted/30 via-background to-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <ModuleMetaBadge code="KBN·001" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Kanban operativo</p>
            <p className="text-xs text-muted-foreground">
              {visibleCards.length} acciones · arrastra entre estados
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1 sm:flex-none sm:w-44">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              readOnly
              placeholder="Buscar..."
              className="h-9 rounded-lg border-border/60 bg-background pl-8 text-sm"
              aria-label="Buscar (solo demo)"
            />
          </div>
          <Button
            type="button"
            variant={highOnly ? 'secondary' : 'outline'}
            size="sm"
            onClick={onToggleHighOnly}
            className={cn(
              'h-9 gap-1.5 rounded-lg text-xs font-semibold',
              highOnly && 'border-primary/25 bg-primary/10 text-primary'
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            {highOnly ? 'Alta' : 'Filtros'}
          </Button>
          <span className="hidden text-[10px] font-medium text-muted-foreground lg:inline">
            Solo demo
          </span>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto scroll-smooth bg-gradient-to-b from-muted/10 to-background p-4 sm:p-5">
          {columns.map((column) => (
            <DropColumn
              key={column.id}
              column={column}
              cards={visibleCards.filter((card) => card.column === column.id)}
              onOpen={onOpen}
              highlighted={highlightColumn === column.id}
              dimmed={highlightColumn != null && highlightColumn !== column.id}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {draggingCard ? <KanbanCardFace card={draggingCard} /> : null}
        </DragOverlay>
      </DndContext>
    </LandingCard>
  )
}

export function ProductInAction() {
  const [created, setCreated] = useState(false)
  const [cards, setCards] = useState<DemoCard[]>(initialCards)
  const [highOnly, setHighOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const visibleCards = highOnly ? cards.filter((card) => card.priority === 'Alta') : cards
  const selected = cards.find((card) => card.id === selectedId) ?? null
  const draggingCard = cards.find((card) => card.id === draggingId) ?? null

  const handleCreate = (input: {
    title: string
    description: string
    ownerName: string
    priority: DemoCard['priority']
    dateLabel: string
    validation: string
  }) => {
    const initials = input.ownerName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    const seq = 1100 + cards.length
    setCards((current) => [
      {
        id: `demo-${Date.now()}`,
        publicId: `AC-${seq}`,
        title: input.title,
        description: input.description,
        owner: initials,
        ownerName: input.ownerName,
        date: input.dateLabel,
        priority: input.priority,
        column: 'asignado',
        validation: input.validation,
        checklist: { total: 2, completed: 0 },
        ageLabel: 'Abierta hoy',
      },
      ...current,
    ])
    setCreated(true)
  }

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(null)
    const { active, over } = event
    if (!over) return

    const targetColumn = resolveDropColumn(String(over.id), cards)
    if (!targetColumn) return

    setCards((current) =>
      current.map((card) =>
        card.id === String(active.id) ? { ...card, column: targetColumn } : card
      )
    )
  }

  return (
    <LandingSection
      id="como-funciona"
      surface="depth"
      spacing="standard"
      withGrid
      seoDescription={LANDING_SEO.sections.producto.description}
    >
      <LandingShell>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow tokenColor="blue">Producto en acción</Eyebrow>
          <SectionTitle>
            Cada solicitud se convierte en un compromiso gestionable.
          </SectionTitle>
          <SectionLead className="mx-auto">
            Un mismo hábito operativo para comunicar, asignar, actualizar, desbloquear y verificar.
          </SectionLead>
        </div>

        <div id="producto" className="mt-9 lg:mt-11">
          <div className="mx-auto grid max-w-6xl gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SCROLL_STORY.map((step, index) => (
              <div key={step.column} className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                    0{index + 1}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">{step.eyebrow}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold leading-snug text-foreground">{step.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.copy}</p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-5 max-w-7xl">
            <KanbanDemoPanel
              visibleCards={visibleCards}
              highOnly={highOnly}
              onToggleHighOnly={() => setHighOnly((value) => !value)}
              highlightColumn={undefined}
              onOpen={setSelectedId}
              sensors={sensors}
              draggingCard={draggingCard}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
            <div className="mx-auto max-w-3xl">
              <CollapsedCreateActionPanel created={created} onCreate={handleCreate} />
            </div>
          </div>
        </div>
      </LandingShell>

      {selected ? <DemoAccionDetailModal card={selected} onClose={() => setSelectedId(null)} /> : null}
    </LandingSection>
  )
}

export function DashboardDemo() {
  const [activeModule, setActiveModule] = useState<'atencion' | 'ico' | 'tiempos' | 'okr'>('atencion')

  const attention = {
    total: 18,
    segments: [
      { label: 'Rojos', value: 5, pct: 28, dot: 'bg-red-500', text: 'text-red-700 dark:text-red-300', surface: 'border-red-500/20 bg-red-500/[0.06]', bar: 'bg-red-500' },
      { label: 'Amarillos', value: 7, pct: 39, dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300', surface: 'border-amber-500/20 bg-amber-500/[0.06]', bar: 'bg-amber-500' },
      { label: 'Verdes', value: 6, pct: 33, dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', surface: 'border-emerald-500/20 bg-emerald-500/[0.06]', bar: 'bg-emerald-500' },
    ],
  }
  const attentionPie = `conic-gradient(#ef4444 0% ${attention.segments[0].pct}%, #f59e0b ${attention.segments[0].pct}% ${attention.segments[0].pct + attention.segments[1].pct}%, #10b981 ${attention.segments[0].pct + attention.segments[1].pct}% 100%)`

  const icoTarget = 89
  const { ref: icoGaugeRef, value: icoValue } = useCountUp(icoTarget)
  const icoRing = `conic-gradient(#10b981 0% ${icoValue}%, hsl(var(--muted)) ${icoValue}% 100%)`

  const avgAgeDays = 5.4
  const avgAgeMarker = Math.min(100, (avgAgeDays / 10) * 100)
  const timeMetrics = [
    {
      title: 'Tiempo prom. rojos',
      value: 4.2,
      description: 'Días hasta el cierre en acciones rojas.',
      tone: 'yellow' as const,
      trend: '-0.8 días vs periodo anterior',
      trendGood: true,
    },
    {
      title: 'Tiempo prom. demás',
      value: 6.8,
      description: 'Días hasta el cierre en amarillas y verdes.',
      tone: 'green' as const,
      trend: '-1.1 días vs periodo anterior',
      trendGood: true,
    },
  ]
  const agingBuckets = [
    { range: '0–2 días', count: 9, pct: 30, bar: 'bg-emerald-500', surface: 'border-emerald-500/25 bg-emerald-500/[0.06]' },
    { range: '3–5 días', count: 11, pct: 37, bar: 'bg-lime-500', surface: 'border-lime-500/25 bg-lime-500/[0.06]' },
    { range: '6–10 días', count: 6, pct: 20, bar: 'bg-amber-500', surface: 'border-amber-500/25 bg-amber-500/[0.06]' },
    { range: '+10 días', count: 4, pct: 13, bar: 'bg-red-500', surface: 'border-red-500/25 bg-red-500/[0.06]' },
  ]

  const okrKrs = [
    { id: 'KR1', title: 'Cerrar rojos más rápido', value: '27 → 18 días', progress: 72, tone: 'yellow' as const },
    { id: 'KR2', title: 'Reducir rojos abiertos >15d', value: '4 abiertas', progress: 61, tone: 'yellow' as const },
    { id: 'KR3', title: 'Subir ICO del periodo', value: '89% / Meta 92%', progress: 84, tone: 'green' as const },
    { id: 'KR4', title: 'Cumplir compromisos a tiempo', value: '31 / 35', progress: 88, tone: 'green' as const },
  ]

  const toneBar = {
    green: 'bg-emerald-500',
    yellow: 'bg-amber-500',
    red: 'bg-red-500',
  }
  const toneSurface = {
    green: 'border-emerald-500/25 bg-emerald-500/[0.06]',
    yellow: 'border-amber-500/25 bg-amber-500/[0.06]',
    red: 'border-red-500/25 bg-red-500/[0.06]',
  }
  const metricToneSurface = {
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100',
    yellow: 'border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-100',
    red: 'border-red-500/35 bg-red-500/10 text-red-950 dark:text-red-100',
  }

  return (
    <LandingSection
      id="indicadores"
      surface="inverse"
      spacing="standard"
      seoDescription={LANDING_SEO.sections.indicadores.description}
    >
      <LandingShell>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow dark tokenColor="green">
            Valor para Dirección
          </Eyebrow>
          <SectionTitle dark>
            Ve los riesgos. Decide dónde actuar.
          </SectionTitle>
          <SectionLead dark className="mx-auto">
            Compromisos, cumplimiento y tiempos convertidos en señales para decidir.
          </SectionLead>
        </div>

        <div className="mx-auto mt-7 flex max-w-4xl flex-wrap justify-center gap-2">
          {[
            ['Ver', 'Qué compromisos requieren atención ahora.'],
            ['Decidir', 'Dónde destrabar, priorizar o escalar.'],
            ['Mejorar', 'Dónde se deterioran cumplimiento y tiempos.'],
          ].map(([title, copy], index) => (
            <div
              key={title}
              className="flex items-center gap-2 rounded-full border border-background/15 bg-background/[0.06] px-3.5 py-2 backdrop-blur-sm"
            >
                <span className="grid h-5 w-5 place-items-center rounded-md bg-emerald-400/15 text-[9px] font-bold text-emerald-300">
                  0{index + 1}
                </span>
                <h3 className="text-xs font-semibold text-background">{title}</h3>
                <span className="hidden text-[11px] text-background/55 md:inline">· {copy}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 border-y border-background/10 py-4">
          <p className="text-sm font-semibold text-background">Del dato a la decisión, en el mismo tablero.</p>
          <p className="hidden text-xs text-background/50 sm:block">Riesgo · Cumplimiento · Tiempos · Carga</p>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {[
            ['atencion', 'Atención hoy'],
            ['ico', 'Cumplimiento'],
            ['tiempos', 'Tiempos'],
            ['okr', 'Mejora'],
          ].map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={activeModule === id ? 'default' : 'outline'}
              className={cn(
                'h-8 rounded-full px-4 text-xs',
                activeModule !== id && 'border-white/20 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-950'
              )}
              onClick={() => setActiveModule(id as typeof activeModule)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="mx-auto mt-4 grid max-w-4xl gap-4 [--background:0_0%_100%] [--border:220_13%_91%] [--card:0_0%_100%] [--foreground:222_47%_11%] [--muted:220_14%_96%] [--muted-foreground:220_9%_46%]">
          {/* 1. Atención inmediata */}
          <SectionCard
            className={cn(
              'transition',
              activeModule !== 'atencion' && 'hidden',
              activeModule === 'atencion' && 'border-primary/30 ring-1 ring-primary/15'
            )}
          >
            <SectionCardHeader
              eyebrow="Salud operativa"
              title="Atención inmediata"
              subtitle="Hoy y vencidas por prioridad."
              icon={AlertTriangle}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant={activeModule === 'atencion' ? 'default' : 'outline'}
                  className="hidden"
                  onClick={() => setActiveModule('atencion')}
                >
                  Ver módulo
                </Button>
              }
            />
            <SectionCardBody className="p-4 sm:p-5">
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/35 shadow-sm">
                <div className="grid items-center gap-5 p-4 sm:grid-cols-[minmax(9rem,0.85fr)_minmax(0,1.15fr)] sm:p-5">
                  <div className="relative mx-auto w-full max-w-40">
                    <div
                      className="relative aspect-square w-full rounded-full p-2"
                      style={{ background: attentionPie }}
                    >
                      <span className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full border-4 border-background bg-background shadow-sm">
                        <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-950">
                          <CountUpInteger target={attention.total} />
                        </span>
                        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          acciones
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {attention.segments.map((segment) => (
                      <div
                        key={segment.label}
                        className={cn('rounded-xl border px-3 py-2.5', segment.surface)}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={cn('h-3 w-3 rounded-full', segment.dot)} />
                          <span className={cn('min-w-0 flex-1 text-xs font-bold', segment.text)}>
                            {segment.label}
                          </span>
                          <span className={cn('text-base font-bold tabular-nums', segment.text)}>
                            {segment.value}
                          </span>
                          <span className="w-10 text-right text-[11px] font-semibold tabular-nums text-slate-600">
                            {segment.pct}%
                          </span>
                        </div>
                        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-background/80">
                          <span
                            className={cn('block h-full rounded-full', segment.bar)}
                            style={{ width: `${segment.pct}%` }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCardBody>
          </SectionCard>

          {/* 2. ICO / Confiabilidad */}
          <SectionCard
            className={cn(
              'transition',
              activeModule !== 'ico' && 'hidden',
              activeModule === 'ico' && 'border-primary/30 ring-1 ring-primary/15'
            )}
          >
            <SectionCardHeader
              eyebrow="Ejecución"
              title="Confiabilidad de compromisos"
              subtitle="ICO global del periodo."
              icon={ShieldCheck}
              action={
                <Badge variant="secondary" className="h-7 gap-1.5 px-2.5 tabular-nums">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  35 cierres
                </Badge>
              }
            />
            <SectionCardBody className="p-4 sm:p-5">
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-emerald-500/[0.04] shadow-sm">
                <div className="grid items-center gap-5 p-4 sm:grid-cols-[minmax(9rem,0.85fr)_minmax(0,1.15fr)] sm:p-5">
                  <div
                    ref={icoGaugeRef}
                    className="relative mx-auto aspect-square w-full max-w-36 rounded-full"
                    style={{ background: icoRing }}
                  >
                    <span className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full border-4 border-background bg-background shadow-sm">
                      <span className="text-3xl font-bold tabular-nums tracking-tight">
                        {icoValue}
                        <span className="text-base font-semibold text-muted-foreground">%</span>
                      </span>
                      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        ICO
                      </span>
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-xl border border-border/60 bg-background/70 px-3.5 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Acciones cerradas
                      </p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">35</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Base del cálculo en el periodo.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-background/70 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-200">
                      <TrendingUp className="h-3.5 w-3.5" />
                      +4 pp vs periodo anterior
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={activeModule === 'ico' ? 'default' : 'outline'}
                      className="hidden"
                      onClick={() => setActiveModule('ico')}
                    >
                      Ver módulo
                    </Button>
                  </div>
                </div>
              </div>
            </SectionCardBody>
          </SectionCard>

          {/* 3. Tiempos y antigüedad */}
          <SectionCard
            className={cn(
              'transition',
              activeModule !== 'tiempos' && 'hidden',
              activeModule === 'tiempos' && 'border-primary/30 ring-1 ring-primary/15'
            )}
          >
            <SectionCardHeader
              eyebrow="Carga operativa"
              title="Tiempos y antigüedad"
              subtitle="Velocidad de cierre y edad del backlog abierto."
              icon={Timer}
              action={
                <Badge variant="secondary" className="h-7 gap-1.5 px-2.5 tabular-nums">
                  <ListChecks className="h-3.5 w-3.5" />
                  30 abiertas
                </Badge>
              }
            />
            <SectionCardBody className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {timeMetrics.map((metric) => (
                  <div
                    key={metric.title}
                    className={cn('flex flex-col rounded-xl border p-4 shadow-sm', metricToneSurface[metric.tone])}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/70">
                        <Timer className="h-4 w-4" />
                      </span>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {metric.title}
                      </p>
                    </div>
                    <p className="mt-3 flex items-end gap-1.5">
                      <span className="text-3xl font-bold leading-none tracking-tight tabular-nums">
                        <CountUpDecimal target={metric.value} />
                      </span>
                      <span className="pb-0.5 text-sm font-medium text-muted-foreground">días</span>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {metric.description}
                    </p>
                    <p
                      className={cn(
                        'mt-3 inline-flex items-center gap-1.5 text-xs font-medium',
                        metric.trendGood
                          ? 'text-emerald-700 dark:text-emerald-200'
                          : 'text-red-700 dark:text-red-200'
                      )}
                    >
                      <TrendingDown className="h-3.5 w-3.5" />
                      {metric.trend}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Edad promedio
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Backlog abierto · días desde la creación.
                    </p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/70">
                    <Timer className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-bold leading-none tracking-tight tabular-nums">
                    <CountUpDecimal target={avgAgeDays} />
                  </span>
                  <span className="pb-1 text-sm font-medium text-muted-foreground">días</span>
                </p>
                <div className="mt-4">
                  <div className="relative h-3 rounded-full bg-background/75">
                    <span className="absolute inset-y-0 left-0 w-[30%] rounded-l-full bg-emerald-500/75" />
                    <span className="absolute inset-y-0 left-[30%] w-[40%] bg-amber-500/75" />
                    <span className="absolute inset-y-0 right-0 w-[30%] rounded-r-full bg-red-500/75" />
                    <span
                      className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow"
                      style={{ left: `${avgAgeMarker}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                    <span>0 días</span>
                    <span>10 días</span>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60 shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground">Antigüedad del backlog</p>
                  <Badge variant="outline" className="h-6 text-[10px] tabular-nums">
                    30 abiertas
                  </Badge>
                </div>
                <div className="grid gap-2 p-3 sm:grid-cols-2">
                  {agingBuckets.map((bucket) => (
                    <div
                      key={bucket.range}
                      className={cn('rounded-lg border px-2.5 py-2', bucket.surface)}
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold">{bucket.range}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {bucket.count} · {bucket.pct}%
                        </span>
                      </div>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-background/80">
                        <span
                          className={cn('block h-full rounded-full', bucket.bar)}
                          style={{ width: `${bucket.pct}%` }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                variant={activeModule === 'tiempos' ? 'default' : 'outline'}
                className="hidden"
                onClick={() => setActiveModule('tiempos')}
              >
                Ver módulo
              </Button>
            </SectionCardBody>
          </SectionCard>

          {/* 4. OKR operativo */}
          <SectionCard
            className={cn(
              'transition',
              activeModule !== 'okr' && 'hidden',
              activeModule === 'okr' && 'border-primary/30 ring-1 ring-primary/15'
            )}
          >
            <SectionCardHeader
              eyebrow="OKR Operativo"
              title="Avance del OKR activo"
              subtitle="Key results con ritmo y riesgo visibles."
              icon={Target}
              action={
                <Badge
                  variant="outline"
                  className="h-7 gap-1.5 border-amber-500/35 bg-amber-500/10 px-2.5 text-amber-700 dark:text-amber-200"
                >
                  <CircleDot className="h-3.5 w-3.5" />
                  En curso
                </Badge>
              }
            />
            <SectionCardBody className="space-y-3 p-4 sm:p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {okrKrs.map((kr) => (
                  <div
                    key={kr.id}
                    className={cn('rounded-xl border p-3', toneSurface[kr.tone])}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {kr.id}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold leading-snug text-foreground">
                          {kr.title}
                        </p>
                      </div>
                      <span className="text-xs font-bold tabular-nums text-foreground">
                        {kr.progress}%
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] font-medium tabular-nums text-foreground">
                      {kr.value}
                    </p>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-background/80">
                      <span
                        className={cn('block h-full rounded-full', toneBar[kr.tone])}
                        style={{ width: `${kr.progress}%` }}
                      />
                    </span>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                variant={activeModule === 'okr' ? 'default' : 'outline'}
                className="hidden"
                onClick={() => setActiveModule('okr')}
              >
                Ver módulo
              </Button>
            </SectionCardBody>
          </SectionCard>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

const aiAnswers: Record<string, string> = {
  'Como puedo desbloquear esta accion y a quien debo involucrar?':
    'Identifique una dependencia con Finanzas. Confirma al responsable, acuerda una hora limite hoy a las 14:00 y adjunta su validacion como evidencia.',
  'Que evidencia seria suficiente para cerrar esta accion con calidad?':
    'Para verificar el cierre, adjunta la validacion de Finanzas y la confirmacion de fecha enviada al cliente.',
  'Dame un plan corto para cerrar esta accion hoy.':
    '1. Confirma responsable en Finanzas.\n2. Acuerda limite a las 14:00.\n3. Adjunta evidencia.\n4. Mueve a Hecho y solicita verificacion.',
}

type ChatMessage = { role: 'assistant' | 'user'; content: string }

const demoActionPrompts = Object.keys(aiAnswers)

const demoRedActions = [
  {
    id: '1',
    initials: 'AM',
    title: 'Confirmar condiciones de entrega',
    preview: 'Dependencia con Finanzas · Bloqueado',
    tone: 'red' as const,
    badge: 'Rojo',
    meta: 'Hoy · 14:00',
  },
  {
    id: '2',
    initials: 'JR',
    title: 'Validar propuesta comercial',
    preview: 'Falta evidencia de cierre',
    tone: 'amber' as const,
    badge: 'Retraso',
    meta: 'Ayer',
  },
  {
    id: '3',
    initials: 'LC',
    title: 'Resolver bloqueo logístico',
    preview: 'Esperando respuesta de proveedor',
    tone: 'red' as const,
    badge: 'Bloqueado',
    meta: '2d',
  },
] as const

const aiSuggestionText =
  'Perfecto: confirma con Finanzas antes de las 14:00, adjunta su validacion como evidencia y mueve la accion a Hecho cuando quede documentado.'

export function AIDemo() {
  const [selectedId, setSelectedId] = useState<string>(demoRedActions[0].id)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'user',
      content: '¿Ya validaron la propuesta con Finanzas?',
    },
    {
      role: 'assistant',
      content:
        'Aun no. Identifique dependencia con Finanzas: confirma responsable, acuerda hora limite hoy 14:00 y adjunta validacion.',
    },
  ])
  const [input, setInput] = useState('')
  const [showSuggestion, setShowSuggestion] = useState(true)

  const selected = demoRedActions.find((a) => a.id === selectedId) ?? demoRedActions[0]

  const ask = (prompt: string) => {
    const answer =
      aiAnswers[prompt] ??
      'Con el contexto de la accion: confirma dependencia, evidencia y fecha limite antes de cerrar.'
    setMessages((current) => [
      ...current,
      { role: 'user', content: prompt },
      { role: 'assistant', content: answer },
    ])
    setShowSuggestion(true)
    setInput('')
  }

  return (
    <LandingSection
      id="ia"
      surface="depth"
      spacing="standard"
      withGrid
      seoDescription={LANDING_SEO.sections.ia.description}
    >
      <LandingShell>
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tokenColor="yellow">Asistente IA</Eyebrow>
          <SectionTitle>Cuando hay un bloqueo, también ayuda a decidir qué hacer.</SectionTitle>
          <SectionLead className="mx-auto">
            El mismo flujo del tablero: acción roja, contexto activo y validación de cierre.
          </SectionLead>
        </div>

        <LandingCard className="mt-10 overflow-hidden shadow-lg ring-1 ring-border/40">
          <div className="grid min-h-[420px] lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
            {/* Lista de acciones rojas */}
            <aside className="border-b border-border/50 bg-muted/15 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Acciones rojas</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                      {demoRedActions.length} abiertas
                    </span>
                  </p>
                </div>
                <Badge variant="outline" className="h-6 text-[10px] tabular-nums">
                  Demo
                </Badge>
              </div>
              <ul className="divide-y divide-border/40 p-2">
                {demoRedActions.map((action) => {
                  const active = action.id === selectedId
                  return (
                    <li key={action.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(action.id)}
                        className={cn(
                          'flex w-full gap-3 rounded-xl px-3 py-3 text-left transition',
                          active
                            ? 'border-l-[3px] border-l-emerald-600 bg-emerald-500/[0.08] pl-[calc(0.75rem-3px)]'
                            : 'border-l-[3px] border-l-transparent hover:bg-muted/40'
                        )}
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
                          {action.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {action.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              {action.meta}
                            </span>
                          </span>
                          <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                            {action.preview}
                          </span>
                          <span className="mt-2 inline-flex">
                            <StatusPill tone={action.tone}>{action.badge}</StatusPill>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </aside>

            {/* Chat + sugerencia IA */}
            <div className="flex min-w-0 flex-col bg-card">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{selected.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    contexto operativo · {selected.badge.toLowerCase()} · checklist 1/3
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    IA activa
                  </Button>
                  <Button type="button" size="sm" className="h-8 rounded-lg text-xs">
                    Asignar
                  </Button>
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn(
                      'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      message.role === 'user'
                        ? 'mr-auto rounded-bl-md bg-muted text-foreground'
                        : 'ml-auto rounded-br-md bg-emerald-600 text-white shadow-sm'
                    )}
                  >
                    {message.content}
                  </div>
                ))}
              </div>

              {showSuggestion ? (
                <div className="mx-4 mb-3 rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/[0.06] p-4 sm:mx-5">
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    Sugerencia IA · listo para enviar
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{aiSuggestionText}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="h-8 rounded-lg bg-foreground text-background hover:bg-foreground/90">
                      Enviar
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg">
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-lg text-xs text-muted-foreground"
                      onClick={() => setShowSuggestion(false)}
                    >
                      Otra opción
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="border-t border-border/50 bg-muted/10 px-4 py-3 sm:px-5">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {demoActionPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => ask(prompt)}
                      className="rounded-full border border-red-500/25 bg-background px-2.5 py-1 text-[10px] font-medium text-red-800 transition hover:bg-red-500/10 dark:text-red-200"
                    >
                      {prompt.length > 42 ? `${prompt.slice(0, 40)}…` : prompt}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Pregunta sobre esta acción…"
                    className="h-10 rounded-xl border-border/60 bg-background text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && input.trim()) ask(input.trim())
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-xl"
                    disabled={!input.trim()}
                    onClick={() => input.trim() && ask(input.trim())}
                    aria-label="Enviar"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">Solo demo · No llama al asistente real</p>
              </div>
            </div>
          </div>
        </LandingCard>
      </LandingShell>
    </LandingSection>
  )
}
```

### `src/pages/product/ProductHero.tsx`

```tsx
import { Bell, CheckCircle2, Menu, Timer, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { SECTION_SPACING } from '@/lib/spacing'
import {
  CtaTrustRow,
  DemoWindow,
  Eyebrow,
  LandingShell,
  Logo,
  PrimaryCTA,
  SecondaryCTA,
  SectionLead,
} from './ProductUI'
import { LandingGridPattern, LandingOrbitRings } from './ProductVisual'
import { StatusToken, StatusTokenMark } from './StatusToken'
import { LANDING_SEO } from './landingSeo'
import { LandingSectionSeo } from './LandingSeoHead'

const nav = [
  ['Producto', '#producto'],
  ['Cómo funciona', '#como-funciona'],
  ['Indicadores', '#indicadores'],
  ['IA', '#ia'],
] as const

export function ProductNav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <LandingShell className="flex h-14 items-center justify-between sm:h-16">
        <div className="flex items-center gap-3">
          <Logo />
          <StatusTokenMark className="hidden opacity-50 sm:inline-flex" />
        </div>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Navegación principal">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="hidden md:block">
          <PrimaryCTA className="h-10 min-h-10" glow />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl border-border/70 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Abrir menú"
          aria-expanded={open}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </LandingShell>
      {open ? (
        <nav className="border-t border-border/50 bg-card p-4 md:hidden">
          {nav.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block border-b border-border/40 py-3 text-sm font-semibold text-foreground"
            >
              {label}
            </a>
          ))}
          <div className="mt-4">
            <PrimaryCTA className="w-full" />
          </div>
        </nav>
      ) : null}
    </header>
  )
}

function HeroProduct() {
  const columns = [
    {
      name: 'HOY',
      dot: 'bg-primary',
      cards: [
        ['Validar propuesta comercial', 'AM', 'Alta'],
        ['Confirmar alcance con cliente', 'JR', 'Media'],
      ],
    },
    {
      name: 'EN SEGUIMIENTO',
      dot: 'bg-violet-500',
      cards: [
        ['Resolver bloqueo de entrega', 'LC', 'Crítica'],
        ['Actualizar indicadores', 'MP', 'Media'],
      ],
    },
    {
      name: 'POR VERIFICAR',
      dot: 'bg-emerald-500',
      cards: [['Evidencia de cierre Q3', 'AR', 'Alta']],
    },
  ]

  return (
    <div className="relative mx-auto w-full max-w-3xl lg:translate-x-4">
      <LandingOrbitRings className="-z-10 opacity-60" />
      <DemoWindow className="relative z-10 shadow-xl shadow-primary/5 ring-1 ring-border/50" title="Tablero operativo">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-primary">
              Operación comercial
            </p>
            <p className="text-sm font-semibold text-foreground">Compromisos del equipo</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <i className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
            </span>
            <Button type="button" size="sm" className="h-7 rounded-lg px-2.5 text-[10px] font-semibold">
              + Acción
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-muted/25 p-3 sm:gap-3 sm:p-4">
          {columns.map((col) => (
            <div key={col.name}>
              <div className="mb-2 flex items-center gap-1.5">
                <i className={cn('h-1.5 w-1.5 rounded-full', col.dot)} />
                <span className="text-[7px] font-semibold tracking-wider text-muted-foreground sm:text-[9px]">
                  {col.name}
                </span>
              </div>
              <div className="space-y-2">
                {col.cards.map(([title, owner, priority], i) => (
                  <div
                    key={title}
                    className={cn(
                      'rounded-xl border bg-card p-2 shadow-sm sm:p-3',
                      priority === 'Crítica'
                        ? 'border-l-2 border-border/60 border-l-destructive'
                        : 'border-border/60'
                    )}
                  >
                    <p className="line-clamp-2 text-[8px] font-semibold leading-snug text-foreground sm:text-[11px]">
                      {title}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-foreground text-[7px] font-bold text-background">
                        {owner}
                      </span>
                      <span className="text-[7px] text-muted-foreground">{i + 12} Sep</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DemoWindow>

      {/* Mini métricas flotantes — 2 KPIs del dashboard */}
      <div className="absolute -bottom-10 -left-2 z-20 hidden w-[13.5rem] space-y-2 sm:block">
        <div className="rounded-xl border border-border/60 bg-card p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[9px] text-muted-foreground">Confiabilidad (ICO)</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">89%</p>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[89%] rounded-full bg-emerald-500" />
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/12 text-amber-700 dark:text-amber-300">
              <Timer className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[9px] text-muted-foreground">Tiempo prom. rojos</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                4.2 <span className="text-xs font-medium text-muted-foreground">días</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-5 right-6 z-20 hidden items-center gap-2 rounded-full border border-border/60 bg-foreground px-3 py-2 text-background shadow-lg sm:flex">
        <UserRound className="h-3.5 w-3.5" />
        <span className="text-[9px] font-semibold">Ana actualizó una acción</span>
        <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      </div>
    </div>
  )
}

export function ProductHero() {
  return (
    <>
      <ProductNav />
      <section
        id="inicio"
        className={cn(
          'relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/30',
          SECTION_SPACING.hero
        )}
      >
        <LandingSectionSeo description={LANDING_SEO.sections.inicio.description} />
        <LandingGridPattern className="opacity-50" />
        <div
          className="pointer-events-none absolute right-6 top-24 hidden opacity-[0.12] lg:block"
          aria-hidden
        >
          <div className="flex flex-col gap-3">
            <StatusToken color="red" size="md" pulse={false} />
            <StatusToken color="yellow" size="md" pulse={false} />
            <StatusToken color="green" size="md" pulse={false} />
          </div>
        </div>
        <LandingShell>
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-card via-card to-emerald-500/[0.04] p-5 shadow-lg sm:p-7">
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-primary/10 blur-3xl"
                aria-hidden
              />
              <div className="relative">
                <Eyebrow tokenColor="blue">Sistema de gestión operativa</Eyebrow>
                <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                  Construye una cultura de ejecución{' '}
                  <span className="bg-gradient-to-r from-emerald-600 to-primary bg-clip-text text-transparent">
                    visible, medible y responsable.
                  </span>
                </h1>
                <SectionLead>
                  SCRUMBAN ayuda a equipos operativos a mejorar su comunicación, dar seguimiento
                  con trazabilidad, medir KPIs y convertir pendientes dispersos en compromisos claros.
                </SectionLead>
                <div className="mt-7">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <PrimaryCTA glow />
                    <SecondaryCTA href="#como-funciona">Ver cómo funciona</SecondaryCTA>
                  </div>
                  <CtaTrustRow />
                </div>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {['Responsables claros', 'Seguimiento trazable', 'KPIs visibles', 'Menos chats dispersos', 'Decisiones con datos'].map((chip) => (
                    <Badge
                      key={chip}
                      variant="outline"
                      className="rounded-full border-border/60 bg-background/80 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {chip}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <HeroProduct />
          </div>
        </LandingShell>
      </section>
    </>
  )
}
```

### `src/pages/product/ProductLandingPage.tsx`

```tsx
import { AIDemo, DashboardDemo, ProductInAction } from './ProductDemos'
import { DemoRequestProvider } from './DemoRequestContext'
import { LandingSeoHead } from './LandingSeoHead'
import { CloseSection, CultureShiftSection, MidPageCTA, MoreCapabilitiesSection, ProblemSection } from './ProductSections'
import { ProductHero } from './ProductHero'
import { LandingShell, Logo } from './ProductUI'

export function ProductLandingPage() {
  return (
    <DemoRequestProvider>
      <LandingSeoHead />
      <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/20">
        <ProductHero />
        <main className="overflow-x-hidden">
          <ProblemSection />
          <CultureShiftSection />
          <ProductInAction />
          <DashboardDemo />
          <MidPageCTA />
          <AIDemo />
          <MoreCapabilitiesSection />
          <CloseSection />
        </main>
        <footer className="border-t border-border/60 bg-foreground py-8 text-background">
          <LandingShell className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <Logo light />
            <p className="text-xs text-background/60">
              Gestión operativa visible, medible y verificable.
            </p>
            <a
              href="/login"
              className="text-xs font-semibold text-background/70 transition-colors hover:text-background"
            >
              Iniciar sesión
            </a>
          </LandingShell>
        </footer>
      </div>
    </DemoRequestProvider>
  )
}
```

### `src/pages/product/ProductSections.tsx`

```tsx
import {
  BarChart3,
  CheckCircle2,
  Columns3,
  Mail,
  MessageCircle,
  Target,
  Users,
} from 'lucide-react'
import { AccionPriorityBadge } from '@/features/operations/components/AccionPriorityBadge'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/utils'
import {
  CtaTrustRow,
  DemoAdvisorCTA,
  Eyebrow,
  LandingCard,
  LandingSection,
  LandingShell,
  PrimaryCTA,
  SectionLead,
  SectionTitle,
} from './ProductUI'
import { CountUpInteger } from './CountUpValue'
import { PremiumCtaPanel } from './ProductVisual'
import { StatusToken } from './StatusToken'
import { LANDING_SEO } from './landingSeo'
import { LandingSectionSeo } from './LandingSeoHead'

function ChaosToOrderVisual() {
  const { ref, inView } = useInView(0.35)

  const chaosMessages = [
    {
      channel: 'WhatsApp',
      Icon: MessageCircle,
      tint: 'border-emerald-500/30 bg-emerald-500/[0.07]',
      rotate: '-rotate-2',
      offset: 'translate-x-1 -translate-y-1',
      text: '¿Ya validaron la propuesta con Finanzas?',
      meta: 'Hoy · 09:14',
    },
    {
      channel: 'Correo',
      Icon: Mail,
      tint: 'border-sky-500/30 bg-sky-500/[0.07]',
      rotate: 'rotate-1',
      offset: 'translate-x-3 translate-y-2',
      text: 'Fwd: pendiente de evidencia de cierre Q3…',
      meta: 'Ayer · 18:42',
    },
    {
      channel: 'Slack',
      Icon: MessageCircle,
      tint: 'border-violet-500/30 bg-violet-500/[0.07]',
      rotate: 'rotate-2',
      offset: '-translate-x-1 translate-y-4',
      text: '@ana ¿quién tiene el bloqueo de entrega?',
      meta: 'Hoy · 10:02',
    },
  ] as const

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md lg:mx-0">
      <div
        className={cn(
          'relative min-h-[280px] transition-all duration-700 ease-out',
          inView ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'
        )}
        aria-hidden={inView}
      >
        {chaosMessages.map((msg, index) => (
          <div
            key={msg.channel}
            className={cn(
              'absolute left-0 right-0 rounded-xl border p-3 shadow-sm backdrop-blur-sm transition-all duration-500',
              msg.tint,
              msg.rotate,
              msg.offset,
              !inView && 'opacity-100'
            )}
            style={{ top: `${index * 4.25}rem`, zIndex: index + 1 }}
          >
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <msg.Icon className="h-3.5 w-3.5" />
              {msg.channel}
              <span className="ml-auto font-medium normal-case tracking-normal">{msg.meta}</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-snug text-foreground">{msg.text}</p>
          </div>
        ))}
      </div>

      <div
        className={cn(
          'absolute inset-0 flex items-center transition-all duration-700 ease-out',
          inView ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        )}
      >
        <LandingCard className="w-full border-primary/25 p-0 shadow-md ring-1 ring-primary/10">
          <div className="flex items-center justify-between border-b border-border/50 bg-muted/20 px-4 py-2.5">
            <StatusToken color="green" label="Acción visible" />
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">AC-1042</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <AccionPriorityBadge prioridad="Alta" compact className="mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug text-foreground">
                  Validar propuesta con Finanzas
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ana Martínez · Hoy 18:00 · Evidencia requerida
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
                <p className="font-semibold text-foreground">Responsable</p>
                <p className="mt-0.5 text-muted-foreground">Asignado</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
                <p className="font-semibold text-foreground">Fecha</p>
                <p className="mt-0.5 text-muted-foreground">Compromiso</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
                <p className="font-semibold text-foreground">Estado</p>
                <p className="mt-0.5 text-muted-foreground">En seguimiento</p>
              </div>
            </div>
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              De chat disperso → compromiso trazable
            </p>
          </div>
        </LandingCard>
      </div>
    </div>
  )
}

export function ProblemSection() {
  const items = [
    ['Información dispersa', 'Cada área trabaja con una versión distinta de lo que ocurre.', 'Se pierde contexto'],
    ['Compromisos ambiguos', 'Responsables, fechas y siguientes pasos no quedan claros.', 'Se retrasa la ejecución'],
    ['Decisiones tardías', 'Bloqueos y KPIs llegan cuando el problema ya escaló.', 'Aumenta el costo de reaccionar'],
  ]

  return (
    <LandingSection
      id="problema"
      surface="muted"
      spacing="standard"
      withGrid
      seoDescription={LANDING_SEO.sections.problema.description}
    >
      <LandingShell>
        <div className="mx-auto max-w-3xl text-center">
            <Eyebrow tokenColor="red">El costo de operar a ciegas</Eyebrow>
            <SectionTitle>Cuando cada área trabaja de forma distinta, la operación pierde coordinación.</SectionTitle>
            <SectionLead className="mx-auto">
              Cuando el seguimiento vive en chats, juntas y memoria, el equipo invierte más tiempo
              buscando información que resolviendo problemas.
            </SectionLead>
        </div>

        <LandingCard className="mx-auto mt-9 max-w-6xl p-5 shadow-md ring-1 ring-border/30 sm:p-7">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-12">
            <div className="order-2 lg:order-1">
              <ChaosToOrderVisual />
            </div>
            <div className="order-1 lg:order-2">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Lo que parece falta de seguimiento termina afectando la ejecución
              </p>
              <ul className="grid gap-2.5 lg:grid-cols-1">
              {items.map(([title, copy, impact], index) => (
                <li key={title} className="flex gap-3 rounded-xl border border-border/50 bg-muted/20 p-3.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-[10px] font-bold tabular-nums text-red-600">
                    0{index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{copy}</p>
                    <p className="mt-1.5 text-[11px] font-semibold text-red-600">Impacto: {impact}</p>
                  </div>
                </li>
              ))}
              </ul>
              <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                  Lo que cambia con SCRUMBAN
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground sm:text-base">
                  Una sola forma de comunicar, asignar, actualizar, desbloquear y medir convierte
                  el seguimiento en una capacidad de toda la organización.
                </p>
              </div>
            </div>
          </div>
        </LandingCard>
      </LandingShell>
    </LandingSection>
  )
}

const cultureBefore = [
  'Chats y solicitudes dispersas',
  'Juntas sin acuerdos trazables',
  'Responsables ambiguos',
  'KPIs manuales o tardíos',
]

const cultureAfter = [
  'Solicitudes centralizadas',
  'Compromisos visibles',
  'Responsables y fechas claras',
  'KPIs conectados a la ejecución',
]

export function CultureShiftSection() {
  return (
    <LandingSection
      id="cultura"
      surface="base"
      spacing="tight"
      seoDescription={LANDING_SEO.sections.cultura.description}
    >
      <LandingShell className="max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tokenColor="green">Cambio cultural</Eyebrow>
          <SectionTitle>De seguimiento informal a ejecución medible.</SectionTitle>
          <SectionLead className="mx-auto">
            SCRUMBAN instala una forma compartida de comunicar, comprometer, actualizar y medir.
          </SectionLead>
        </div>
        <div className="mt-9 grid overflow-hidden rounded-2xl border border-border/60 shadow-md md:grid-cols-2">
          <div className="bg-muted/35 p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Antes</p>
            <div className="mt-5 space-y-3">
              {cultureBefore.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-foreground p-6 text-background sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Con SCRUMBAN</p>
            <div className="mt-5 space-y-3">
              {cultureAfter.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-base font-semibold text-foreground">
          Cuando todos ven lo mismo, el equipo comunica mejor y la operación aprende.
        </p>
      </LandingShell>
    </LandingSection>
  )
}

const comparisonRows = [
  ['Tarea', 'Solicitud con responsable'],
  ['Estado', 'Seguimiento y evidencia'],
  ['Vencimiento', 'Causa y trazabilidad'],
  ['Problema', 'Bloqueo y escalamiento'],
  ['Cierre', 'Verificación'],
  ['Actividad', 'Métricas de cumplimiento'],
]

export function ComparisonSection() {
  return (
    <LandingSection surface="base" spacing="tight">
      <LandingShell className="max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tokenColor="blue">Por qué no es otro Kanban</Eyebrow>
          <SectionTitle>Un Kanban organiza tareas. SCRUMBAN gestiona compromisos.</SectionTitle>
        </div>
        <LandingCard className="mt-10 overflow-hidden shadow-md ring-1 ring-border/40">
          <div className="grid grid-cols-2 border-b border-border/50 bg-muted/30 px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
            <span>Kanban tradicional</span>
            <span className="text-primary">SCRUMBAN</span>
          </div>
          {comparisonRows.map(([left, right]) => (
            <div
              key={left}
              className="grid grid-cols-2 border-t border-border/40 px-5 py-3.5 text-sm transition-colors hover:bg-muted/40"
            >
              <span className="pr-4 text-muted-foreground">{left}</span>
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <CheckCircle2 className="hidden h-4 w-4 shrink-0 text-emerald-600 sm:block" />
                {right}
              </span>
            </div>
          ))}
        </LandingCard>
      </LandingShell>
    </LandingSection>
  )
}

export function MidPageCTA() {
  return (
    <section id="diagnostico" className="border-b border-border/60 bg-foreground py-8 text-background">
      <LandingSectionSeo description={LANDING_SEO.sections.diagnostico.description} />
      <LandingShell className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Visibilidad aplicada a tu operación
          </p>
          <h2 className="mt-2 text-balance text-xl font-semibold sm:text-2xl">
            Descubre dónde estás perdiendo seguimiento hoy.
          </h2>
        </div>
        <PrimaryCTA dark className="shrink-0">
          Agendar diagnóstico
        </PrimaryCTA>
      </LandingShell>
    </section>
  )
}

const extraCapabilities = [
  { icon: MessageCircle, code: 'COM·001', title: 'Comunicación operativa', copy: 'Menos mensajes sueltos. Más contexto compartido.' },
  { icon: Users, code: 'MGT·002', title: 'Gestión de compromisos', copy: 'Cada pendiente tiene dueño, fecha y siguiente paso.' },
  { icon: Columns3, code: 'TRZ·003', title: 'Trazabilidad y evidencia', copy: 'Qué pasó, cuándo pasó y quién participó.' },
  { icon: BarChart3, code: 'KPI·004', title: 'KPIs operativos', copy: 'Mide cómo opera el equipo, no solo cuántas tareas mueve.' },
  { icon: Target, code: 'DIR·005', title: 'Dirección y decisiones', copy: 'Riesgos y prioridades visibles antes de que escalen.' },
] as const

export function MoreCapabilitiesSection() {
  return (
    <LandingSection
      id="capacidades"
      surface="muted"
      spacing="tight"
      withGrid
      seoDescription={LANDING_SEO.sections.capacidades.description}
    >
      <LandingShell className="max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow tokenColor="green">Capacidades conectadas</Eyebrow>
          <SectionTitle>
            Un sistema operativo para comunicar, ejecutar, medir y mejorar.
          </SectionTitle>
          <SectionLead className="mx-auto">
            No son módulos aislados. Cada capacidad alimenta el mismo ciclo de ejecución.
          </SectionLead>
        </div>

        <div className="relative mt-9 -mx-3 sm:mx-0">
          <div
            className="flex gap-3 overflow-x-auto scroll-smooth px-3 pb-2 snap-x snap-mandatory md:grid md:grid-cols-2 md:overflow-visible md:snap-none md:px-0 lg:grid-cols-5"
            aria-label="Módulos del sistema"
          >
            {extraCapabilities.map((cap) => {
              const Icon = cap.icon
              return (
                <div
                  key={cap.code}
                  className="w-[260px] shrink-0 snap-start rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md md:w-auto"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="mt-4 min-w-0">
                    <p className="text-sm font-semibold leading-snug text-foreground">{cap.title}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{cap.copy}</p>
                    <p className="mt-3 text-[9px] font-semibold tabular-nums tracking-wide text-muted-foreground">
                      {cap.code}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </LandingShell>
    </LandingSection>
  )
}

const closeStats = [
  { value: 89, prefix: '', suffix: '%', label: 'ICO del periodo' },
  { value: 1, prefix: '< ', suffix: ' día', label: 'Para detectar un retraso crítico' },
  { value: 18, prefix: '', suffix: '', label: 'Acciones que requieren atención hoy' },
] as const

export function CloseSection() {
  return (
    <>
      <LandingSection
        id="cierre"
        surface="inverse"
        spacing="standard"
        reveal
        seoDescription={LANDING_SEO.sections.cierre.description}
      >
        <LandingShell className="max-w-6xl text-center">
          <div className="flex justify-center">
            <Eyebrow dark tokenColor="green">
              El resultado para Dirección
            </Eyebrow>
          </div>
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-background sm:text-4xl lg:text-5xl">
            Una organización que comunica mejor,
            <br />
            <span className="text-primary">cumple, aprende y mejora.</span>
          </h2>
          <div className="mt-12 grid gap-10 border-t border-background/15 pt-10 sm:grid-cols-3 sm:gap-6">
            {closeStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl font-bold tabular-nums tracking-tight text-background sm:text-5xl">
                  {stat.prefix}
                  <CountUpInteger target={stat.value} suffix={stat.suffix} />
                </p>
                <p className="mt-3 text-sm leading-relaxed text-background/65">{stat.label}</p>
              </div>
            ))}
          </div>
        </LandingShell>
      </LandingSection>

      <LandingSection surface="base" spacing="tight" reveal withGrid>
        <LandingShell className="max-w-4xl">
          <PremiumCtaPanel>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
              Disponible · Demo personalizada
            </p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Tu operación ya genera información. Conviértela en cultura de ejecución.
            </h2>
            <SectionLead dark className="mx-auto mt-4 max-w-2xl text-emerald-50/75">
              Ayuda a tu equipo a comunicarse mejor, dar seguimiento con claridad y tomar
              decisiones con KPIs visibles.
            </SectionLead>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryCTA dark glow className="bg-foreground text-background hover:bg-foreground/90" />
              <DemoAdvisorCTA className="border-white/20 bg-white text-foreground hover:bg-white/90" />
            </div>
            <CtaTrustRow
              dark
              className="mt-5 justify-center text-emerald-200/70"
              items={['Demo personalizada', 'Sin compromiso', 'Onboarding acompañado']}
            />
          </PremiumCtaPanel>
        </LandingShell>
      </LandingSection>
    </>
  )
}
```

### `src/pages/product/ProductUI.tsx`

```tsx
import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { ArrowRight, Check, ChevronRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SECTION_SPACING, type SectionSpacing } from '@/lib/spacing'
import { RevealSection } from './RevealSection'
import { LandingSectionSeo } from './LandingSeoHead'
import { useDemoRequest } from './DemoRequestContext'
import { StatusToken, type StatusColor } from './StatusToken'

/** @deprecated Usar el formulario de demo integrado. */
export const demoHref = 'mailto:demo@scrumban.mx?subject=Quiero%20conocer%20SCRUMBAN'

/** Variantes de fondo: nunca dos secciones consecutivas iguales. */
export type LandingSurface = 'base' | 'muted' | 'depth' | 'inverse'

const SURFACE_CLASS: Record<LandingSurface, string> = {
  base: 'bg-background',
  muted: 'border-y border-border/50 bg-muted/40',
  depth: 'bg-gradient-to-b from-muted/50 via-muted/20 to-background',
  inverse: 'border-y border-border/50 bg-foreground text-background',
}

/** Contenedor de página alineado al tablero (`max-w-7xl` + padding). */
export function LandingShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  )
}

/** Sección con ritmo vertical, superficie y reveal al scroll. */
export function LandingSection({
  id,
  children,
  className,
  surface = 'base',
  spacing = 'standard',
  seoDescription,
  /** @deprecated Prefer `surface="muted"`. */
  muted = false,
  reveal = true,
  withGrid = false,
}: {
  id?: string
  children: ReactNode
  className?: string
  surface?: LandingSurface
  spacing?: SectionSpacing
  seoDescription?: string
  muted?: boolean
  reveal?: boolean
  withGrid?: boolean
}) {
  const resolvedSurface: LandingSurface = muted && surface === 'base' ? 'muted' : surface
  const content = reveal ? <RevealSection>{children}</RevealSection> : children

  return (
    <section
      id={id}
      className={cn('relative', SECTION_SPACING[spacing], SURFACE_CLASS[resolvedSurface], className)}
    >
      {seoDescription ? <LandingSectionSeo description={seoDescription} /> : null}
      {withGrid ? (
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--border) / 0.3) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--border) / 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '44px 44px',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
          }}
          aria-hidden
        />
      ) : null}
      <div className="relative">{content}</div>
    </section>
  )
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <a href="#inicio" className="inline-flex items-center gap-2.5" aria-label="SCRUMBAN, inicio">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[10px] font-black text-primary-foreground shadow-sm">
        SB
      </span>
      <span
        className={cn(
          'text-sm font-semibold tracking-[0.14em]',
          light ? 'text-primary-foreground' : 'text-foreground'
        )}
      >
        SCRUMBAN
      </span>
    </a>
  )
}

export function Eyebrow({
  children,
  dark = false,
  className,
  tokenColor = 'blue',
}: {
  children: ReactNode
  dark?: boolean
  className?: string
  tokenColor?: StatusColor
}) {
  const label = typeof children === 'string' ? children : undefined

  return (
    <div className={cn('mb-4', className)}>
      <StatusToken
        color={tokenColor}
        label={label}
        className={cn(dark && '[&>span:last-child]:text-background/75')}
      />
      {!label ? (
        <span
          className={cn(
            'ml-2 text-[11px] font-semibold uppercase tracking-wider',
            dark ? 'text-background/75' : 'text-primary'
          )}
        >
          {children}
        </span>
      ) : null}
    </div>
  )
}

export function SectionTitle({
  children,
  dark = false,
  className = '',
}: {
  children: ReactNode
  dark?: boolean
  className?: string
}) {
  return (
    <h2
      className={cn(
        'text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl',
        dark ? 'text-background' : 'text-foreground',
        className
      )}
    >
      {children}
    </h2>
  )
}

export function SectionLead({
  children,
  dark = false,
  className,
}: {
  children: ReactNode
  dark?: boolean
  className?: string
}) {
  return (
    <p
      className={cn(
        'mt-4 max-w-2xl text-sm leading-relaxed sm:text-base',
        dark ? 'text-background/70' : 'text-muted-foreground',
        className
      )}
    >
      {children}
    </p>
  )
}

/** Card del tablero: `rounded-2xl border-border/60 bg-card shadow-sm`. */
export function LandingCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Hero / panel con gradiente como TeamHub / dashboard control center. */
export function LandingPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card via-card to-muted/30 p-5 shadow-sm sm:p-7',
        className
      )}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  )
}

export function PrimaryCTA({
  children = 'Solicitar demo',
  dark = false,
  glow = false,
  className,
}: {
  children?: ReactNode
  dark?: boolean
  glow?: boolean
  className?: string
}) {
  const { openDemoRequest } = useDemoRequest()

  return (
    <Button
      type="button"
      size="lg"
      variant={dark ? 'secondary' : 'default'}
      onClick={openDemoRequest}
      className={cn(
        'h-11 min-h-11 gap-2 rounded-full px-6 text-sm font-semibold shadow-sm',
        dark && 'bg-background text-foreground hover:bg-background/90',
        glow &&
          !dark &&
          'shadow-lg shadow-primary/25 ring-1 ring-primary/20 hover:shadow-primary/30',
        className
      )}
    >
      {glow && !dark ? <Sparkles className="h-4 w-4" aria-hidden /> : null}
      {children}
      <ArrowRight className="h-4 w-4" />
    </Button>
  )
}

/** CTA secundario que abre el mismo formulario de demo. */
export function DemoAdvisorCTA({
  children = 'Hablar con un asesor',
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  const { openDemoRequest } = useDemoRequest()

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      onClick={openDemoRequest}
      className={cn(
        'h-11 min-h-11 rounded-full border-border/70 bg-background px-6 text-sm font-semibold',
        className
      )}
    >
      {children}
    </Button>
  )
}

/** Trust-bullets bajo CTAs principales (hero / cierre). */
export function CtaTrustRow({
  dark = false,
  className,
  items = ['Demo personalizada', 'Sin fricción para tu equipo', 'Implementación guiada'],
}: {
  dark?: boolean
  className?: string
  items?: readonly [string, string, string]
}) {
  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs',
        dark ? 'text-background/65' : 'text-muted-foreground',
        className
      )}
    >
      {items.map((item, index) => (
        <Fragment key={item}>
          {index > 0 ? <span aria-hidden>·</span> : null}
          <span>{item}</span>
        </Fragment>
      ))}
    </div>
  )
}

export function SecondaryCTA({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  return (
    <Button
      asChild
      size="lg"
      variant="outline"
      className={cn(
        'h-11 min-h-11 rounded-full border-border/70 bg-background px-6 text-sm font-semibold',
        className
      )}
    >
      <a href={href}>{children}</a>
    </Button>
  )
}

export function DemoWindow({
  children,
  title = 'Operación · Hoy',
  className = '',
}: {
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <LandingCard className={cn('min-w-0', className)}>
      <div className="flex h-11 items-center justify-between border-b border-border/50 bg-muted/20 px-4">
        <div className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <i className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <i className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <span className="text-[10px] font-semibold text-muted-foreground">{title}</span>
        <span className="h-5 w-5 rounded-full bg-muted" />
      </div>
      {children}
    </LandingCard>
  )
}

export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Check className="h-3 w-3" />
      </span>
      {children}
    </div>
  )
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
    >
      {children}
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </a>
  )
}

export function FeatureIcon({
  icon: Icon,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary',
        className
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
  )
}
```

### `src/pages/product/ProductVisual.tsx`

```tsx
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Rejilla sutil de fondo (producto vivo, estilo SaaS premium). */
export function LandingGridPattern({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage: `
          linear-gradient(to right, hsl(var(--border) / 0.35) 1px, transparent 1px),
          linear-gradient(to bottom, hsl(var(--border) / 0.35) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(ellipse 85% 70% at 50% 40%, black 20%, transparent 75%)',
      }}
      aria-hidden
    />
  )
}

/** Anillos orbitales decorativos (hub de módulos). */
export function LandingOrbitRings({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center', className)} aria-hidden>
      <div className="h-[min(520px,90vw)] w-[min(520px,90vw)] rounded-full border border-primary/10" />
      <div className="absolute h-[min(380px,70vw)] w-[min(380px,70vw)] rounded-full border border-primary/15" />
      <div className="absolute h-[min(240px,50vw)] w-[min(240px,50vw)] rounded-full border border-dashed border-primary/20" />
    </div>
  )
}

/** Etiqueta técnica de módulo (OPS·KPI·001). */
export function ModuleMetaBadge({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-md border border-emerald-500/25 bg-emerald-500/[0.07] px-2 py-0.5',
        'text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300',
        className
      )}
    >
      {code}
    </span>
  )
}

/** Núcleo operativo SCRUMBAN (motivo tipo “elemento” anclado al semáforo). */
export function OperationalCoreBadge({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'relative flex aspect-square w-28 flex-col items-center justify-center rounded-2xl',
        'border border-emerald-500/30 bg-gradient-to-br from-emerald-600 to-emerald-800 text-white shadow-lg shadow-emerald-900/25',
        className
      )}
    >
      <span className="absolute left-2.5 top-2.5 text-[10px] font-bold opacity-80">OPS</span>
      <span className="text-3xl font-black tracking-tight">SB</span>
      <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] opacity-90">
        SCRUMBAN
      </span>
      <span className="absolute bottom-2.5 flex gap-1">
        <i className="h-1.5 w-1.5 rounded-full bg-red-400" />
        <i className="h-1.5 w-1.5 rounded-full bg-amber-300" />
        <i className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
      </span>
    </div>
  )
}

export function ModuleFeatureCard({
  icon: Icon,
  code,
  title,
  description,
  footer,
  className,
}: {
  icon: LucideIcon
  code: string
  title: string
  description: string
  footer?: ReactNode
  className?: string
}) {
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col rounded-2xl border border-emerald-500/20 bg-card p-5',
        'shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-emerald-500/35 hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <ModuleMetaBadge code={code} />
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      {footer ? <div className="mt-4 border-t border-border/50 pt-4">{footer}</div> : null}
    </article>
  )
}

/** Pills de etapas de flujo (Kanban / pipeline). */
export function WorkflowStagePills({
  stages,
}: {
  stages: readonly { step: string; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {stages.map((stage) => (
        <span
          key={stage.step}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-2 py-1 text-[10px] font-semibold text-foreground"
        >
          <span className="text-emerald-600 dark:text-emerald-400">{stage.step}</span>
          {stage.label}
        </span>
      ))}
    </div>
  )
}

/** Panel CTA premium (gradiente oscuro, estilo referencia Nexo). */
export function PremiumCtaPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-emerald-800/40 sm:rounded-[2rem]',
        'bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950',
        'px-6 py-12 text-center shadow-2xl shadow-emerald-950/30 sm:px-10 sm:py-14',
        className
      )}
    >
      <LandingGridPattern className="opacity-[0.18]" />
      <div
        className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  )
}

/** Badge de estado en listas (ROJO / BLOQUEADO / EN CURSO). */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'red' | 'amber' | 'green' | 'neutral'
  children: ReactNode
}) {
  const tones = {
    red: 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
    neutral: 'border-border/60 bg-muted/50 text-muted-foreground',
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tones[tone]
      )}
    >
      {children}
    </span>
  )
}
```

### `src/pages/product/RevealSection.tsx`

```tsx
import type { ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'
import { cn } from '@/lib/utils'

export function RevealSection({
  children,
  className,
  threshold = 0.15,
}: {
  children: ReactNode
  className?: string
  threshold?: number
}) {
  const { ref, inView } = useInView(threshold)

  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
        inView ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        className
      )}
    >
      {children}
    </div>
  )
}
```

### `src/pages/product/StatusToken.tsx`

```tsx
import { cn } from '@/lib/utils'

export type StatusColor = 'red' | 'yellow' | 'green' | 'blue'

interface StatusTokenProps {
  color?: StatusColor
  label?: string
  size?: 'sm' | 'md'
  /** Marca de agua sutil (nav / decoración). */
  watermark?: boolean
  className?: string
  pulse?: boolean
}

const COLOR_MAP: Record<StatusColor, string> = {
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  blue: 'bg-blue-600',
}

/** Semáforo operativo — motivo visual recurrente de la landing SCRUMBAN. */
export function StatusToken({
  color = 'blue',
  label,
  size = 'sm',
  watermark = false,
  className,
  pulse = true,
}: StatusTokenProps) {
  const dimension = size === 'sm' ? 'h-2 w-2' : 'h-3 w-3'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2',
        watermark && 'pointer-events-none select-none opacity-40',
        className
      )}
    >
      <span
        className={cn(
          'shrink-0 rounded-full',
          dimension,
          COLOR_MAP[color],
          pulse && 'animate-pulse'
        )}
        aria-hidden
      />
      {label ? (
        <span
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wider',
            watermark ? 'text-muted-foreground' : 'text-primary'
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  )
}

/** Trio semáforo como marca de agua (rojo · amarillo · verde). */
export function StatusTokenMark({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1', className)}
      aria-hidden
      title="Semáforo operativo"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500/70" />
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
    </span>
  )
}
```

---

## Dependencias mínimas (hooks / spacing / utils / prioridad)

### `src/hooks/useInView.ts`

```ts
import { useEffect, useRef, useState } from 'react'

/** Observa entrada al viewport una sola vez (para reveals de scroll). */
export function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, inView }
}
```

### `src/hooks/useCountUp.ts`

```ts
import { useEffect, useState } from 'react'
import { useInView } from './useInView'

export function useCountUp(target: number, duration = 1200, threshold = 0.4) {
  const { ref, inView } = useInView(threshold)
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(target * eased))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [inView, target, duration])

  return { ref, value, inView }
}

/** Contador con un decimal (ej. 4.2 días). */
export function useCountUpDecimal(target: number, duration = 1200, threshold = 0.4) {
  const { ref, inView } = useInView(threshold)
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!inView) return
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      setValue(Math.round(target * eased * 10) / 10)
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [inView, target, duration])

  return { ref, value, inView }
}
```

### `src/lib/spacing.ts`

```ts
/** Escala de ritmo vertical de la landing — una sola sección usa `climax`. */
export const SECTION_SPACING = {
  tight: 'py-12 md:py-16',
  standard: 'py-16 md:py-20',
  hero: 'pt-20 pb-16 md:pt-28 md:pb-20',
  climax: 'py-24 md:py-32',
} as const

export type SectionSpacing = keyof typeof SECTION_SPACING
```

### `src/lib/utils.ts`

```ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### `src/features/operations/components/AccionPriorityBadge.tsx`

```tsx
import { cn } from '@/lib/utils'
import { priorityDisplayLabel } from '../utils/priorityLabels'
import { priorityColorClasses, priorityColorFor, priorityDotClasses } from '../utils/priorityColors'

type AccionPriorityBadgeProps = {
  prioridad: string
  catalogColor?: string | null
  className?: string
  compact?: boolean
  showDot?: boolean
}

export function AccionPriorityBadge({
  prioridad,
  catalogColor,
  className,
  compact = false,
  showDot = true,
}: AccionPriorityBadgeProps) {
  const color = priorityColorFor(prioridad, catalogColor)

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center rounded-md border font-semibold',
        compact ? 'gap-1 px-1.5 py-0.5 text-[10px]' : 'gap-1.5 px-2 py-0.5 text-xs',
        priorityColorClasses(color),
        className
      )}
      title={priorityDisplayLabel(prioridad)}
    >
      {showDot ? (
        <span className={cn('h-2 w-2 shrink-0 rounded-full', priorityDotClasses(color))} aria-hidden />
      ) : null}
      <span className="truncate">{priorityDisplayLabel(prioridad)}</span>
    </span>
  )
}
```

### `src/features/operations/utils/priorityLabels.ts`

```ts
export const DEFAULT_PRIORITY_NOMBRE = 'P2_Media'

export function priorityDisplayLabel(nombre: string): string {
  const key = nombre.trim()
  return key.length > 0 ? key : 'Sin prioridad'
}
```

### `src/features/operations/utils/priorityColors.ts`

```ts
import { cn } from '@/lib/utils'

export type PriorityColor = 'verde' | 'amarillo' | 'rojo'

export function normalizePriorityColor(value: string | null | undefined): PriorityColor | null {
  if (value === 'verde' || value === 'amarillo' || value === 'rojo') return value
  return null
}

export function inferPriorityColor(nombre: string): PriorityColor {
  const key = nombre.trim().toLowerCase()
  if (key.includes('p1') || key.includes('crit') || key.includes('alta') || key.includes('urgent')) return 'rojo'
  if (key.includes('p2') || key.includes('media') || key.includes('normal')) return 'amarillo'
  return 'verde'
}

export function priorityColorFor(nombre: string, color?: string | null): PriorityColor {
  return normalizePriorityColor(color) ?? inferPriorityColor(nombre)
}

/** Valor inicial del formulario de catálogo: respeta BD o infiere por nombre. */
export function priorityColorForForm(nombre: string, color?: string | null): PriorityColor {
  return normalizePriorityColor(color) ?? (nombre.trim() ? inferPriorityColor(nombre) : 'amarillo')
}

export function priorityColorClasses(color: PriorityColor, selected = false): string {
  const classes: Record<PriorityColor, string> = {
    verde: selected
      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100'
      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
    amarillo: selected
      ? 'border-amber-500 bg-amber-500/18 text-amber-950 dark:text-amber-100'
      : 'border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-200',
    rojo: selected
      ? 'border-red-500 bg-red-500/15 text-red-950 dark:text-red-100'
      : 'border-red-500/35 bg-red-500/10 text-red-950 dark:text-red-200',
  }
  return cn(classes[color], selected && 'shadow-sm ring-1 ring-current/15')
}

export function priorityDotClasses(color: PriorityColor): string {
  const classes: Record<PriorityColor, string> = {
    verde: 'bg-emerald-500',
    amarillo: 'bg-amber-500',
    rojo: 'bg-red-500',
  }
  return classes[color]
}
```

---

## Componentes UI y theme (réplica completa)

### `src/components/ui/button.tsx`

```tsx
import * as React from "react"

import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

### `src/components/ui/badge.tsx`

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow",
        outline: "text-foreground",
        success:
          "border-transparent bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/25 dark:text-emerald-950",
        muted:
          "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

### `src/components/ui/dialog.tsx`

```tsx
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showClose?: boolean
  }
>(({ className, children, showClose = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      {showClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, id: _id, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
```

### `src/components/ui/input.tsx`

```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
```

### `src/components/ui/label.tsx`

```tsx
import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
```

### `src/components/ui/select.tsx`

```tsx
import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root
const SelectGroup = SelectPrimitive.Group
const SelectValue = SelectPrimitive.Value

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-[100] max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
}
```

### `src/components/ui/tooltip.tsx`

```tsx
import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 max-w-xs overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

### `src/components/SectionCard.tsx`

```tsx
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SectionCard({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function SectionCardHeader({
  eyebrow,
  title,
  titleId,
  subtitle,
  icon: Icon,
  action,
  className,
}: {
  eyebrow?: string
  title: string
  /** Para `aria-labelledby` en la sección contenedora. */
  titleId?: string
  subtitle?: string
  icon?: LucideIcon
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h2
            id={titleId}
            className="text-sm font-semibold leading-snug tracking-tight text-foreground sm:text-[15px]"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {action ? (
        <div className="w-full min-w-0 shrink-0 sm:w-auto sm:max-w-[min(100%,28rem)]">
          {action}
        </div>
      ) : null}
    </div>
  )
}

export function SectionCardBody({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('p-4 sm:p-6', className)} {...props}>
      {children}
    </div>
  )
}
```

### `src/components/InfoHint.tsx`

```tsx
import { CircleHelp } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function InfoHint({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              className
            )}
          >
            <CircleHelp className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-[min(20rem,calc(100vw-2rem))] text-left leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

### `src/features/operations/components/form/AccionFormBlock.tsx`

```tsx
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionCard, SectionCardBody } from '@/components/SectionCard'

type AccionFormBlockProps = {
  blockId: string
  step: number
  title: string
  subtitle: string
  icon?: LucideIcon
  expanded: boolean
  onToggle: () => void
  children: ReactNode
  /** Resumen en cabecera cuando está colapsado. */
  collapsedSummary?: string
  editProtected?: boolean
}

export function AccionFormBlock({
  blockId,
  step,
  title,
  subtitle,
  icon: Icon,
  expanded,
  onToggle,
  children,
  collapsedSummary,
  editProtected = false,
}: AccionFormBlockProps) {
  const bodyId = `${blockId}-body`
  const hintText = expanded ? subtitle : (collapsedSummary ?? subtitle)

  return (
    <SectionCard
      className={cn(
        'accion-form-block transition-[border-color,box-shadow]',
        blockId,
        expanded && 'border-primary/25 shadow-sm ring-1 ring-primary/10'
      )}
      data-accion-edit-protected={editProtected ? 'true' : 'false'}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className={cn(
          'accion-form-block-toggle flex w-full touch-manipulation text-left transition-colors',
          'px-3 py-3 sm:px-4 sm:py-3.5',
          expanded
            ? 'border-b border-border/50 bg-card hover:bg-muted/10'
            : 'bg-muted/20 hover:bg-muted/30 active:bg-muted/40'
        )}
      >
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 sm:gap-x-3">
          {Icon ? (
            <div
              className={cn(
                'row-span-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10',
                expanded
                  ? 'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20'
                  : 'bg-background/80 text-muted-foreground ring-1 ring-inset ring-border/60'
              )}
            >
              <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
            </div>
          ) : null}

          <div className={cn('min-w-0', Icon ? 'col-start-2' : 'col-span-2 col-start-1')}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                Paso {step}
              </span>
            </div>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground sm:text-[15px]">{title}</p>
          </div>

          <ChevronDown
            className={cn(
              'col-start-3 row-start-1 mt-0.5 h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-180 text-foreground'
            )}
            aria-hidden
          />

          {hintText ? (
            <p
              className={cn(
                Icon ? 'col-start-2 col-span-1' : 'col-span-2 col-start-1',
                'text-xs leading-relaxed sm:text-sm',
                expanded
                  ? 'text-muted-foreground'
                  : 'font-medium text-foreground/80 [overflow-wrap:anywhere] sm:line-clamp-2'
              )}
            >
              {hintText}
            </p>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div id={bodyId}>
          <SectionCardBody className="space-y-3 px-3 py-3 sm:space-y-4 sm:p-4 md:p-6">
            {children}
          </SectionCardBody>
        </div>
      ) : null}
    </SectionCard>
  )
}
```

### `src/features/operations/components/AccionFormSection.tsx`

```tsx
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { InfoHint } from '@/components/InfoHint'
import { SectionCard, SectionCardBody } from '@/components/SectionCard'
import { cn } from '@/lib/utils'

export type AccionFormSectionProps = {
  sectionId: string
  icon?: LucideIcon
  eyebrow?: string
  title: string
  subtitle?: string
  children?: ReactNode
  bodyClassName?: string
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  /** Texto breve en cabecera cuando la sección está colapsada. */
  collapsedHint?: string
  /** Ayuda de la sección (icono junto al título; sustituye subtítulo largo). */
  infoHint?: string
}

export function AccionFormSection({
  sectionId,
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  children,
  bodyClassName,
  collapsible,
  expanded = true,
  onToggle,
  collapsedHint,
  infoHint,
}: AccionFormSectionProps) {
  const bodyId = `${sectionId}-body`
  const hintText = infoHint
    ? collapsible && !expanded
      ? collapsedHint
      : expanded
        ? subtitle
        : undefined
    : collapsible && !expanded
      ? (collapsedHint ?? subtitle)
      : subtitle

  const toggleButton = (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={bodyId}
      className={cn(
        'accion-form-section-toggle flex w-full touch-manipulation text-left transition-colors',
        'px-3 py-3 sm:px-4 sm:py-3.5',
        expanded
          ? 'border-b border-border/50 bg-card hover:bg-muted/10'
          : 'bg-muted/20 hover:bg-muted/30 active:bg-muted/40'
      )}
    >
      <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 sm:gap-x-3">
        {Icon ? (
          <div
            className={cn(
              'row-span-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10',
              expanded
                ? 'bg-primary/12 text-primary ring-1 ring-inset ring-primary/20'
                : 'bg-background/80 text-muted-foreground ring-1 ring-inset ring-border/60'
            )}
          >
            <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" aria-hidden />
          </div>
        ) : null}

        <div className={cn('min-w-0', Icon ? 'col-start-2' : 'col-span-2 col-start-1')}>
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex min-w-0 items-center gap-1.5">
            <h2
              id={`${sectionId}-title`}
              className="text-sm font-semibold leading-snug text-foreground sm:text-[15px]"
            >
              {title}
            </h2>
            {infoHint ? <InfoHint text={infoHint} className="shrink-0" /> : null}
          </div>
        </div>

        <div className="col-start-3 row-start-1 flex shrink-0 items-center gap-1">
          <ChevronDown
            className={cn(
              'h-5 w-5 text-muted-foreground transition-transform duration-200',
              expanded && 'rotate-180 text-foreground'
            )}
            aria-hidden
          />
        </div>

        {hintText ? (
          <p
            className={cn(
              Icon ? 'col-start-2 col-span-1' : 'col-span-2 col-start-1',
              'text-xs leading-relaxed sm:text-sm',
              expanded
                ? 'text-muted-foreground'
                : 'font-medium text-foreground/80 [overflow-wrap:anywhere] sm:line-clamp-2'
            )}
          >
            {hintText}
          </p>
        ) : null}
      </div>
    </button>
  )

  if (collapsible) {
    return (
      <SectionCard
        className={cn(
          'accion-form-section transition-[border-color,box-shadow]',
          sectionId,
          expanded && 'border-primary/25 shadow-sm ring-1 ring-primary/10'
        )}
        data-expanded={expanded ? 'true' : 'false'}
      >
        {toggleButton}
        {expanded && children ? (
          <div id={bodyId}>
            <SectionCardBody className={cn('space-y-4 px-3 py-3 sm:p-4 md:p-6', bodyClassName)}>
              {children}
            </SectionCardBody>
          </div>
        ) : null}
      </SectionCard>
    )
  }

  return (
    <SectionCard className={cn('accion-form-section', sectionId)}>
      <div className="border-b border-border/50 px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted sm:h-10 sm:w-10">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex items-center gap-1.5">
              <h2 id={`${sectionId}-title`} className="text-sm font-semibold sm:text-[15px]">
                {title}
              </h2>
              {infoHint ? <InfoHint text={infoHint} className="shrink-0" /> : null}
            </div>
            {subtitle ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>
      {children ? (
        <SectionCardBody className={cn('space-y-4 px-3 py-3 sm:p-4 md:p-6', bodyClassName)}>{children}</SectionCardBody>
      ) : null}
    </SectionCard>
  )
}

export function AccionFormField({
  label,
  htmlFor,
  hint,
  hintAsIcon = false,
  required,
  error,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  /** Texto de ayuda: párrafo debajo del label o tooltip (icono) si hintAsIcon. */
  hint?: string
  hintAsIcon?: boolean
  required?: boolean
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </Label>
        {hint && hintAsIcon ? <InfoHint text={hint} className="shrink-0" /> : null}
      </div>
      {hint && !hintAsIcon ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
```

### `src/styles/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Modo claro */
    --background: 220 20% 97%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;
    --primary: 221 83% 53%;
    --primary-foreground: 0 0% 100%;
    --secondary: 220 14% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted: 220 14% 96%;
    --muted-foreground: 220 9% 46%;
    --accent: 221 83% 53%;
    --accent-foreground: 0 0% 100%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 220 13% 91%;
    --input: 220 13% 91%;
    --ring: 221 83% 53%;
    --radius: 0.5rem;
    --card-radius: calc(var(--radius) - 2px);

    /* Semáforo KPI */
    --semaforo-verde: 142 71% 45%;
    --semaforo-amarillo: 38 92% 50%;
    --semaforo-rojo: 0 84% 60%;

    /* Estados de acciones */
    --status-pendiente: 220 9% 46%;
    --status-hoy: 217 91% 60%;
    --status-ejecucion: 262 83% 58%;
    --status-bloqueado: 0 84% 60%;
    --status-hecho: 142 71% 45%;
    --status-verificado: 158 64% 52%;

    /* Gradientes (stops para usar con linear-gradient) */
    --gradient-primary: linear-gradient(
      135deg,
      hsl(221 83% 53%),
      hsl(262 83% 58%)
    );
    --gradient-success: linear-gradient(
      135deg,
      hsl(142 71% 45%),
      hsl(158 64% 52%)
    );
    --gradient-warning: linear-gradient(
      135deg,
      hsl(38 92% 50%),
      hsl(48 96% 53%)
    );
    --gradient-danger: linear-gradient(
      135deg,
      hsl(0 84% 60%),
      hsl(350 84% 65%)
    );
    --gradient-dark: linear-gradient(
      180deg,
      hsl(222 47% 8%),
      hsl(222 47% 4%)
    );

    /* Sidebar (Dark Premium) */
    --sidebar-background: 222 47% 11%;
    --sidebar-foreground: 220 14% 96%;
    --sidebar-primary: 221 83% 53%;
    --sidebar-accent: 220 26% 18%;
  }

  .dark {
    --background: 222 47% 8%;
    --foreground: 220 14% 96%;
    --card: 222 47% 11%;
    --card-foreground: 220 14% 96%;
    --popover: 222 47% 11%;
    --popover-foreground: 220 14% 96%;
    --primary: 217 91% 60%;
    --primary-foreground: 222 47% 11%;
    --secondary: 220 26% 14%;
    --secondary-foreground: 220 14% 96%;
    --muted: 220 26% 14%;
    --muted-foreground: 220 9% 60%;
    --accent: 220 26% 18%;
    --accent-foreground: 220 14% 96%;
    --destructive: 0 62% 50%;
    --destructive-foreground: 220 14% 96%;
    --border: 220 26% 18%;
    --input: 220 26% 18%;
    --ring: 217 91% 60%;

    /* Sidebar en dark mantiene el mismo estilo premium */
    --sidebar-background: 222 47% 11%;
    --sidebar-foreground: 220 14% 96%;
    --sidebar-primary: 217 91% 60%;
    --sidebar-accent: 220 26% 18%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground antialiased;
  }
}

@layer components {
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] input,
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] textarea:not([data-accion-field-editable='true']),
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] select,
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] [role='combobox'],
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] [role='radio'],
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] [role='button'],
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] button:not([aria-expanded]) {
    pointer-events: none;
    cursor: default;
  }

  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] input,
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] textarea:not([data-accion-field-editable='true']),
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] [role='combobox'],
  [data-accion-dialog-mode='edit'] [data-accion-edit-protected='true'] button:not([aria-expanded]) {
    opacity: 0.7;
  }
}
```

---

## Notas de réplica

1. Los demos (`ProductDemos`) son 100% locales: estado en memoria, sin Supabase ni localStorage.
2. Los CTAs abren `DemoRequestDialog` vía `DemoRequestProvider`.
3. `ComparisonSection` y `ExecutiveCaseSplit` existen en el código pero no están montados actualmente en `ProductLandingPage`.
4. Alias `@/` → `src/`.
5. Endpoint opcional: `POST /api/demo-request` (fallback a `mailto:demo@scrumban.mx`).
6. Configura Tailwind con `darkMode` y el plugin que mapea colores a `hsl(var(--token))` como en el proyecto.
{% endraw %}
