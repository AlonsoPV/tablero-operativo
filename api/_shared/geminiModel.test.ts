import { describe, expect, it } from 'vitest'
import { DEFAULT_GEMINI_MODEL, normalizeGeminiModel } from './geminiModel'

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
