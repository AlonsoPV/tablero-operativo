import { createHash } from 'node:crypto'
import { canonicalWorkspacePayload } from '../../src/features/ai-support/copilot/googleWorkspace.js'

export function hashWorkspacePayload(payload: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalWorkspacePayload(payload)).digest('hex')
}

export function withContentHash(payload: Record<string, unknown>): Record<string, unknown> {
  const { content_hash: _ignored, ...rest } = payload
  return { ...rest, content_hash: hashWorkspacePayload(rest) }
}

export function assertWorkspaceHash(payload: Record<string, unknown>) {
  const stored = typeof payload.content_hash === 'string' ? payload.content_hash : ''
  const { content_hash: _ignored, ...rest } = payload
  const expected = hashWorkspacePayload(rest)
  if (!stored || stored !== expected) {
    throw new Error('El contenido cambió después de la vista previa. Revisa y confirma de nuevo.')
  }
}
