/** Metadescripciones de la landing Agente IA + WhatsApp — fuente única para `<head>` y JSON-LD. */
export const AGENT_LANDING_SEO = {
  siteName: 'SCRUMBAN',
  title: 'SCRUMBAN Agente | IA operativa en web y WhatsApp',
  description:
    'Agente IA conectado al tablero y a WhatsApp: consulta, propone operaciones, pide confirmación y da seguimiento a compromisos sin perder trazabilidad.',
  keywords:
    'agente IA, WhatsApp operativo, asistente SCRUMBAN, seguimiento WhatsApp, confirmación de operaciones, chatbot operacional, bandeja WhatsApp',
  path: '/agente',
  sections: {
    inicio: {
      id: 'inicio',
      name: 'Agente operativo en WhatsApp',
      description:
        'Opera desde WhatsApp o el chat web con un agente que entiende el tablero: consulta, propone y confirma antes de ejecutar.',
    },
    problema: {
      id: 'problema',
      name: 'El costo de operar solo por chat',
      description:
        'Seguimientos manuales, respuestas perdidas y decisiones fuera de contexto. El agente convierte WhatsApp en canal operativo con trazabilidad.',
    },
    cultura: {
      id: 'cultura',
      name: 'De chat informal a canal con confirmación',
      description:
        'Pasa de mensajes sueltos a propuestas claras, botones de confirmación, evidencia y seguimiento programado en el mismo hilo.',
    },
    producto: {
      id: 'como-funciona',
      name: 'WhatsApp en acción',
      description:
        'Asignación, follow-ups con botones, evidencia y respuestas del agente IA en el flujo real de WhatsApp Cloud API.',
    },
    indicadores: {
      id: 'propuestas',
      name: 'Propuestas con control humano',
      description:
        'El agente propone crear o actualizar acciones; tú confirmas o cancelas. Nada se escribe en el tablero sin tu visto bueno.',
    },
    diagnostico: {
      id: 'diagnostico',
      name: 'Demo del agente',
      description:
        'Agenda una demo personalizada del agente IA en web y WhatsApp aplicada a tu operación.',
    },
    canales: {
      id: 'canales',
      name: 'Dos canales, un mismo tablero',
      description:
        'Chat web en /asistente-ia y WhatsApp bidireccional con la misma lógica operativa y el mismo contexto del tablero.',
    },
    capacidades: {
      id: 'capacidades',
      name: 'Capacidades del agente',
      description:
        'Consulta del tablero, propuestas con confirmación, seguimientos WhatsApp, bandeja unificada y evidencia adjunta.',
    },
    cierre: {
      id: 'cierre',
      name: 'Resultado para operación y dirección',
      description:
        'Seguimiento continuo sin perseguir pendientes: el agente ayuda a ejecutar y WhatsApp mantiene el compromiso vivo.',
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
