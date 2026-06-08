import { STORY_POINTS_OPTIONS } from './tipoAccionConfig'

export type StoryPointValue = (typeof STORY_POINTS_OPTIONS)[number]

export type StoryPointGuideTone = 'low' | 'moderate' | 'high' | 'veryHigh' | 'maximum'

export type StoryPointGuideEntry = {
  points: StoryPointValue
  icon: string
  title: string
  description: string
  tone: StoryPointGuideTone
}

/** Textos de ayuda contextual por valor Fibonacci. Editar aquí para ajustar copy futuro. */
export const STORY_POINTS_GUIDE: Record<StoryPointValue, StoryPointGuideEntry> = {
  1: {
    points: 1,
    icon: '🟢',
    title: 'Muy bajo esfuerzo',
    description: 'Actividad simple, rápida y con pocas dependencias.',
    tone: 'low',
  },
  2: {
    points: 2,
    icon: '🟢',
    title: 'Bajo esfuerzo',
    description: 'Actividad sencilla que requiere algo de coordinación o tiempo adicional.',
    tone: 'low',
  },
  3: {
    points: 3,
    icon: '🟡',
    title: 'Esfuerzo moderado',
    description: 'Actividad que puede tomar medio día de trabajo o requerir varias tareas relacionadas.',
    tone: 'moderate',
  },
  5: {
    points: 5,
    icon: '🟠',
    title: 'Alto esfuerzo',
    description:
      'Actividad importante que puede requerir varios días, validaciones o coordinación con otras personas.',
    tone: 'high',
  },
  8: {
    points: 8,
    icon: '🔴',
    title: 'Muy alto esfuerzo',
    description: 'Actividad compleja con dependencias, incertidumbre o participación de varias personas.',
    tone: 'veryHigh',
  },
  13: {
    points: 13,
    icon: '🔥',
    title: 'Máximo esfuerzo',
    description:
      'Iniciativa compleja o estratégica que requiere planificación, múltiples actividades y seguimiento constante.',
    tone: 'maximum',
  },
}

export function isStoryPointGuideValue(points: number): points is StoryPointValue {
  return (STORY_POINTS_OPTIONS as readonly number[]).includes(points)
}

export function getStoryPointGuide(points: number): StoryPointGuideEntry | null {
  if (!isStoryPointGuideValue(points)) return null
  return STORY_POINTS_GUIDE[points]
}
