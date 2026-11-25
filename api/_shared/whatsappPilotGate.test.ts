import { describe, expect, it } from 'vitest'
import {
  isUserInWhatsAppPilot,
  isWhatsAppR2ButtonsAllowedForUser,
  isWhatsAppVoiceNotesAllowedForUser,
  resolveWhatsAppFlowAccess,
  shouldUseWhatsAppOrchestrator,
  type WhatsAppPilotIdentity,
} from './whatsappPilotGate.js'

describe('WhatsApp Selective Single-User Pilot Gate — Fail-Closed Closure Suite', () => {
  const pilotUser: WhatsAppPilotIdentity = {
    usuarioId: '11111111-2222-4333-8444-555555550001',
    waId: '5215512345678',
    active: true,
    aiAuthorized: true,
  }
  const otherUser: WhatsAppPilotIdentity = {
    usuarioId: '11111111-2222-4333-8444-555555550002',
    waId: '5215599999999',
    active: true,
    aiAuthorized: true,
  }

  it('denies access when pilot is enabled without authorized users (empty list never widens access)', () => {
    const env = {
      WHATSAPP_PILOT_ENABLED: '1',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: '',
      WHATSAPP_VOICE_NOTES_ENABLED: '1',
      AGENT_ORCHESTRATOR_R1: '1',
      WHATSAPP_GLOBAL_ORCHESTRATOR_ENABLED: '1',
    }
    expect(resolveWhatsAppFlowAccess(pilotUser, env)).toEqual({
      allowed: false,
      mode: 'legacy',
      reason: 'pilot_enabled_without_authorized_users',
    })
    expect(shouldUseWhatsAppOrchestrator(pilotUser, env)).toBe(false)
    expect(isWhatsAppVoiceNotesAllowedForUser(pilotUser, env)).toBe(false)
    expect(isWhatsAppR2ButtonsAllowedForUser(pilotUser, env)).toBe(false)
  })

  it('rejects wildcard/garbage allowlist entries instead of failing open', () => {
    const env = {
      WHATSAPP_PILOT_ENABLED: '1',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: '*, all, 123, not-a-uuid',
      WHATSAPP_VOICE_NOTES_ENABLED: '1',
    }
    expect(shouldUseWhatsAppOrchestrator(pilotUser, env)).toBe(false)
    expect(isWhatsAppVoiceNotesAllowedForUser(pilotUser, env)).toBe(false)
  })

  it('denies invalid identity, inactive user, and user without WhatsApp AI permission', () => {
    const env = {
      WHATSAPP_PILOT_ENABLED: '1',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: `${pilotUser.usuarioId},${pilotUser.waId}`,
      WHATSAPP_VOICE_NOTES_ENABLED: '1',
    }
    const invalidId: WhatsAppPilotIdentity = { ...pilotUser, usuarioId: 'not-a-uuid' }
    const inactive: WhatsAppPilotIdentity = { ...pilotUser, active: false }
    const noPerm: WhatsAppPilotIdentity = { ...pilotUser, aiAuthorized: false }

    for (const bad of [invalidId, inactive, noPerm]) {
      expect(resolveWhatsAppFlowAccess(bad, env).mode).toBe('denied')
      expect(shouldUseWhatsAppOrchestrator(bad, env)).toBe(false)
      expect(isWhatsAppVoiceNotesAllowedForUser(bad, env)).toBe(false)
      expect(isWhatsAppR2ButtonsAllowedForUser(bad, env)).toBe(false)
    }
  })

  it('isolates authorized pilot user (text, voice notes, R2 buttons) while keeping everyone else on legacy', () => {
    const env = {
      WHATSAPP_PILOT_ENABLED: '1',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: pilotUser.usuarioId,
      WHATSAPP_VOICE_NOTES_ENABLED: '1',
      AGENT_ORCHESTRATOR_R1: '0',
    }
    expect(isUserInWhatsAppPilot(pilotUser, env)).toBe(true)
    expect(resolveWhatsAppFlowAccess(pilotUser, env)).toEqual({
      allowed: true,
      mode: 'pilot',
      reason: 'pilot_user_authorized',
    })
    expect(isWhatsAppVoiceNotesAllowedForUser(pilotUser, env)).toBe(true)
    expect(isWhatsAppR2ButtonsAllowedForUser(pilotUser, env)).toBe(true)

    expect(isUserInWhatsAppPilot(otherUser, env)).toBe(false)
    expect(resolveWhatsAppFlowAccess(otherUser, env)).toEqual({
      allowed: false,
      mode: 'legacy',
      reason: 'user_outside_pilot_allowlist',
    })
    expect(isWhatsAppVoiceNotesAllowedForUser(otherUser, env)).toBe(false)
    expect(isWhatsAppR2ButtonsAllowedForUser(otherUser, env)).toBe(false)
  })

  it('blocks pilot access immediately when WHATSAPP_PILOT_ENABLED is turned OFF even if allowlist remains set', () => {
    const env = {
      WHATSAPP_PILOT_ENABLED: '0',
      WHATSAPP_ORCHESTRATOR_PILOT_USERS: pilotUser.usuarioId,
      WHATSAPP_VOICE_NOTES_ENABLED: '1',
      AGENT_ORCHESTRATOR_R1: '1',
      WHATSAPP_GLOBAL_ORCHESTRATOR_ENABLED: '1',
    }
    // Even if global flags are set, non-empty pilot allowlist refuses to broaden access silently
    expect(shouldUseWhatsAppOrchestrator(pilotUser, env)).toBe(false)
    expect(shouldUseWhatsAppOrchestrator(otherUser, env)).toBe(false)
    expect(isWhatsAppVoiceNotesAllowedForUser(pilotUser, env)).toBe(false)
  })

  it('decouples Web R1 activation (AGENT_ORCHESTRATOR_R1=1) from WhatsApp global activation', () => {
    // Activating Web R1 alone MUST NOT activate WhatsApp new flow or voice notes
    const webR1Only = { AGENT_ORCHESTRATOR_R1: '1' }
    expect(shouldUseWhatsAppOrchestrator(otherUser, webR1Only)).toBe(false)
    expect(isWhatsAppVoiceNotesAllowedForUser(otherUser, webR1Only)).toBe(false)

    // Voice notes are fail-closed unless WHATSAPP_VOICE_NOTES_ENABLED === '1' explicitly
    const explicitGlobalNoVoice = {
      AGENT_ORCHESTRATOR_R1: '1',
      WHATSAPP_GLOBAL_ORCHESTRATOR_ENABLED: '1',
    }
    expect(resolveWhatsAppFlowAccess(otherUser, explicitGlobalNoVoice).mode).toBe('global')
    expect(shouldUseWhatsAppOrchestrator(otherUser, explicitGlobalNoVoice)).toBe(true)
    expect(isWhatsAppVoiceNotesAllowedForUser(otherUser, explicitGlobalNoVoice)).toBe(false)

    const explicitGlobalWithVoice = {
      ...explicitGlobalNoVoice,
      WHATSAPP_VOICE_NOTES_ENABLED: '1',
    }
    expect(isWhatsAppVoiceNotesAllowedForUser(otherUser, explicitGlobalWithVoice)).toBe(true)
  })
})
