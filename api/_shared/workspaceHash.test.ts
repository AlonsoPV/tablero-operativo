import { describe, expect, it } from 'vitest'
import { assertWorkspaceHash, hashWorkspacePayload, withContentHash } from './workspaceHash'

describe('workspace payload hash', () => {
  it('stays stable if key order changes', () => {
    expect(hashWorkspacePayload({ to: ['a@x.com'], subject: 'Hola' })).toBe(
      hashWorkspacePayload({ subject: 'Hola', to: ['a@x.com'] })
    )
  })

  it('changes when the body changes after approve', () => {
    const first = withContentHash({ subject: 'Hola', body: 'uno' })
    expect(() => assertWorkspaceHash(first)).not.toThrow()
    expect(() => assertWorkspaceHash({ ...first, body: 'dos' })).toThrow(/contenido cambi/i)
  })
})
