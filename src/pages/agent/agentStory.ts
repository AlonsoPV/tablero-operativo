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
    'Asigna a Carlos revisar las diferencias de inventario el viernes a las 09:00, prioridad alta, con evidencia documentada.',
  proposal: {
    title: 'Revisar diferencias de inventario',
    description:
      'Identificar las diferencias detectadas y documentar los ajustes necesarios.',
    relatedNote: 'Relacionada con el cierre AC-1038.',
    priority: 'Alta',
    dueTime: '09:00',
    evidenceExpected: 'Documento con diferencias y ajustes propuestos',
  },
  visibility: {
    ask: '¿Qué objetivos están atrasados y qué compromisos requieren atención?',
    findingTitle: 'Bloqueo en inventarios',
    findingDetail:
      'AC-1038 · Cierre de inventario. Carlos Reyes solicitó apoyo; la acción sigue abierta y la fecha ya venció.',
    whyItMatters: 'Sin intervención, el cierre no avanza y el cumplimiento queda sin validar.',
    dimensions: [
      { label: 'OKR', value: 'Inventarios sin diferencias · en riesgo por el bloqueo' },
      { label: 'BAU', value: 'Operación estable fuera de inventarios' },
      { label: 'KPI', value: 'Exactitud de inventario · por debajo del umbral' },
      { label: 'Vencidos', value: 'AC-1038 · Cierre de inventario' },
      { label: 'Bloqueos', value: 'Carlos Reyes · Requiere apoyo' },
      { label: 'Por verificar', value: 'Ninguna otra en este ejemplo' },
    ],
  },
  whatsapp: {
    secondaryNote:
      'Roles habilitados también pueden consultar al bot por mensaje o pedir una liga de voz.',
  },
  verification: {
    history: [
      '09:02 · Aviso autorizado enviado a Carlos Reyes',
      '09:03 · Carlos reportó Realizada',
      '09:04 · Evidencia recibida · diferencias-inventario.pdf',
      'Pendiente · Verificación por quien tiene permiso',
    ],
  },
  assistant: {
    chat: [
      {
        role: 'user' as const,
        text: 'Resume qué pasó con el cierre de inventario y qué falta.',
      },
      {
        role: 'assistant' as const,
        text: 'AC-1038 quedó en Hecho con evidencia. Falta la verificación autorizada para cerrar el cumplimiento.',
      },
    ],
    sessionSummary:
      'Sesión de ejemplo: se revisó el bloqueo de inventarios, la evidencia de Carlos Reyes y el pendiente de verificación.',
    shareNote: 'Resumen corto listo para WhatsApp · solo si el perfil tiene permiso.',
  },
  mailDraft: {
    ask: 'Prepara un correo con el resumen y los próximos pasos.',
    reply: 'Borrador listo. Revísalo antes de enviar; no se envía solo.',
    to: 'Jorge Mendoza',
    subject: 'Seguimiento · diferencias de inventario (AC-1038)',
    body: 'Jorge,\n\nResumen: el cierre de inventario (AC-1038) quedó documentado por Carlos Reyes. Pendiente: verificación autorizada.\n\nPróximos pasos: validar la evidencia y cerrar el cumplimiento.\n\nSaludos.',
  },
  calendarDraft: {
    title: 'Revisión de verificación · AC-1038',
    when: 'Viernes · 10:00–10:30 (CDMX)',
    attendees: 'Tú · Carlos Reyes',
    note: 'Propuesta de evento. No se crea hasta que confirmes.',
  },
  interviewLines: [
    'Hay un bloqueo en inventarios: AC-1038. Carlos Reyes solicitó apoyo y requiere tu atención.',
  ],
} as const

export const AGENT_STORY_RAIL = [
  { step: '01', verb: 'Consulta', object: 'Tu operación', href: '#inicio' },
  { step: '02', verb: 'Atiende', object: 'Lo urgente', href: '#visibilidad' },
  { step: '03', verb: 'Decide', object: 'Un compromiso', href: '#accion' },
  { step: '04', verb: 'Sigue', object: 'Por WhatsApp', href: '#whatsapp' },
  { step: '05', verb: 'Verifica', object: 'El cumplimiento', href: '#verificacion' },
  { step: '06', verb: 'Conserva', object: 'Cada acuerdo', href: '#asistente' },
  { step: '07', verb: 'Prepara', object: 'El siguiente paso', href: '#integraciones' },
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
