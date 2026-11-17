import { describe, expect, it } from 'vitest'
import {
  GUIDE_WORK_INTENT_OPTIONS,
  guideWorkIntentHint,
  isGuideCreateLikeIntent,
  normalizeGuideWorkIntent,
} from './guideWorkIntent'

describe('guideWorkIntent', () => {
  it('exposes four session options', () => {
    expect(GUIDE_WORK_INTENT_OPTIONS.map((item) => item.id)).toEqual([
      'consult',
      'action',
      'whatsapp',
      'email',
    ])
  })

  it('normalizes aliases', () => {
    expect(normalizeGuideWorkIntent('create')).toBe('action')
    expect(normalizeGuideWorkIntent('wa')).toBe('whatsapp')
    expect(normalizeGuideWorkIntent('correo')).toBe('email')
  })

  it('marks create-like intents', () => {
    expect(isGuideCreateLikeIntent('action')).toBe(true)
    expect(isGuideCreateLikeIntent('whatsapp')).toBe(true)
    expect(isGuideCreateLikeIntent('consult')).toBe(false)
  })

  it('returns useful hints', () => {
    expect(guideWorkIntentHint('whatsapp', 'idle')).toMatch(/WhatsApp/i)
    expect(guideWorkIntentHint('email', 'locked')).toMatch(/Correo/i)
  })
})
