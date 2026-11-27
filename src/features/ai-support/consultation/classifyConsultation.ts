/**
 * Distingue explicación, consulta, análisis, recomendación y gestión
 * sin pedir al usuario que cambie de modo.
 * No ejecuta herramientas ni lee datos.
 */
import { isMethodQuestion, isWhoLags } from './speechAct'

export type ConsultationKind =
  | 'concept'
  | 'data'
  | 'analysis'
  | 'recommendation'
  | 'management'
  | 'unknown'

export type ConsultationTopic =
  | 'okr'
  | 'kr'
  | 'initiative'
  | 'kanban'
  | 'scrumban'
  | 'team'
  | 'general'

export type ConsultationTurn = {
  kind: ConsultationKind
  topic: ConsultationTopic
  inheritedTopic: boolean
}

const TOPICS = new Set<ConsultationTopic>([
  'okr',
  'kr',
  'initiative',
  'kanban',
  'scrumban',
  'team',
  'general',
])

export function isConsultationTopic(value: unknown): value is ConsultationTopic {
  return typeof value === 'string' && TOPICS.has(value as ConsultationTopic)
}

export function normalizeConsultationText(text: string) {
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
}

/** Pregunta de definición. No incluye pedidos de datos propios («nuestros», «tengo», «vamos»). */
export function isConceptualQuestion(text: string) {
  const t = normalizeConsultationText(text)
  if (!t) return false
  if (
    /\b(nuestros|nuestras|tengo|tenemos|mis|actualmente|listame|muestrame|cuales|cuantos|cuantas|avance|vamos|van|atrasad|pendiente|asignad|prioriz|deberia|deberiamos|podemos hacer)\b/.test(
      t
    )
  ) {
    return false
  }
  return (
    /\b(que es|que son|que significa|que significan|como funciona|como funcionan|para que sirve|para que sirven|explicame|definicion|en que consiste|en que consisten|que quiere decir)\b/.test(
      t
    ) || /^explica(me)?\b/.test(t)
  )
}

export function conceptExplanation(topic: ConsultationTopic): string {
  switch (topic) {
    case 'okr':
      return 'Un OKR es un objetivo con resultados medibles. El objetivo dice el cambio que queremos lograr. Cada resultado clave (KR) dice cómo sabremos si lo logramos: punto de partida, meta y avance. Las iniciativas son el trabajo que empuja esos resultados. No es una tarea del tablero.'
    case 'kr':
      return 'Un KR, o resultado clave, es la medida de un OKR. Tiene una meta y un avance. Mide un resultado, no la lista de tareas.'
    case 'initiative':
      return 'Una iniciativa es el trabajo que ayuda a mover un resultado clave. No es lo mismo que una acción del Kanban. Explicarla no crea ni actualiza nada en el tablero.'
    case 'scrumban':
      return 'Scrumban junta el seguimiento de Scrum (qué importa ahora y qué se revisa) con el flujo de Kanban (qué está en curso, bloqueado o atrasado). En este tablero sirve para ver el trabajo y los objetivos sin cambiar de modo.'
    case 'kanban':
      return 'El Kanban de este tablero es la lista de acciones: responsable, fecha, estado y bloqueos. Una acción no es un OKR.'
    case 'team':
      return 'Cuando preguntas por el equipo, me refiero a las personas y acciones que tu rol puede ver. No es un OKR ni una tarea suelta.'
    default:
      return 'Puedo explicar qué es un OKR, un KR, una iniciativa, el Kanban o Scrumban. Dime el término y lo explico sin abrir tus datos.'
  }
}

export const INITIATIVE_LATENESS_LIMIT =
  'No marco iniciativas como atrasadas: esta consulta no trae fecha ni estado de atraso por iniciativa, y no infiero ese atraso desde las acciones del Kanban.'

export function proposalWithoutExecution(subject: string) {
  return `Propuesta, sin ejecutar: ${subject} No creé ni actualicé nada en el tablero.`
}

function explicitTopic(text: string): ConsultationTopic | null {
  if (/\bscrumban\b/.test(text)) return 'scrumban'
  if (/\biniciativa/.test(text)) return 'initiative'
  if (/\b(key results?|resultado clave|resultados clave|\bkrs?\b)\b/.test(text) && !/\b(okrs?|objetivo|objetivos)\b/.test(text)) {
    return 'kr'
  }
  if (/\b(okrs?|objetivo|objetivos)\b/.test(text)) return 'okr'
  if (/\bkanban\b/.test(text)) return 'kanban'
  if (/\b(acciones?|tareas?|pendientes?|compromisos?)\b/.test(text)) return 'kanban'
  if (/\b(equipo|responsables?)\b/.test(text)) return 'team'
  return null
}

