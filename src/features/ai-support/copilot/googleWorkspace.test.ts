import { describe, expect, it } from 'vitest'
import {
  canonicalWorkspacePayload,
  cdmxYmdFromInstant,
  emailsFromUnknown,
  googleScopeLabels,
  GOOGLE_SCOPES,
  isGoogleReadTool,
  isGoogleWriteTool,
} from './googleWorkspace'

describe('google workspace helpers', () => {
  it('classifies read and write tools', () => {
    expect(isGoogleReadTool('gmail_search')).toBe(true)
    expect(isGoogleWriteTool('gmail_prepare_send')).toBe(true)
    expect(isGoogleWriteTool('create_action')).toBe(false)
  })

  it('labels granted scopes', () => {
    expect(
      googleScopeLabels([GOOGLE_SCOPES.gmailReadonly, GOOGLE_SCOPES.calendarEvents])
    ).toEqual(['Leer Gmail', 'Eventos de Calendar'])
  })

  it('canonicalizes payload without the hash field', () => {
    const a = canonicalWorkspacePayload({ b: 1, a: 2, content_hash: 'x' })
    const b = canonicalWorkspacePayload({ a: 2, b: 1 })
    expect(a).toBe(b)
  })

  it('extracts emails and ignores invented names', () => {
    expect(emailsFromUnknown('Ana <ana@empresa.com>, x')).toEqual(['ana@empresa.com'])
    expect(emailsFromUnknown('Juan Perez')).toEqual([])
  })

  it('uses CDMX calendar date from an instant', () => {
    // 2026-11-10 06:30 UTC is still 2026-11-10 in CDMX (UTC-6)
    expect(cdmxYmdFromInstant('2026-11-10T12:00:00-06:00')).toBe('2026-11-10')
  })
})
