import type { AssistantAudioResult } from '@/lib/assistantAudioClient'
import { formatWorkDateLabel } from './parseWorkFacts'

export function buildCreateApprovalMessage(result: AssistantAudioResult): string {
  const drafts = result.actionDrafts
  const missing = result.validation.missingPoints.map((item) => item.trim()).filter(Boolean)
  const questions = result.validation.clarificationQuestions
    .map((item) => item.trim())
    .filter(Boolean)

  if (drafts.length === 0) {
    const ask = questions[0] || missing[0]
    if (ask) return `Aun no hay propuesta para aprobar. ${ask}`
    return (
      result.validation.summary ||
      result.interpretation.executiveSummary ||
      'Dime el resultado que quieres lograr y te armo la accion para aprobarla.'
    )
  }

  const titles = drafts.map((draft) => draft.title).join('; ')
  const date = drafts[0]?.dueDateHint ? formatWorkDateLabel(drafts[0].dueDateHint) : ''
  const head =
    drafts.length === 1
      ? `Propuesta lista para aprobar: ${titles}.`
      : `Propuestas listas para aprobar: ${titles}.`
  const dateLine = date ? ` Fecha: ${date}.` : ''

  if (missing.length > 0) {
    return `${head}${dateLine} Valida o completa: ${missing.join('; ')}.`
  }
  if (questions.length > 0) {
    return `${head}${dateLine} Valida: ${questions.slice(0, 2).join(' ')}`
  }
  return `${head}${dateLine} Si esta bien, apruebala. Si no, corrige el dato (por ejemplo la fecha).`
}