function rawKind(text: string): ConsultationKind {
  if (isConceptualQuestion(text)) return 'concept'
  if (isWhoLags(text)) return 'data'
  // Un infinitivo de finalidad («para cerrar») no es una orden. El imperativo inicial sí.
  if (isMethodQuestion(text)) return 'recommendation'
  if (
    /\b(crea(r|me)?|genera(r|me)?|agrega(r|me)?|registra(r)?|anota(r)?|actualiza(r)?|marcar|cierra|cerrar|reprograma|propon(e|me|er)?)\b/.test(
      text
    )
  ) {
    return 'management'
  }
  if (
    /\b(prioriz|que deberiamos|que deberia|que debemos|que debo|que podemos hacer|que podriamos hacer|recomiend|para mejorarlo|para mejorarla|para mejorarlos)\b/.test(
      text
    )
  ) {
    return 'recommendation'
  }
  if (
    /\b(como vamos|como van|necesita mas atencion|necesitan mas atencion|que requiere atencion|que esta atrasado|rezagad)\b/.test(
      text
    )
  ) {
    return 'analysis'
  }
  if (/\b(cuales|que tenemos|nuestros|nuestras|tengo|lista|muestra|mis acciones|pendiente|abiert)\b/.test(text)) {
    return 'data'
  }
  return 'unknown'
}

function isLateAsk(text: string) {
  return /\b(atrasad\w*|retras\w*|vencid\w*|rezagad\w*)\b/.test(text)
}

function isFollowUp(text: string) {
  if (explicitTopic(text)) return false
  if (/\b(vencid|bloquead|en rojo|pendiente|tablero|asignad|acciones?|tareas?)\b/.test(text)) return false
  return (
    /\b(cuales tenemos|cuales hay|los que tenemos|actualmente|necesita mas atencion|necesitan atencion|para mejorarlo|para mejorarla|para mejorarlos|que podemos hacer)\b/.test(
      text
    ) || /^(y\s+)?(cuales|cual)\b/.test(text)
  )
}

function topicFromMessages(messages: string[] | undefined): ConsultationTopic | null {
  if (!messages?.length) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const topic = explicitTopic(normalizeConsultationText(messages[i] ?? ''))
    if (topic) return topic
  }
  return null
}

export function classifyConsultation(
  message: string,
  options: { priorTopic?: ConsultationTopic | null; priorUserMessages?: string[] } = {}
): ConsultationTurn {
  const text = normalizeConsultationText(message)
  if (!text) return { kind: 'unknown', topic: 'general', inheritedTopic: false }

  const prior =
    options.priorTopic && options.priorTopic !== 'general'
      ? options.priorTopic
      : topicFromMessages(options.priorUserMessages)
  const ownTopic = explicitTopic(text)
  const inheritedTopic = !ownTopic && Boolean(prior && prior !== 'general' && isFollowUp(text))
  const topic = ownTopic ?? (inheritedTopic ? prior! : 'general')
  let kind = rawKind(text)
  if (topic === 'initiative' && isLateAsk(text)) kind = 'analysis'
  return { kind, topic, inheritedTopic }
}

/** El turno se responde con el snapshot o con una explicación, sin llamar al modelo ni a tools. */
export function shouldAnswerConsultation(turn: ConsultationTurn, message: string): boolean {
  if (turn.kind === 'concept') {
    // Glosario local solo para términos del producto. BPMN/SIPOC/Lean/etc. van a Gemini.
    return turn.topic !== 'general'
  }
  if (turn.kind === 'management') return false
  if (isWhoLags(message) || isMethodQuestion(message)) return true
  const text = normalizeConsultationText(message)
  if ((turn.topic === 'okr' || turn.topic === 'kr') && (turn.kind === 'data' || turn.kind === 'analysis' || turn.kind === 'recommendation')) {
    return true
  }
  if (turn.topic === 'initiative' && turn.kind === 'analysis' && isLateAsk(text)) return true
  if (turn.kind === 'recommendation' && turn.topic !== 'initiative') return true
  if (turn.kind === 'data' && turn.topic === 'scrumban') return true
  return false
}
