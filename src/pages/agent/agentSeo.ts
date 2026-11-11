/** Metadescripciones de la landing comercial del agente — fuente única para `<head>` y JSON-LD. */
export const AGENT_LANDING_SEO = {
  siteName: 'SCRUMBAN',
  title: 'SCRUMBAN | Tu operación, bajo control',
  description:
    'Consulta avances, detecta bloqueos y da seguimiento a los compromisos de tu equipo. De la conversación a la acción verificada, con Enviardián.',
  keywords:
    'dirección general, seguimiento de compromisos, visibilidad ejecutiva, Enviardián, WhatsApp operativo, verificación de cumplimiento, ejecución empresarial',
  path: '/agente',
  sections: {
    inicio: {
      id: 'inicio',
      name: 'Tu operación, bajo control',
      description:
        'Consulta avances, detecta bloqueos y da seguimiento a los compromisos desde una conversación.',
    },
    visibilidad: {
      id: 'visibilidad',
      name: 'Pregunta. Entiende. Decide.',
      description:
        'Una consulta a Enviardián revela vencidos, bloqueos y pendientes de verificación con datos de demostración.',
    },
    accion: {
      id: 'accion',
      name: 'De una conversación a una acción',
      description:
        'Una instrucción natural genera una propuesta con responsable, fecha y descripción. Nada se crea hasta confirmar.',
    },
    whatsapp: {
      id: 'whatsapp',
      name: 'Tu equipo responde. La ejecución avanza.',
      description:
        'WhatsApp permite reportar avances, solicitar apoyo y adjuntar evidencia sobre la misma acción.',
    },
    verificacion: {
      id: 'verificacion',
      name: 'Que se reporte no significa que esté resuelto',
      description:
        'Hecho no es Verificado. La evidencia queda en la acción y la validación la hace quien tiene permiso.',
    },
    continuidad: {
      id: 'continuidad',
      name: 'Habla de tu negocio. Prepara el siguiente paso.',
      description:
        'Voz, informe PDF e historial. Borradores de Gmail y propuestas de Calendar solo con cuenta conectada y tu aprobación.',
    },
    demostracion: {
      id: 'demostracion',
      name: 'Más claridad para decidir. Más seguimiento para ejecutar.',
      description:
        'Solicita una demostración con los retos de seguimiento de tu empresa o prueba a Enviardián en esta página.',
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
