/**
 * Autorización fail-closed del adaptador Retell R4.
 * No abre red. No reutiliza el agente de Guía ni el de entrevistas.
 */
import { findClientLeakedSecrets } from './pilotEnv.js'

export type R4RetellLiveGateCode =
  | 'flag_off'
  | 'live_not_authorized'
  | 'missing_credentials'
  | 'guide_agent_reuse_denied'
  | 'secret_on_client'
  | 'connect_blocked'

export type R4RetellLiveGate =
  | {
      ok: false
      code: R4RetellLiveGateCode
      error: string
      ready: boolean
      connect: false
    }

const MESSAGES: Record<R4RetellLiveGateCode, string> = {
  flag_off: 'AGENT_VOICE_R4 no esta en 1. Adaptador Retell R4 fail-closed.',
  live_not_authorized:
    'Falta AGENT_VOICE_R4_LIVE_OK=1. El piloto Retell R4 no esta autorizado.',
  missing_credentials:
    'Faltan RETELL_R4_API_KEY y RETELL_R4_AGENT_ID (secretos de servidor, distintos de Guia).',
  guide_agent_reuse_denied:
    'RETELL_R4_AGENT_ID no puede ser RETELL_GUIDE_AGENT_ID ni RETELL_AGENT_ID.',
  secret_on_client: 'Hay un secreto Retell/OpenAI con prefijo VITE_. Fail-closed.',
  connect_blocked:
    'Credenciales R4 presentes, pero la conexion a Retell sigue bloqueada en este incremento.',
}

export function resolveRetellR4LiveGate(
  env: Record<string, string | undefined> = {}
): R4RetellLiveGate {
  const leaked = findClientLeakedSecrets(env)
  if (leaked.length > 0) {
    return {
      ok: false,
      code: 'secret_on_client',
      error: MESSAGES.secret_on_client,
      ready: false,
      connect: false,
    }
  }
  if (env.AGENT_VOICE_R4 !== '1') {
    return {
      ok: false,
      code: 'flag_off',
      error: MESSAGES.flag_off,
      ready: false,
      connect: false,
    }
  }
  if (env.AGENT_VOICE_R4_LIVE_OK !== '1') {
    return {
      ok: false,
      code: 'live_not_authorized',
      error: MESSAGES.live_not_authorized,
      ready: false,
      connect: false,
    }
  }

  const agentId = env.RETELL_R4_AGENT_ID?.trim() ?? ''
  const apiKey = env.RETELL_R4_API_KEY?.trim() ?? ''
  const guideId = env.RETELL_GUIDE_AGENT_ID?.trim() ?? ''
  const interviewId = env.RETELL_AGENT_ID?.trim() ?? ''

  if (agentId && (agentId === guideId || agentId === interviewId)) {
    return {
      ok: false,
      code: 'guide_agent_reuse_denied',
      error: MESSAGES.guide_agent_reuse_denied,
      ready: false,
      connect: false,
    }
  }
  if (!agentId || !apiKey) {
    return {
      ok: false,
      code: 'missing_credentials',
      error: MESSAGES.missing_credentials,
      ready: false,
      connect: false,
    }
  }

  return {
    ok: false,
    code: 'connect_blocked',
    error: MESSAGES.connect_blocked,
    ready: true,
    connect: false,
  }
}

/** La politica local de retencion NO controla grabaciones de Retell. */
export function providerRecordingMustBeVerifiedSeparately() {
  return {
    localRetainAudioFlag: 'AGENT_VOICE_R4_RETAIN_AUDIO',
    controlsLocalBlobsOnly: true,
    retellDashboardRecording: 'unknown' as const,
    retellTranscriptRetention: 'unknown' as const,
    mustVerifyInProviderConsole: true,
  }
}
