import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GEMINI_MODEL,
  geminiModelCandidates,
  isGeminiCapacityStatus,
  normalizeGeminiModel,
  withGeminiCapacityRetry,
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

describe('withGeminiCapacityRetry', () => {
  it('retries a 503 once and does not retry other errors', async () => {
    const sleeps: number[] = []
    let calls = 0
    const result = await withGeminiCapacityRetry(
      async () => {
        calls += 1
        if (calls === 1) throw Object.assign(new Error('busy'), { status: 503 })
        return 'ok'
      },
      { retryMs: 1, sleep: async (ms) => { sleeps.push(ms) } }
    )
    expect(result).toBe('ok')
    expect(calls).toBe(2)
    expect(sleeps).toEqual([1])

    await expect(
      withGeminiCapacityRetry(async () => {
        throw Object.assign(new Error('bad'), { status: 400 })
      })
    ).rejects.toThrow('bad')
  })
})
