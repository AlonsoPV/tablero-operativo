import { describe, expect, it } from 'vitest'
import {
  isCriticalVerifiedRisk,
  pdfToneForSectionKind,
  toneForCommitment,
  toneForDecision,
  toneForEvidence,
  toneForRisk,
} from './reportVisualTheme'

describe('reportVisualTheme semantics', () => {
  it('maps evidence kinds to distinct tones', () => {
    expect(toneForEvidence('verified')).toBe('green')
    expect(toneForEvidence('said')).toBe('blue')
    expect(toneForEvidence('hypothesis')).toBe('amber')
    expect(toneForEvidence('recommendation')).toBe('violet')
  })

  it('uses green for confirmed decisions and amber for pending', () => {
    expect(toneForDecision('confirmed')).toBe('green')
    expect(toneForDecision('pending')).toBe('amber')
    expect(toneForDecision('recommendation')).toBe('violet')
  })

  it('assigns red only to verified critical risks', () => {
    expect(toneForRisk('Bloqueo critico en planta', { evidence: 'verified' })).toBe('red')
    expect(isCriticalVerifiedRisk('Bloqueo critico en planta', 'verified')).toBe(true)
    expect(toneForRisk('Bloqueo critico en planta', { evidence: 'said' })).toBe('coral')
    expect(toneForRisk('Retraso en evidencias')).toBe('coral')
    expect(toneForRisk('Oportunidad de mejora', { isOpportunityBlock: true })).toBe('teal')
    expect(toneForRisk('Revisar el corte semanal')).toBe('amber')
  })

  it('maps commitment and PDF section kinds', () => {
    expect(toneForCommitment('confirmed')).toBe('green')
    expect(toneForCommitment('proposal')).toBe('violet')
    expect(toneForCommitment('pending')).toBe('amber')
    expect(pdfToneForSectionKind('lead')).toBe('navy')
    expect(pdfToneForSectionKind('finding')).toBe('blue')
    expect(pdfToneForSectionKind('metric')).toBe('teal')
    expect(pdfToneForSectionKind('ai')).toBe('violet')
    expect(pdfToneForSectionKind('risk')).toBe('coral')
  })
})
