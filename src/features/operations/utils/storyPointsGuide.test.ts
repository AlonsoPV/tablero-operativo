import { describe, expect, it } from 'vitest'
import { getStoryPointGuide, isStoryPointGuideValue } from './storyPointsGuide'

describe('storyPointsGuide', () => {
  it('reconoce valores Fibonacci validos', () => {
    expect(isStoryPointGuideValue(1)).toBe(true)
    expect(isStoryPointGuideValue(13)).toBe(true)
    expect(isStoryPointGuideValue(0)).toBe(false)
    expect(isStoryPointGuideValue(4)).toBe(false)
  })

  it('devuelve guia con titulo y descripcion', () => {
    const guide = getStoryPointGuide(5)
    expect(guide).not.toBeNull()
    expect(guide?.title).toBe('Alto esfuerzo')
    expect(guide?.description).toContain('varios días')
  })

  it('no devuelve guia para 0 u otros valores', () => {
    expect(getStoryPointGuide(0)).toBeNull()
    expect(getStoryPointGuide(7)).toBeNull()
  })
})
