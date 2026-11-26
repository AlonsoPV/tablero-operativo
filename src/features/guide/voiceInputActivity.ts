export type VoiceInputActivity = 'silent' | 'active' | 'unknown'

/** Conservative acoustic veto, not a speech recognizer. Noise never proves silence. */
export function classifyInputSamples(samples: Float32Array): VoiceInputActivity {
  if (!samples.length) return 'unknown'
  let energy = 0
  for (const sample of samples) {
    if (!Number.isFinite(sample)) return 'unknown'
    energy += sample * sample
  }
  return Math.sqrt(energy / samples.length) <= 0.00001 ? 'silent' : 'active'
}

export function createVoiceInputMonitor(stream: MediaStream, createContext = () => new AudioContext()) {
  let context: AudioContext | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let analyser: AnalyserNode | null = null
  let closed = false
  try {
    context = createContext()
    source = context.createMediaStreamSource(stream)
    analyser = context.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser) // Never connect microphone monitoring to a speaker.
    void context.resume().catch(() => {})
  } catch { /* An unavailable/suspended monitor is unknown, never silence. */ }
  const samples = new Float32Array(analyser?.fftSize ?? 0)
  return {
    read(): VoiceInputActivity {
      if (closed || !analyser || context?.state !== 'running' || !stream.getAudioTracks().some(t=>t.readyState === 'live')) return 'unknown'
      try { analyser.getFloatTimeDomainData(samples); return classifyInputSamples(samples) } catch {return 'unknown'}
    },
    close() {
      if (closed) return
      closed = true
      try {source?.disconnect()} catch { /* already detached */ }
      try {analyser?.disconnect()} catch { /* already detached */ }
      if (context && context.state !== 'closed') void context.close().catch(()=>{})
      stream.getTracks().forEach(t=>t.stop())
      source = null; analyser = null; context = null
    },
  }
}
