import { describe, expect, it } from 'vitest'
import {
  FREE_TIER_GEMINI_MODELS,
  parseLoopbackAdapterUrl,
  resolveAiProviderStack,
  resolveLlmProvider,
  resolveSttProvider,
  resolveTtsProvider,
} from './aiProviders.js'
import { resolveVoiceProviderReadiness } from './voiceChannelAdapter.js'

describe('Phase 3 Decoupled AI Providers & $0 USD Guard', () => {
  it('defaults to zero paid external calls and honest browser/orchestrator fallbacks', () => {
    const stack = resolveAiProviderStack({})
    expect(stack.silentFakeFallbackAllowed).toBe(false)
    expect(stack.externalPaidCallsActive).toBe(false)
    expect(stack.llm.mode).toBe('orchestrator_only_no_llm')
    expect(stack.llm.canCallExternalApi).toBe(false)
    expect(stack.llm.guaranteedZeroCost).toBe(true)
    expect(stack.stt.mode).toBe('browser_speech_recognition')
    expect(stack.stt.fallbackBehavior).toBe('text_input_preserving_context')
    expect(stack.tts.mode).toBe('browser_es_mx')
    expect(stack.tts.fallbackBehavior).toBe('visual_reply_intact')
  })

  it('blocks Gemini calls fail-closed under zero-cost mode without explicit billing confirmation (key prefix alone proves nothing)', () => {
    const aizaWithoutConfirmation = resolveLlmProvider({
      AI_ZERO_COST_ONLY: '1',
      GEMINI_API_KEY: 'AIzaSyDemoSyntheticValidFormatKey1234567890',
      GEMINI_MODEL: 'gemini-2.5-flash',
    })
    expect(aizaWithoutConfirmation.canCallExternalApi).toBe(false)
    expect(aizaWithoutConfirmation.blockedReason).toMatch(/GEMINI_FREE_TIER_CONFIRMED/)

    const nonAizaWithoutConfirmation = resolveLlmProvider({
      AI_ZERO_COST_ONLY: '1',
      GEMINI_API_KEY: 'non-aiza-synthetic-example-key-format-1234567890',
      GEMINI_MODEL: 'gemini-2.5-flash',
    })
    expect(nonAizaWithoutConfirmation.canCallExternalApi).toBe(false)
    expect(nonAizaWithoutConfirmation.guaranteedZeroCost).toBe(true)

    const paidModel = resolveLlmProvider({
      AI_ZERO_COST_ONLY: '1',
      GEMINI_API_KEY: 'AIzaSyDemoSyntheticValidFormatKey1234567890',
      GEMINI_MODEL: 'gemini-2.5-pro',
      GEMINI_FREE_TIER_CONFIRMED: '1',
    })
    expect(paidModel.canCallExternalApi).toBe(false)
    expect(paidModel.blockedReason).toMatch(/allowlist gratuita/)

    const verifiedFree = resolveLlmProvider({
      AI_ZERO_COST_ONLY: '1',
      GEMINI_API_KEY: 'AIzaSyDemoSyntheticValidFormatKey1234567890',
      GEMINI_MODEL: FREE_TIER_GEMINI_MODELS[0],
      GEMINI_FREE_TIER_CONFIRMED: '1',
    })
    expect(verifiedFree.canCallExternalApi).toBe(true)
    expect(verifiedFree.mode).toBe('gemini_free_tier_verified')
    expect(verifiedFree.isPaidProvider).toBe(false)
    expect(verifiedFree.guaranteedZeroCost).toBe(true)

    // Cuando AI_ZERO_COST_ONLY no está activo, preserva Gemini y proveedores de voz autorizados
    const standardPaid = resolveAiProviderStack({
      GEMINI_API_KEY: 'non-aiza-authorized-standard-example-1234567890',
      GEMINI_MODEL: 'gemini-2.5-flash',
      VOICE_TTS_LIVE: '1',
      ELEVENLABS_API_KEY: 'el-authorized-key-1234567890',
    })
    expect(standardPaid.zeroCostEnforced).toBe(false)
    expect(standardPaid.llm.mode).toBe('gemini_authorized_paid')
    expect(standardPaid.llm.canCallExternalApi).toBe(true)
    expect(standardPaid.tts.mode).toBe('elevenlabs_authorized')
    expect(standardPaid.externalPaidCallsActive).toBe(true)
  })

  it('never enables paid STT or paid TTS under AI_ZERO_COST_ONLY=1 even if live flags and keys exist', () => {
    const stack = resolveAiProviderStack({
      AI_ZERO_COST_ONLY: '1',
      VOICE_STT_LIVE: '1',
      VOICE_TTS_LIVE: '1',
      OPENAI_API_KEY: 'sk-test-should-not-activate',
      ELEVENLABS_API_KEY: 'el-test-should-not-activate',
    })
    expect(stack.externalPaidCallsActive).toBe(false)
    expect(stack.stt.isPaidProvider).toBe(false)
    expect(stack.tts.isPaidProvider).toBe(false)
    expect(stack.stt.mode).toBe('browser_speech_recognition')
    expect(stack.tts.mode).toBe('browser_es_mx')
  })

  it('supports optional loopback-only local Whisper STT and Kokoro TTS adapters and rejects remote URLs', () => {
    expect(parseLoopbackAdapterUrl('http://127.0.0.1:8765/transcribe')).toBe('http://127.0.0.1:8765/transcribe')
    expect(parseLoopbackAdapterUrl('http://localhost:8766/synthesize/')).toBe('http://localhost:8766/synthesize')
    expect(parseLoopbackAdapterUrl('https://evil-paid-api.example.com/tts')).toBeNull()

    const stt = resolveSttProvider({ LOCAL_STT_URL: 'http://127.0.0.1:8765/transcribe' })
    const tts = resolveTtsProvider({ LOCAL_TTS_URL: 'http://127.0.0.1:8766/synthesize' })
    expect(stt.mode).toBe('local_whisper_adapter')
    expect(stt.isLocalOnly).toBe(true)
    expect(stt.isPaidProvider).toBe(false)
    expect(tts.mode).toBe('local_kokoro_adapter')
    expect(tts.isLocalOnly).toBe(true)
    expect(tts.isPaidProvider).toBe(false)

    const voice = resolveVoiceProviderReadiness({
      LOCAL_STT_URL: 'http://127.0.0.1:8765/transcribe',
      LOCAL_TTS_URL: 'http://127.0.0.1:8766/synthesize',
    })
    expect(voice.sttProvider).toBe('local_whisper_adapter')
    expect(voice.ttsProvider).toBe('local_kokoro_adapter')
    expect(voice.localTtsUrl).toBe('http://127.0.0.1:8766/synthesize')
    expect(voice.externalPaidCallsActive).toBe(false)
  })
})
