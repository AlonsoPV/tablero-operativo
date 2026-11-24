import { describe, expect, it } from 'vitest'
import {
  isUserInWhatsAppPilot,
  isWhatsAppVoiceNotesAllowedForUser,
  shouldUseWhatsAppOrchestrator,
} from './whatsappPilotGate.js'

describe('WhatsApp Selective Single-User Pilot Gate (Existing Infra Reuse)', () => {
  const pilotUser = { usuarioId: '11111111-2222-4333-8444-555555550001', waId: '5215512345678' }
  const otherUser = { usuarioId: '11111111-2222-4333-8444-555555550002', waId: '5215599999999' }

  it('isolates orchestrator and voice notes to the single authorized pilot user while preserving legacy for everyone else', () => {
    const env = {
      WHATSAPP_PILOT_ENABLED: '1',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: '5215512345678',
      AGENT_ORCHESTRATOR_R1: '0',
    }
    expect(isUserInWhatsAppPilot(pilotUser, env)).toBe(true)
    expect(isUserInWhatsAppPilot(otherUser, env)).toBe(false)

    expect(shouldUseWhatsAppOrchestrator(pilotUser, env)).toBe(true)
    expect(shouldUseWhatsAppOrchestrator(otherUser, env)).toBe(false)

    expect(isWhatsAppVoiceNotesAllowedForUser(pilotUser, env)).toBe(true)
    expect(isWhatsAppVoiceNotesAllowedForUser(otherUser, env)).toBe(false)
  })

  it('supports matching pilot user by usuarioId UUID and rolls back immediately when pilot flag is OFF', () => {
    const enabledByUuid = {
      WHATSAPP_PILOT_ENABLED: '1',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: pilotUser.usuarioId,
    }
    expect(shouldUseWhatsAppOrchestrator(pilotUser, enabledByUuid)).toBe(true)
    expect(shouldUseWhatsAppOrchestrator(otherUser, enabledByUuid)).toBe(false)

    const rolledBack = {
      WHATSAPP_PILOT_ENABLED: '0',
      AGENT_ORCHESTRATOR_R1: '0',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: pilotUser.usuarioId,
    }
    expect(shouldUseWhatsAppOrchestrator(pilotUser, rolledBack)).toBe(false)
  })

  it('preserves global AGENT_ORCHESTRATOR_R1 behavior when pilot allowlist is empty', () => {
    expect(shouldUseWhatsAppOrchestrator(otherUser, { AGENT_ORCHESTRATOR_R1: '1' })).toBe(true)
    expect(shouldUseWhatsAppOrchestrator(otherUser, { AGENT_ORCHESTRATOR_R1: '0' })).toBe(false)
    expect(isWhatsAppVoiceNotesAllowedForUser(otherUser, { WHATSAPP_VOICE_NOTES_ENABLED: '0' })).toBe(false)
  })
})
