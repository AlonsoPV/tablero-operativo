import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { resolveAccessCapabilities } from '../../../src/features/auth/lib/permissions.js'
import {
  canonicalCapabilityPayload,
  capabilityFingerprint,
} from './actorCapabilities.js'

describe('capabilityFingerprint', () => {
  const lider = resolveAccessCapabilities({ rol: 'Lider', active: true })
  const direccion = resolveAccessCapabilities({ rol: 'Direccion', active: true })
  const okrs = resolveAccessCapabilities({ rol: 'Analista', area: 'OKRS', active: true })
  const superAdmin = resolveAccessCapabilities({ rol: 'super_admin', active: true })

  it('es SHA-256 hex de las capacidades canonizadas y cabe en 128 caracteres', () => {
    const fp = capabilityFingerprint(superAdmin)
    expect(fp).toMatch(/^[a-f0-9]{64}$/)
    expect(fp.length).toBeLessThanOrEqual(128)
    expect(fp).toBe(createHash('sha256').update(canonicalCapabilityPayload(superAdmin), 'utf8').digest('hex'))
    expect(fp).not.toContain('superAdmin')
  })

  it('cambia cuando cambian permisos (rol, área OKRS) y es estable si no cambian', () => {
    expect(capabilityFingerprint(superAdmin)).not.toBe(capabilityFingerprint(direccion))
    expect(capabilityFingerprint(okrs)).not.toBe(capabilityFingerprint(lider))
    expect(capabilityFingerprint(superAdmin)).toBe(capabilityFingerprint(superAdmin))
    const inactive = resolveAccessCapabilities({ rol: 'super_admin', active: false })
    expect(capabilityFingerprint(inactive)).not.toBe(capabilityFingerprint(superAdmin))
  })

  it('incluye capacidades en false: Super Admin y Dirección no colisionan con una lista de trues', () => {
    expect(canonicalCapabilityPayload(lider)).toContain('okrsArea:0')
    expect(canonicalCapabilityPayload(okrs)).toContain('okrsArea:1')
    expect(canonicalCapabilityPayload(superAdmin).split('|')).toHaveLength(14)
  })
})
