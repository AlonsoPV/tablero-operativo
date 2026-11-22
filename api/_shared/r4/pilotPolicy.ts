/**
 * Decisiones de arquitectura del piloto R4.
 * Código = contrato. No activa proveedores reales.
 */

export const R4_PILOT_DECISIONS = {
  primaryAgent: 'retell_r4_independent_of_guide',
  comparator: 'openai_realtime_experimental',
  autoFallback: false,
  consentBeforeAudioCapture: true,
  publicLinkAccess: 'single_authorized_session',
  protectedConfirm: 'authenticated_authorized_owner',
  audioRetentionDefault: 'none',
} as const

export type R4PilotAudioRetention = 'none' | 'configured'

export type R4PilotPolicy = {
  primaryAgent: typeof R4_PILOT_DECISIONS.primaryAgent
  comparator: typeof R4_PILOT_DECISIONS.comparator
  autoFallback: false
  consentBeforeAudioCapture: true
  publicLinkAccess: typeof R4_PILOT_DECISIONS.publicLinkAccess
  protectedConfirm: typeof R4_PILOT_DECISIONS.protectedConfirm
  audioRetention: R4PilotAudioRetention
  retainAudio: boolean
  liveProvidersAuthorized: false
  reuseGuideRetellAgent: false
  backendVoiceFlag: boolean
  uiLabFlag: boolean
}

export function resolveR4PilotPolicy(
  env: Record<string, string | undefined> = process.env
): R4PilotPolicy {
  const retainAudio = env.AGENT_VOICE_R4_RETAIN_AUDIO === '1'
  return {
    primaryAgent: R4_PILOT_DECISIONS.primaryAgent,
    comparator: R4_PILOT_DECISIONS.comparator,
    autoFallback: false,
    consentBeforeAudioCapture: true,
    publicLinkAccess: R4_PILOT_DECISIONS.publicLinkAccess,
    protectedConfirm: R4_PILOT_DECISIONS.protectedConfirm,
    audioRetention: retainAudio ? 'configured' : 'none',
    retainAudio,
    liveProvidersAuthorized: false,
    reuseGuideRetellAgent: false,
    backendVoiceFlag: env.AGENT_VOICE_R4 === '1',
    uiLabFlag: env.VITE_AGENT_VOICE_R4 === '1',
  }
}

export const R4_PILOT_SECRET_ENV_KEYS = [
  'RETELL_API_KEY',
  'RETELL_AGENT_ID',
  'RETELL_R4_AGENT_ID',
  'OPENAI_API_KEY',
  'OPENAI_REALTIME_MODEL',
] as const
