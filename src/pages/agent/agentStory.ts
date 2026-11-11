/**
 * Escenario único de demostración para la landing `/agente`.
 * Datos ficticios · America/Mexico_City · no representan operación real.
 */
import { formatWorkDateLong } from '@/features/ai-support/parseWorkFacts'
import { todayWallClockCDMX } from '@/lib/dateUtils'

export const AGENT_STORY_DEMO_LABEL = 'Ejemplo · demostración'

export const AGENT_STORY = {
  actionId: 'AC-1038',
  actionTitle: 'Cierre de inventario',
  actionFocus: 'Revisar diferencias de inventario',
  owner: {
    firstName: 'Carlos',
    fullName: 'Carlos Reyes',
    role: 'Operaciones',
  },
  blockerLabel: 'Requiere apoyo',
  evidenceFile: 'diferencias-inventario.pdf',
  instruction:
    'Asigna a Carlos revisar las diferencias de inventario el viernes.',
  proposal: {
    title: 'Revisar diferencias de inventario',
    description:
      'Identificar las diferencias detectadas y documentar los ajustes necesarios.',
    ownerConfirmNote: 'Carlos Reyes · falta confirmar a la persona en el directorio.',
  },
  mailDraft: {
    ask: 'Prepara un correo para Jorge con el resumen de lo que acordamos.',
    reply: 'Te dejaré un borrador listo para revisar antes de enviarlo.',
    to: 'Jorge Mendoza',
    subject: 'Seguimiento · diferencias de inventario (AC-1038)',
    body:
      'Jorge,\n\nQuedamos en revisar las diferencias de inventario con Carlos Reyes. La acción sigue abierta hasta verificación.\n\nSaludos.',
  },
  interviewLines: [
    'Detecté un bloqueo en inventarios. Carlos solicitó apoyo y la acción sigue pendiente.',
    'AC-1038, cierre de inventario, sigue abierto. Carlos Reyes es el responsable.',
    'El reporte de Hecho aún no está verificado. Falta la revisión de quien tiene permiso.',
  ],
  heroAttention: {
    id: 'AC-1038',
    title: 'Cierre de inventario',
    owner: 'Carlos Reyes',
    meta: 'Solicitó apoyo',
    state: 'Requiere apoyo',
    tone: 'red' as const,
  },
} as const

export const AGENT_STORY_RAIL = [
  { step: '01', verb: 'Detecta', object: 'Un bloqueo', href: '#inicio' },
  { step: '02', verb: 'Decide', object: 'Una acción', href: '#visibilidad' },
  { step: '03', verb: 'Asigna', object: 'Un responsable', href: '#accion' },
  { step: '04', verb: 'Responde', object: 'Por WhatsApp', href: '#whatsapp' },
  { step: '05', verb: 'Verifica', object: 'El cumplimiento', href: '#verificacion' },
  { step: '06', verb: 'Continúa', object: 'Con Enviardián', href: '#continuidad' },
] as const

/** Viernes relativo a “hoy” en CDMX, como fecha absoluta de demostración. */
export function agentStoryFridayLabel() {
  const today = todayWallClockCDMX()
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12, 0, 0)
  const day = date.getDay()
  const delta = (5 - day + 7) % 7
  date.setDate(date.getDate() + delta)
  const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
  return formatWorkDateLong(ymd)
}

export const AGENT_STORY_VISIBILITY = {
  attention: {
    ask: '¿Qué necesita mi atención hoy?',
    reply:
      'Hay un compromiso que requiere atención: AC-1038, cierre de inventario. Carlos Reyes solicitó apoyo y la acción sigue abierta.',
    points: [
      'Vencido · AC-1038 · Cierre de inventario',
      'Bloqueo · Carlos Reyes · Requiere apoyo',
      'Por verificar · ninguna otra en este ejemplo',
      'Objetivo · cerrar inventarios sin diferencias',
    ],
  },
  vencidos: {
    ask: '¿Qué compromisos están vencidos?',
    reply:
      'AC-1038 sigue abierto después de su fecha. Carlos Reyes es el responsable y el estado es en ejecución con bloqueo.',
    points: ['AC-1038 · Carlos Reyes · inventario · vencido', 'Estado: abierto, no verificado'],
  },
  bloqueos: {
    ask: '¿Dónde está el bloqueo?',
    reply:
      'Inventarios concentra el bloqueo. Carlos solicitó apoyo en AC-1038. Pedir apoyo lo deja visible; no lo da por cerrado.',
    points: ['Equipo: Operaciones', 'Acción: AC-1038', 'Estado: Requiere apoyo'],
  },
} as const

export type AgentStoryVisibilityId = keyof typeof AGENT_STORY_VISIBILITY
