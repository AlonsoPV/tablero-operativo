import type { AssistantAudioResult } from '@/lib/assistantAudioClient'
import {
  formatDueHint,
  formatWorkDateLabel,
  mergeWorkFacts,
  parseDueDateHint,
  rewriteDatesInText,
  type WorkFacts,
} from './parseWorkFacts'

function applyFactsToHint(currentHint: string | null, facts: WorkFacts, todayYmd: string) {
  const current = parseDueDateHint(currentHint, todayYmd)
  return formatDueHint({
    dateYmd: facts.dateYmd || current.dateYmd,
    timeHm: facts.timeHm || current.timeHm,
  })
}

export function groundActionDrafts(
  result: AssistantAudioResult,
  sourceText: string,
  correctionText: string,
  todayYmd: string
): AssistantAudioResult {
  const facts = mergeWorkFacts(correctionText, sourceText, todayYmd)
  const drafts = result.actionDrafts.map((draft) => {
    const previous = parseDueDateHint(draft.dueDateHint, todayYmd)
    const dueDateHint = applyFactsToHint(draft.dueDateHint, facts, todayYmd)
    const next = parseDueDateHint(dueDateHint, todayYmd)
    const toYmd = next.dateYmd
    if (!toYmd) return { ...draft, dueDateHint }
    return {
      ...draft,
      dueDateHint,
      description: rewriteDatesInText(draft.description, previous.dateYmd, toYmd),
      objective: rewriteDatesInText(draft.objective, previous.dateYmd, toYmd),
    }
  })

  const missingPoints = result.validation.missingPoints.filter((item) => {
    if (facts.dateYmd && /fecha|plazo|entrega|compromiso/i.test(item)) return false
    return true
  })

  return {
    ...result,
    transcript: result.transcript || sourceText,
    validation: {
      ...result.validation,
      missingPoints,
    },
    actionDrafts: drafts,
  }
}

export function buildVoiceValidationSpeech(transcript: string, result: AssistantAudioResult) {
  const draft = result.actionDrafts[0]
  if (!draft) {
    return `Te escuche: ${transcript}. No arme propuesta. Corrige o vuelve a dictar.`
  }
  const date = draft.dueDateHint
    ? ` Fecha: ${formatWorkDateLabel(draft.dueDateHint)}.`
    : ' Sin fecha; confirmala.'
  return `Te escuche: ${transcript}. Propuesta: ${draft.title}.${date} Si esta bien, aprueba. Si no, corrige.`
}
