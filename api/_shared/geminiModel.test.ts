import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEMINI_MODEL,
  geminiModelCandidates,
  isGeminiCapacityStatus,
  normalizeGeminiModel,
} from './geminiModel'

describe('normalizeGeminiModel', () => {
  it('keeps API ids', () => {
    expect(normalizeGeminiModel('gemini-3.1-flash-lite')).toBe('gemini-3.1-flash-lite')
    expect(normalizeGeminiModel('models/gemini-2.5-flash-lite')).toBe('gemini-2.5-flash-lite')
  })

  it('slugifies UI display names', () => {
    expect(normalizeGeminiModel('Gemini 3.1 Flash Lite')).toBe('gemini-3.1-flash-lite')
  })

  it('falls back when empty', () => {
    expect(normalizeGeminiModel('')).toBe(DEFAULT_GEMINI_MODEL)
  })
})

describe('geminiModelCandidates', () => {
  it('puts preferred model first and keeps unique fallbacks', () => {
    expect(geminiModelCandidates('gemini-3.1-flash-lite')[0]).toBe('gemini-3.1-flash-lite')
    expect(geminiModelCandidates('gemini-3.1-flash-lite')).toContain('gemini-2.5-flash')
    expect(new Set(geminiModelCandidates('Gemini 3.1 Flash Lite')).size).toBe(
      geminiModelCandidates('Gemini 3.1 Flash Lite').length,
    )
  })
})

describe('isGeminiCapacityStatus', () => {
  it('detects capacity statuses', () => {
    expect(isGeminiCapacityStatus(503)).toBe(true)
    expect(isGeminiCapacityStatus(429)).toBe(true)
    expect(isGeminiCapacityStatus(400)).toBe(false)
  })
})
