import type { GuideMood } from '@/features/guide/components/GuidePresence'
import type { R4LinkRecord, R4SessionPhase } from '../../../api/_shared/r4/sessionTypes'

export type R4LabScenario =
  | 'active'
  | 'expired'
  | 'revoked'
  | 'invalid_grant'
  | 'public_confirm'
  | 'foreign'

export const R4_LAB_SCENARIOS: Array<{ id: R4LabScenario; label: string }> = [
  { id: 'active', label: 'Liga vigente (dueno autenticado)' },
  { id: 'expired', label: 'Liga expirada' },
  { id: 'revoked', label: 'Liga revocada' },
  { id: 'invalid_grant', label: 'Grant invalido' },
  { id: 'public_confirm', label: 'Confirmacion publica' },
  { id: 'foreign', label: 'Sesion ajena' },
]

export function linkRecordForScenario(scenario: R4LabScenario): R4LinkRecord {
  const base: R4LinkRecord = {
    linkId: 'lab-link',
    ownerUsuarioId: 'u-owner',
    status: 'active',
    expiresAt: '2099-01-01T00:00:00.000Z',
    grantValid: true,
  }
  if (scenario === 'expired') {
    return { ...base, status: 'expired', expiresAt: '2000-01-01T00:00:00.000Z' }
  }
  if (scenario === 'revoked') return { ...base, status: 'revoked' }
  if (scenario === 'invalid_grant') return { ...base, grantValid: false }
  return base
}

export function sessionAuthForScenario(scenario: R4LabScenario) {
  return {
    authenticated: scenario !== 'public_confirm',
    publicConfirmAttempt: scenario === 'public_confirm',
    requesterUsuarioId: scenario === 'foreign' ? 'u-other' : 'u-owner',
  }
}

export function moodFromPhase(phase: R4SessionPhase): GuideMood {
  switch (phase) {
    case 'connecting':
      return 'connecting'
    case 'listening':
      return 'listening'
    case 'speaking':
      return 'speaking'
    case 'paused':
    case 'denied':
    case 'error':
      return 'muted'
    case 'recovering':
      return 'thinking'
    default:
      return 'idle'
  }
}
