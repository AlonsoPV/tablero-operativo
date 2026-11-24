/**
 * Respuestas de conocimiento metodológico (no datos Kanban operativos).
 * Cita fuente local; no inventa procedimientos.
 */
import { findTermsInText } from '@/features/ai-support/operationalSemantics/operationalDictionary'

export type KnowledgeReply = {
  content: string
  source: string
  kind: 'policy' | 'glossary'
}

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Criterio Hecho vs Verificado (fuente: glosario + reglas de prompts locales). */
const VERIFY_CRITERION = {
  source: 'operationalDictionary:role_verificador + assistantPrompts (Hecho≠Verificado)',
  body: [
    'Criterio para verificar una accion (politica Scrumban local):',
    '1. Hecho y Verificado son estados distintos.',
    '2. Marcar Hecho no verifica la accion.',
    '3. Verificar solo lo hace quien tiene permiso (verificador_dato, verificador_gobierno, o el flujo de verificacion autorizado).',
    '4. La consulta de pendientes de verificacion usa acciones en estado Hecho (aun no Verificado).',
    '',
    'Esto es conocimiento metodologico, no un listado del tablero.',
  ].join('\n'),
}

/** Pedido documental/memoria R3: no responder con glosario local ni OKRs. */
export function looksLikeDocumentaryAsk(message: string): boolean {
  const t = normalize(message)
  if (!t) return false
  return (
    /\b(documentos?|documentacion)\b/.test(t) ||
    /\b(en la memoria|busca(?:r)? (?:en )?(?:la )?memoria)\b/.test(t) ||
    /\bpoliticas? (oficiales?|de la (empresa|organizacion))\b/.test(t) ||
    /\bprocedimientos? (oficiales?|de la (empresa|organizacion))\b/.test(t)
  )
}

export function looksLikeKnowledgeQuestion(message: string): boolean {
  const t = normalize(message)
  if (!t) return false
  if (
    /criterio|como se|que significa|diferencia entre|politica|regla|glosario|definicion|cual es/.test(t) &&
    /\b(verific\w*|hecho|estado|accion|kanban|okr|prioridad|responsable)\b/.test(t)
  ) {
    return true
  }
  if (
    /verific(ar|acion)|hecho y verificado|diferencia.*(hecho|verific)/.test(t) &&
    /criterio|como|que es|cual es|significa/.test(t)
  ) {
    return true
  }
  return false
}

export function tryKnowledgeReply(message: string): KnowledgeReply | null {
  if (looksLikeDocumentaryAsk(message)) return null
  if (!looksLikeKnowledgeQuestion(message)) return null
  const t = normalize(message)

  if (/\b(verific\w*|hecho)\b/.test(t)) {
    const terms = findTermsInText(t)
    const verifier = terms.find((term) => term.id === 'role_verificador')
    return {
      kind: 'policy',
      source: VERIFY_CRITERION.source,
      content: [
        VERIFY_CRITERION.body,
        verifier
          ? `\nGlosario: ${verifier.businessName} — ${verifier.definition}`
          : '',
        `\nFuente: ${VERIFY_CRITERION.source}`,
      ]
        .filter(Boolean)
        .join(''),
    }
  }

  const terms = findTermsInText(t)
  if (terms.length === 1) {
    const term = terms[0]!
    return {
      kind: 'glossary',
      source: `operationalDictionary:${term.id}`,
      content: [
        `${term.businessName}: ${term.definition}`,
        term.interpretRules?.length ? `Reglas: ${term.interpretRules.join(' ')}` : '',
        `\nFuente: operationalDictionary:${term.id}`,
        '\n(Conocimiento metodologico; no consulta datos operativos del tablero.)',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }

  return null
}
