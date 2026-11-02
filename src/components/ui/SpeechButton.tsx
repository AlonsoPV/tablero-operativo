import { useEffect, useId, useState } from 'react'
import { Loader2, Square, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  playBase64Audio,
  requestElevenLabsSpeech,
  speakWithBrowser,
} from '@/lib/elevenLabsTtsClient'
import { cn } from '@/lib/utils'

type SpeechButtonProps = {
  text: string
  className?: string
  label?: string
  stopLabel?: string
  size?: 'default' | 'sm' | 'icon'
}

type ActiveSpeech = {
  id: string
  stop: () => void
}

let activeSpeech: ActiveSpeech | null = null

function stopActiveSpeech() {
  activeSpeech?.stop()
  activeSpeech = null
}

export function SpeechButton({
  text,
  className,
  label = 'Leer',
  stopLabel = 'Detener',
  size = 'sm',
}: SpeechButtonProps) {
  const id = useId()
  const [phase, setPhase] = useState<'idle' | 'loading' | 'playing'>('idle')

  useEffect(() => {
    return () => {
      if (activeSpeech?.id === id) stopActiveSpeech()
    }
  }, [id])

  const stop = () => {
    if (activeSpeech?.id === id) stopActiveSpeech()
    else stopActiveSpeech()
    setPhase('idle')
  }

  const play = async () => {
    const trimmed = text.trim()
    if (!trimmed || phase === 'loading') return

    stopActiveSpeech()
    setPhase('loading')

    let audio: HTMLAudioElement | null = null
    let utterance: SpeechSynthesisUtterance | null = null
    let cancelled = false

    const localStop = () => {
      cancelled = true
      if (audio) {
        audio.pause()
        audio.src = ''
      }
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      setPhase('idle')
    }

    activeSpeech = { id, stop: localStop }

    try {
      const result = await requestElevenLabsSpeech(trimmed)
      if (cancelled) return
      audio = playBase64Audio(result.audioBase64, result.mimeType)
      setPhase('playing')
      audio.onended = () => {
        if (activeSpeech?.id === id) activeSpeech = null
        setPhase('idle')
      }
      audio.onerror = () => {
        if (cancelled) return
        utterance = speakWithBrowser(trimmed)
        utterance.onend = () => {
          if (activeSpeech?.id === id) activeSpeech = null
          setPhase('idle')
        }
      }
    } catch {
      if (cancelled) return
      try {
        utterance = speakWithBrowser(trimmed)
        setPhase('playing')
        utterance.onend = () => {
          if (activeSpeech?.id === id) activeSpeech = null
          setPhase('idle')
        }
      } catch {
        setPhase('idle')
        if (activeSpeech?.id === id) activeSpeech = null
      }
    }
  }

  const busy = phase === 'loading' || phase === 'playing'

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={cn('gap-1.5', className)}
      disabled={!text.trim() && phase === 'idle'}
      onClick={() => {
        if (busy) stop()
        else void play()
      }}
      aria-label={busy ? stopLabel : label}
    >
      {phase === 'loading' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : phase === 'playing' ? (
        <Square className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Volume2 className="h-3.5 w-3.5" aria-hidden />
      )}
      {size === 'icon' ? null : busy ? stopLabel : label}
    </Button>
  )
}
