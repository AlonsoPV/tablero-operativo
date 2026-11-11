/** Metadescripciones de la landing SCRUMBAN — fuente única para `<head>` y JSON-LD. */
export const LANDING_SEO = {
  siteName: 'SCRUMBAN',
  title: 'SCRUMBAN | Plataforma de ejecución empresarial',
  description:
    'Conecta objetivos, equipos y compromisos. Ejecuta, da seguimiento y mide avances con visibilidad para dirección.',
  keywords:
    'ejecución empresarial, gestión operativa, kanban, OKR, compromisos, KPIs, scrumban, visibilidad dirección',
  path: '/producto',
  sections: {
    inicio: {
      id: 'inicio',
      name: 'Plataforma de ejecución empresarial',
      description:
        'Convierte la estrategia en resultados. Conecta objetivos, equipos y compromisos en un sistema para ejecutar, dar seguimiento y medir avances.',
    },
    coordinacion: {
      id: 'coordinacion',
      name: 'Coordinación entre áreas',
      description:
        'Todos saben qué hacer, quién responde y qué sigue. Solicitudes, responsables, áreas y estados en un mismo flujo.',
    },
    ejecucion: {
      id: 'ejecucion',
      name: 'Ejecución operativa',
      description:
        'De los planes a compromisos con seguimiento: Kanban, prioridades, fechas, checkpoints, evidencias y verificación.',
    },
    visibilidad: {
      id: 'visibilidad',
      name: 'Visibilidad directiva',
      description:
        'Consulta objetivos, indicadores, retrasos y bloqueos. Una vista de atención semanal con profundidad progresiva.',
    },
    seguimiento: {
      id: 'seguimiento',
      name: 'Seguimiento de compromisos',
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
      name: 'Gestión y mejora continua',
      description:
        'Convierte la ejecución en seguimiento, aprendizaje y mejores decisiones: objetivos, indicadores, gaps y próximas prioridades.',
    },
    enviardian: {
      id: 'enviardian',
      name: 'Enviardián integrado',
      description:
        'Consulta objetivos, acciones y bloqueos en conversación. La IA complementa Scrumban sin desconectarse del tablero.',
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

export function getLandingCanonicalUrl(path = LANDING_SEO.path) {
  const base = import.meta.env.VITE_APP_URL?.replace(/\/$/, '') ?? 'https://scrumbanemx.vercel.app'
  return `${base}${path}`
}

export function getLandingSectionUrl(sectionId: string) {
  return `${getLandingCanonicalUrl()}#${sectionId}`
}
