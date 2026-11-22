export {
  AGENT_VOICE_R4_FLAG,
  isAgentLinkR4Enabled,
  isAgentVoiceR4Enabled,
} from './flags.js'
export type {
  LinkAuthPort,
  R4LinkDecision,
  R4RetellSessionResult,
  R4SttResult,
  R4TtsResult,
  R4VoiceAdapters,
  RetellSessionPort,
  SttPort,
  TtsPort,
} from './contracts.js'
export {
  createSimulatedLinkAuth,
  createSimulatedR4Adapters,
  createSimulatedRetell,
  createSimulatedStt,
  createSimulatedTts,
} from './simulatedAdapters.js'
export { createOnceReportFinalizer } from './reportFinalize.js'
export type { SimulatedReportFinalize } from './reportFinalize.js'
