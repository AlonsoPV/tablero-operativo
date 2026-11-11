import type { CSSProperties, ReactNode } from 'react'
import { Apple, ChevronRight, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AURA_VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4'

export const gradientStyle: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, #091020 0%, #0B2551 12.5%, #A4F4FD 32.5%, #00d2ff 50%, #0B2551 67.5%, #091020 87.5%, #091020 100%)',
  backgroundSize: '200% auto',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  filter: 'url(#c3-noise)',
}

export function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 384 512"
      className={cn('h-4 w-4', className)}
      fill="currentColor"
      aria-hidden
    >
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={cn('h-8 w-8', className)} fill="white" aria-hidden>
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  )
}

export function AppleButton({
  label = 'Download Aura',
  full = false,
  className,
}: {
  label?: string
  full?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        'group inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition-all hover:bg-white/90 active:scale-[0.98]',
        full && 'w-full',
        className
      )}
    >
      <Apple className="h-4 w-4" aria-hidden />
      <span>{label}</span>
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-px" aria-hidden />
    </button>
  )
}

export function SectionEyebrow({
  label,
  tag,
}: {
  label: string
  tag?: string
}) {
  return (
    <div className="inline-flex items-center gap-2 text-sm text-white/70">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      <span>{label}</span>
      {tag ? (
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/50">{tag}</span>
      ) : null}
    </div>
  )
}

export function MenuIconButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 md:hidden"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  )
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LiquidCard({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('liquid-glass', className)}>{children}</div>
}
