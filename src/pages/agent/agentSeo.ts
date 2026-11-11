/** Metadescripciones de la landing comercial del agente — fuente única para `<head>` y JSON-LD. */
export const AGENT_LANDING_SEO = {
  siteName: 'SCRUMBAN',
  title: 'SCRUMBAN | Tu operación, bajo control.',
  description:
    'Consulta tu empresa, asigna compromisos y da seguimiento a tu equipo por voz, chat y WhatsApp. Visibilidad, ejecución y verificación con Enviardián.',
  keywords:
    'dirección general, seguimiento de compromisos, visibilidad ejecutiva, Enviardián, WhatsApp operativo, verificación de cumplimiento, Gmail, Calendar, ejecución empresarial',
  path: '/agente',
  sections: {
    inicio: {
      id: 'inicio',
      name: 'Tu operación, bajo control.',
      description:
        'Consulta tu empresa, asigna compromisos y da seguimiento a tu equipo por voz, chat y WhatsApp.',
    },
    visibilidad: {
      id: 'visibilidad',
      name: 'Lo que necesitas saber, en una conversación.',
      description:
        'Consulta OKRs, BAU, KPIs, vencidos, bloqueos y pendientes de verificación en una respuesta priorizada.',
    },
    accion: {
      id: 'accion',
      name: 'De una instrucción a un compromiso claro.',
      description:
        'Instrucción en lenguaje natural, propuesta con responsable, fecha, prioridad y evidencia. Confirmación antes de crear.',
    },
    whatsapp: {
      id: 'whatsapp',
      name: 'El seguimiento sucede donde trabaja tu equipo.',
      description:
        'Aviso autorizado, reportes, apoyo y evidencia por WhatsApp; el tablero refleja el cambio.',
    },
    verificacion: {
      id: 'verificacion',
      name: 'No solo sabes qué se reportó. Sabes qué se cumplió.',
      description:
        'Evidencias, historial y verificación autorizada. Hecho no es Verificado.',
    },
    asistente: {
      id: 'asistente',
      name: 'Habla de tu empresa. Conserva cada acuerdo.',
      description:
        'Chat, resumen de sesión, informe PDF e historial. Compartir por WhatsApp cuando esté permitido.',
    },
    integraciones: {
      id: 'integraciones',
      name: 'De la conversación a tener el siguiente paso listo.',
      description:
        'Borradores de Gmail y propuestas de Calendar con cuenta Google conectada. Nada se envía ni se crea sin confirmar.',
    },
    demostracion: {
      id: 'demostracion',
      name: 'Más claridad para decidir. Más seguimiento para ejecutar.',
      description:
        'Solicita una demostración o prueba Enviardián. Conecta dirección, responsables y seguimiento.',
    },
  },
} as const

export type AgentLandingSectionSeoKey = keyof typeof AGENT_LANDING_SEO.sections

export function getAgentLandingCanonicalUrl(path = AGENT_LANDING_SEO.path) {
  const base = import.meta.env.VITE_APP_URL?.replace(/\/$/, '') ?? 'https://scrumbanemx.vercel.app'
  return `${base}${path}`
}

export function getAgentLandingSectionUrl(sectionId: string) {
  return `${getAgentLandingCanonicalUrl()}#${sectionId}`
}
