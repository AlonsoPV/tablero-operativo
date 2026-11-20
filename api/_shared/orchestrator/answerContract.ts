/**
 * Contrato tipado de la respuesta del agente, independiente del formato y del canal.
 * Los handlers lo construyen una sola vez, con los datos ya autorizados y consultados;
 * Directo, Reporte y Análisis sólo cambian cómo se presenta (renderFormat.ts).
 */

import type { ResolvedFormat } from '../../../src/features/ai-support/responseFormat.js'

export {
  coerceResponseFormat,
  DEFAULT_RESPONSE_FORMAT,
  FORMAT_LABEL,
  isResponseFormat,
  RESPONSE_FORMATS,
  type ResolvedFormat,
  type ResponseFormat,
} from '../../../src/features/ai-support/responseFormat.js'

/** Distingue lo medido de lo supuesto: nunca se presenta una inferencia como dato. */
export type FindingBasis = 'evidence' | 'inference' | 'hypothesis'

export type AnswerTone = 'neutral' | 'ok' | 'warning' | 'danger'

export type AnswerMetric = {
  id: string
  label: string
  value: number | string
  tone?: AnswerTone
  scope?: string
}

export type AnswerItem =
  | {
      kind: 'action'
      id: string
      title: string
      status: string | null
      date: string | null
      owner: string | null
      priority: string | null
      flags: string[]
      href: string
    }
  | {
      kind: 'okr'
      id: string
      title: string
      /** null = sin avance calculable; nunca se sustituye por 0. */
      progress: number | null
      withoutInitiatives: boolean
      insufficientKrs: number
      krCount: number
      href: string
    }
  | { kind: 'group'; id: string; title: string; count: number }

export type AnswerFinding = {
  text: string
  basis: FindingBasis
  /** Señal de riesgo (se agrupa en «Riesgos» del Reporte). */
  risk?: boolean
}

export type AnswerPrimary = { text: string; value?: number | string }

export type AnswerFacts = {
  /** Cifra o dato principal ya redactado, en una sola oración. */
  primary: AnswerPrimary | null
  metrics: AnswerMetric[]
  items: AnswerItem[]
  findings: AnswerFinding[]
  recommendations: string[]
  /** Subconjunto de limitaciones que Directo nunca omite. */
  warnings: string[]
  limitations: string[]
}

export function emptyFacts(): AnswerFacts {
  return { primary: null, metrics: [], items: [], findings: [], recommendations: [], warnings: [], limitations: [] }
}

/** Resultado de la regla automática y si la selección fue ambigua (se ofrece profundizar). */
export type FormatResolution = { format: ResolvedFormat; ambiguous: boolean }
