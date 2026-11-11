/** Metadescripciones de la landing SCRUMBAN — fuente única para `<head>` y JSON-LD. */

export const LANDING_SEO = {
  siteName: 'Scrumban',
  productName: 'Scrumban',
  title: 'Scrumban | Software de Gestión y Ejecución Empresarial',
  description:
    'Conecta objetivos, equipos y compromisos. Gestiona acciones, OKRs y operaciones con seguimiento, indicadores y responsables.',
  keywords:
    'software de gestión empresarial, software de gestión de operaciones, plataforma de ejecución empresarial, seguimiento de compromisos, gestión de equipos de trabajo, software OKR, gestión de tareas empresariales, control de actividades empresariales, seguimiento de objetivos estratégicos, tableros de gestión empresarial, Scrumban',
  path: '/producto',
  ogImagePath: '/og/scrumban.svg',
  ogImageAlt: 'Scrumban — software de gestión y ejecución empresarial',
  relatedPath: '/agente',
  relatedName: 'Enviardián',
  sections: {
    inicio: {
      id: 'inicio',
      name: 'Software de gestión y ejecución empresarial',
      description:
        'Convierte la estrategia en resultados. Conecta objetivos, equipos y compromisos en un sistema para ejecutar, dar seguimiento y medir avances.',
    },
    coordinacion: {
      id: 'coordinacion',
      name: 'Coordinación entre áreas',
      description:
        'Gestión empresarial con visibilidad entre áreas: solicitudes, responsables, compromisos y estados en un mismo flujo.',
    },
    ejecucion: {
      id: 'ejecucion',
      name: 'Gestión de acciones y Kanban',
      description:
        'De los planes a compromisos con seguimiento: Kanban, prioridades, fechas, checkpoints, evidencias y verificación de cumplimiento.',
    },
    visibilidad: {
      id: 'visibilidad',
      name: 'OKRs e indicadores BAU',
      description:
        'Consulta objetivos estratégicos, indicadores BAU, retrasos y bloqueos. Una vista de atención semanal con profundidad progresiva.',
    },
    seguimiento: {
      id: 'seguimiento',
      name: 'Seguimiento operativo',
      description:
        'Detecta retrasos antes de que escalen: vencimientos, bloqueos, actualizaciones y reportes de avance.',
    },
    colaboracion: {
      id: 'colaboracion',
      name: 'Comunicación y colaboración',
      description:
        'Cada solicitud tiene contexto, responsable y respuesta. Comentarios y evidencias ligados al compromiso.',
    },
    mejora: {
      id: 'mejora',
      name: 'Mejora continua',
      description:
        'Convierte la ejecución en seguimiento, aprendizaje y mejores decisiones: objetivos, indicadores, gaps y próximas prioridades.',
    },
    enviardian: {
      id: 'enviardian',
      name: 'Enviardián integrado',
      description:
        'Consulta objetivos, acciones y bloqueos en conversación. El asistente de IA complementa Scrumban sin desconectarse del tablero.',
    },
    cierre: {
      id: 'cierre',
      name: 'Estrategia con seguimiento',
      description:
        'Tu estrategia necesita ejecución. Tu ejecución necesita seguimiento. Solicita una demostración de Scrumban.',
    },
  },
} as const

export type LandingSectionSeoKey = keyof typeof LANDING_SEO.sections

export function getLandingCanonicalUrl(path: string = LANDING_SEO.path) {
  const base = import.meta.env.VITE_APP_URL?.replace(/\/$/, '') ?? 'https://scrumbanemx.vercel.app'
  return `${base}${path}`
}

export function getLandingSectionUrl(sectionId: string) {
  return `${getLandingCanonicalUrl()}#${sectionId}`
}

export function getLandingOgImageUrl() {
  return `${getLandingCanonicalUrl('').replace(/\/$/, '')}${LANDING_SEO.ogImagePath}`
}
