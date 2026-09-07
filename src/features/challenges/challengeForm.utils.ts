import type {
  ChallengeAudienceType,
  ChallengeCreateInput,
  ChallengeImpactType,
  ChallengeListItem,
  ChallengeUpdateInput,
} from './types'

export type ChallengeFormValues = {
  title: string
  context: string
  question: string
  impacts: ChallengeImpactType[]
  other_impact: string
  area_id: string | null
  strategic_pillar_id: string | null
  audience_type: ChallengeAudienceType
  audience_area_id: string | null
  audience_area_ids: string[]
  success_criteria: string
  proposed_start_date: string
  proposed_end_date: string
  start_date: string
  end_date: string
  result_summary: string
}

export type ChallengeFormValidationResult =
  | { ok: true }
  | { ok: false; message: string }

export function buildChallengeDescription(context: string, question: string) {
  const ctx = context.trim()
  const q = question.trim()
  if (ctx && q) return `${ctx}\n\n${q}`
  return ctx || q
}

export type ChallengeFormStep = 0 | 1 | 2 | 3

export function validateChallengeFormStep(
  values: ChallengeFormValues,
  step: ChallengeFormStep,
  options?: { adminMode?: boolean }
): ChallengeFormValidationResult {
  const title = values.title.trim()
  const context = values.context.trim()
  const question = values.question.trim()
  const otherImpact = values.other_impact.trim()
  const startDate = values.proposed_start_date || values.start_date
  const endDate = values.proposed_end_date || values.end_date

  if (step === 0) {
    if (title.length < 5) return { ok: false, message: 'Agrega un título de al menos 5 caracteres.' }
    if (title.length > 120) return { ok: false, message: 'El título debe tener máximo 120 caracteres.' }
    if (context.length < 10) return { ok: false, message: 'Agrega contexto suficiente (mínimo 10 caracteres).' }
    if (question.length < 10) return { ok: false, message: 'Formula la pregunta del challenge (mínimo 10 caracteres).' }
    return { ok: true }
  }

  if (step === 1) {
    if (values.impacts.length === 0) {
      return { ok: false, message: 'Selecciona al menos un impacto esperado.' }
    }
    if (values.impacts.includes('other') && otherImpact.length < 2) {
      return { ok: false, message: 'Especifica el impacto cuando seleccionas Otro.' }
    }
    return { ok: true }
  }

  if (step === 2) {
    if (values.audience_type === 'single_area' && !values.audience_area_id) {
      return { ok: false, message: 'Selecciona el área de la audiencia.' }
    }
    if (values.audience_type === 'multiple_areas' && values.audience_area_ids.length < 2) {
      return { ok: false, message: 'Selecciona al menos dos áreas para la audiencia.' }
    }
    if (!options?.adminMode && (!startDate || !endDate)) {
      return { ok: false, message: 'Agrega el periodo del Challenge: inicio y cierre.' }
    }
    const success = values.success_criteria.trim()
    if (success && success.length < 5) {
      return { ok: false, message: 'El criterio de éxito debe ser más descriptivo.' }
    }
    return { ok: true }
  }

  return { ok: true }
}

export function validateChallengeForm(
  values: ChallengeFormValues
): ChallengeFormValidationResult {
  for (const step of [0, 1, 2] as ChallengeFormStep[]) {
    const result = validateChallengeFormStep(values, step)
    if (!result.ok) return result
  }
  return { ok: true }
}

export function toChallengeCreatePayload(
  values: ChallengeFormValues,
  createdBy: string
): ChallengeCreateInput {
  const description = buildChallengeDescription(values.context, values.question)
  return {
    title: values.title.trim(),
    context: values.context.trim(),
    question: values.question.trim(),
    description,
    created_by: createdBy,
    area_id: values.area_id,
    strategic_pillar_id: values.strategic_pillar_id,
    success_criteria: values.success_criteria.trim() || null,
    audience_type: values.audience_type,
    audience_area_id:
      values.audience_type === 'single_area' ? values.audience_area_id : null,
    audience_area_ids:
      values.audience_type === 'multiple_areas' ? values.audience_area_ids : [],
    impacts: values.impacts,
    other_impact: values.impacts.includes('other') ? values.other_impact.trim() : null,
    proposed_start_date: values.proposed_start_date || null,
    proposed_end_date: values.proposed_end_date || null,
  }
}

export function toChallengeUpdatePayload(
  values: ChallengeFormValues,
  options?: { adminMode?: boolean }
): ChallengeUpdateInput {
  const description = buildChallengeDescription(values.context, values.question)
  const payload: ChallengeUpdateInput = {
    title: values.title.trim(),
    context: values.context.trim(),
    question: values.question.trim(),
    description,
    area_id: values.area_id,
    strategic_pillar_id: values.strategic_pillar_id,
    success_criteria: values.success_criteria.trim() || null,
    audience_type: values.audience_type,
    audience_area_id:
      values.audience_type === 'single_area' ? values.audience_area_id : null,
    audience_area_ids:
      values.audience_type === 'multiple_areas' ? values.audience_area_ids : [],
    impacts: values.impacts,
    other_impact: values.impacts.includes('other') ? values.other_impact.trim() : null,
    proposed_start_date: values.proposed_start_date || null,
    proposed_end_date: values.proposed_end_date || null,
  }
  if (options?.adminMode) {
    payload.start_date = values.start_date || null
    payload.end_date = values.end_date || null
    payload.result_summary = values.result_summary.trim() || null
  }
  return payload
}

export function challengeToFormValues(challenge?: ChallengeListItem | null): ChallengeFormValues {
  if (!challenge) {
    return {
      title: '',
      context: '',
      question: '',
      impacts: [],
      other_impact: '',
      area_id: null,
      strategic_pillar_id: null,
      audience_type: 'organization',
      audience_area_id: null,
      audience_area_ids: [],
      success_criteria: '',
      proposed_start_date: '',
      proposed_end_date: '',
      start_date: '',
      end_date: '',
      result_summary: '',
    }
  }

  const context = challenge.context?.trim() || challenge.description?.trim() || ''
  const question = challenge.question?.trim() || ''

  return {
    title: challenge.title ?? '',
    context,
    question,
    impacts: challenge.impacts ?? [],
    other_impact: challenge.other_impact ?? '',
    area_id: challenge.area_id,
    strategic_pillar_id: challenge.strategic_pillar_id,
    audience_type: challenge.audience_type ?? 'organization',
    audience_area_id: challenge.audience_area_id,
    audience_area_ids: challenge.audience_area_ids ?? [],
    success_criteria: challenge.success_criteria ?? '',
    proposed_start_date: challenge.proposed_start_date ?? '',
    proposed_end_date: challenge.proposed_end_date ?? '',
    start_date: challenge.start_date ?? '',
    end_date: challenge.end_date ?? '',
    result_summary: challenge.result_summary ?? '',
  }
}

export const EMPTY_CHALLENGE_FORM = challengeToFormValues(null)

export function audienceSummaryLabel(input: {
  audience_type: ChallengeAudienceType
  audience_area_id?: string | null
  audience_area_ids?: string[]
  areaNames: Record<string, string>
}): string {
  if (input.audience_type === 'organization') return 'Toda la organización'
  if (input.audience_type === 'single_area' && input.audience_area_id) {
    return input.areaNames[input.audience_area_id] ?? 'Área específica'
  }
  if (input.audience_type === 'multiple_areas') {
    const names = (input.audience_area_ids ?? [])
      .map((id) => input.areaNames[id])
      .filter(Boolean)
    return names.length > 0 ? names.join(' · ') : 'Varias áreas'
  }
  return 'Sin definir'
}
