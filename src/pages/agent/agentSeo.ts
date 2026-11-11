/** Metadescripciones de la landing comercial del agente — fuente única para `<head>` y JSON-LD. */

export const AGENT_LANDING_SEO = {
  siteName: 'Scrumban',
  productName: 'Enviardián',
  title: 'Enviardián | Asistente de IA para Empresas',
  description:
    'Consulta tu operación por voz o chat, identifica bloqueos, prepara acciones y da seguimiento a tu equipo con inteligencia artificial.',
  keywords:
    'asistente de IA para empresas, asistente empresarial con inteligencia artificial, asistente de voz para empresas, IA para gestión de tareas, IA para seguimiento de compromisos, asistente IA para operaciones, asistente IA con WhatsApp, consultas empresariales con IA, inteligencia artificial para gestión empresarial, Enviardián',
  path: '/agente',
  ogImagePath: '/og/enviardian.svg',
  ogImageAlt: 'Enviardián — asistente de IA para empresas',
  relatedPath: '/producto',
  relatedName: 'Scrumban',
  sections: {
    inicio: {
      id: 'inicio',
      name: 'Asistente de IA empresarial',
      description:
        'Consulta tu empresa, asigna compromisos y da seguimiento a tu equipo por voz, chat y WhatsApp.',
    },
    visibilidad: {
      id: 'visibilidad',
      name: 'Consultas de información operativa',
      description:
        'Consulta OKRs, BAU, KPIs, vencidos, bloqueos y pendientes de verificación en una respuesta priorizada.',
    },
    accion: {
      id: 'accion',
      name: 'Propuestas de acciones',
      description:
        'Instrucción en lenguaje natural, propuesta con responsable, fecha, prioridad y evidencia. Confirmación humana antes de crear.',
    },
    whatsapp: {
      id: 'whatsapp',
      name: 'Seguimiento por WhatsApp',
      description:
        'Aviso autorizado, reportes, apoyo y evidencia por WhatsApp; el tablero refleja el cambio.',
    },
    verificacion: {
      id: 'verificacion',
      name: 'Verificación de cumplimiento',
      description:
        'Evidencias, historial e informes ejecutivos. Hecho no es Verificado.',
    },
    asistente: {
      id: 'asistente',
      name: 'Asistente por voz e historial',
      description:
        'Chat, resumen de sesión, informe PDF e historial. Compartir por WhatsApp cuando esté permitido.',
    },
    integraciones: {
      id: 'integraciones',
      name: 'Integraciones condicionadas',
      description:
        'Borradores de Gmail y propuestas de Calendar con cuenta Google conectada. Nada se envía ni se crea sin confirmar.',
    },
    demostracion: {
      id: 'demostracion',
      name: 'Demostración Enviardián',
      description:
        'Solicita una demostración o prueba Enviardián. Conecta dirección, responsables y seguimiento.',
    },
  },
} as const

export type AgentLandingSectionSeoKey = keyof typeof AGENT_LANDING_SEO.sections

export function getAgentLandingCanonicalUrl(path: string = AGENT_LANDING_SEO.path) {
  const base = import.meta.env.VITE_APP_URL?.replace(/\/$/, '') ?? 'https://scrumbanemx.vercel.app'
  return `${base}${path}`
}

export function getAgentLandingSectionUrl(sectionId: string) {
  return `${getAgentLandingCanonicalUrl()}#${sectionId}`
}

export function getAgentLandingOgImageUrl() {
  return `${getAgentLandingCanonicalUrl('').replace(/\/$/, '')}${AGENT_LANDING_SEO.ogImagePath}`
}
