/**
 * Router Hobby: audio | transcribe | tts
 * URLs: /api/assistant-audio, /api/assistant-transcribe, /api/elevenlabs-tts
 */
import { apiOpOf } from './_shared/apiOp.js'
import { defineOpRouter } from './_shared/routeHandler.js'
import assistantAudio from './_shared/handlers/assistant-audio.js'
import assistantTranscribe from './_shared/handlers/assistant-transcribe.js'
import elevenlabsTts from './_shared/handlers/elevenlabs-tts.js'

function resolveOp(req: { url?: string }) {
  const op = apiOpOf(req, ['assistant-', 'elevenlabs-'])
  if (op === 'audio' || op === 'assistant-audio') return 'audio'
  if (op === 'transcribe' || op === 'assistant-transcribe') return 'transcribe'
  if (op === 'tts' || op === 'elevenlabs-tts') return 'tts'
  const leaf = (req.url || '').split('?')[0]?.split('/').filter(Boolean).pop() || ''
  if (leaf.includes('transcribe')) return 'transcribe'
  if (leaf.includes('audio')) return 'audio'
  if (leaf.includes('elevenlabs') || leaf.includes('tts')) return 'tts'
  return op
}

export default defineOpRouter(resolveOp, {
  audio: assistantAudio,
  transcribe: assistantTranscribe,
  tts: elevenlabsTts,
}, 'Operacion de media desconocida.')
