/**
 * Adaptadores de piloto real: siempre deshabilitados en este worktree.
 * No leen claves, no abren red, no reutilizan el agente de Guía.
 */
import type { RetellSessionPort } from './contracts.js'

const DISABLED_ERROR =
  'Proveedor de voz real deshabilitado. El piloto R4 no lee credenciales ni abre red.'

export function createDisabledRetellR4Adapter(): RetellSessionPort {
  return {
    async start() {
      return { ok: false, error: DISABLED_ERROR, code: 'unauthorized' }
    },
    async speakTurn() {
      return { ok: false, error: DISABLED_ERROR, code: 'unauthorized' }
    },
    async end() {
      return { ok: false, error: DISABLED_ERROR, code: 'unauthorized' }
    },
  }
}

export function createDisabledOpenAiRealtimeAdapter(): RetellSessionPort {
  return {
    async start() {
      return {
        ok: false,
        error: 'Comparador OpenAI Realtime deshabilitado. No hay fallback automatico.',
        code: 'unauthorized',
      }
    },
    async speakTurn() {
      return { ok: false, error: 'Comparador OpenAI Realtime deshabilitado.', code: 'unauthorized' }
    },
    async end() {
      return { ok: false, error: 'Comparador OpenAI Realtime deshabilitado.', code: 'unauthorized' }
    },
  }
}
