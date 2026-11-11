import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/** Video de fondo (fondoAgente.md) — solo efecto de atmósfera, sin tocar hero/emulador. */
export const AGENT_BACKDROP_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4'

/** Conservado por compatibilidad con tokens previos del campo. */
export const SPLINE_HERO_PALETTE = {
  front: '#FFFFFF',
  secondary: '#FAFCFD',
  side: '#F7F9FB',
  deep: '#F3F6F8',
  accent: '#2581C4',
  background: '#FAFCFD',
  gap: '#F1F4F6',
} as const

export function HeroVideoBackdrop() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection

    const syncPlayback = () => {
      if (media.matches || connection?.saveData) {
        video.pause()
        video.removeAttribute('autoplay')
        return
      }
      video.setAttribute('autoplay', '')
      void video.play().catch(() => {
        // Autoplay puede fallar; el póster/dim cubre el campo.
      })
    }

    syncPlayback()
    media.addEventListener('change', syncPlayback)
    return () => media.removeEventListener('change', syncPlayback)
  }, [])

  return (
    <div className="hero-video-backdrop" aria-hidden>
      <div className="hero-video-backdrop__media">
        <video
          ref={videoRef}
          className={cn('hero-video-backdrop__img', 'hero-video-backdrop__video')}
          src={AGENT_BACKDROP_VIDEO}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
        />
      </div>
      <div className="hero-video-backdrop__dim" />
    </div>
  )
}
