import { useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  Archive,
  ChevronRight,
  Forward,
  Inbox,
  Menu,
  MoreHorizontal,
  Paperclip,
  Reply,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import './aura.css'

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4'

const NAV_LINKS = ['Solutions', 'Pricing', 'Blog', 'Documentation', 'Careers'] as const
const MENU_ITEMS = ['File', 'Edit', 'View', 'Go', 'Window', 'Help'] as const
const LOGOS = ['Linear', 'Vercel', 'Figma', 'Stripe', 'Ramp', 'Notion', 'Loom', 'Arc'] as const

const gradientStyle: CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, #091020 0%, #0B2551 12.5%, #A4F4FD 32.5%, #00d2ff 50%, #0B2551 67.5%, #091020 87.5%, #091020 100%)',
  backgroundSize: '200% auto',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  filter: 'url(#c3-noise)',
}

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={cn('h-4 w-4', className)} fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={cn('h-8 w-8', className)} fill="white" aria-hidden>
      <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
    </svg>
  )
}

function AppleButton({
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
      <AppleLogo />
      <span>{label}</span>
      <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-px" />
    </button>
  )
}

function SectionEyebrow({ label, tag }: { label: string; tag?: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      <span className="text-sm font-medium text-white">{label}</span>
      {tag ? (
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/50 text-xs">
          {tag}
        </span>
      ) : null}
    </div>
  )
}

const MESSAGES = [
  {
    name: 'Linear',
    subject: 'Weekly product digest',
    preview: 'Your team shipped 23 issues this week...',
    time: '9:41 AM',
    unread: true,
    active: true,
  },
  {
    name: 'Sophia Chen',
    subject: 'Re: Q3 roadmap review',
    preview: 'Thanks for sending the deck over. I had a few thoughts...',
    time: '8:12 AM',
    unread: true,
    active: false,
  },
  {
    name: 'Figma',
    subject: 'Marcus commented on your file',
    preview: 'Love the new direction on the landing hero.',
    time: 'Yesterday',
    unread: false,
    active: false,
  },
  {
    name: 'Stripe',
    subject: 'Payout of $12,480.00 sent',
    preview: 'Your payout is on its way to your bank...',
    time: 'Yesterday',
    unread: false,
    active: false,
  },
  {
    name: 'Vercel',
    subject: 'Deployment ready for aura-web',
    preview: 'Preview is live at aura-web-g3f.vercel.app',
    time: 'Mon',
    unread: false,
    active: false,
  },
  {
    name: 'GitHub',
    subject: '[aura/core] PR #482 approved',
    preview: 'david-lim approved your pull request.',
    time: 'Mon',
    unread: false,
    active: false,
  },
] as const

const SIDEBAR_NAV: { icon: ReactNode; label: string; count?: number; active?: boolean }[] = [
  { icon: <Inbox className="h-3.5 w-3.5" />, label: 'Inbox', count: 12, active: true },
  { icon: <Star className="h-3.5 w-3.5" />, label: 'Starred', count: 3 },
  { icon: <Send className="h-3.5 w-3.5" />, label: 'Sent' },
  { icon: <FileText className="h-3.5 w-3.5" />, label: 'Drafts', count: 2 },
  { icon: <Archive className="h-3.5 w-3.5" />, label: 'Archive' },
  { icon: <Trash2 className="h-3.5 w-3.5" />, label: 'Trash' },
]

const TRIAGE = [
  {
    label: 'Priority',
    count: 4,
    color: '#ffffff',
    items: ['Sophia Chen — Q3 review', 'David Lim — contract signoff'],
  },
  {
    label: 'Follow-up',
    count: 7,
    color: '#e5e5e5',
    items: ['Marcus — design review', 'Figma — comment thread'],
  },
  {
    label: 'Updates',
    count: 18,
    color: '#a3a3a3',
    items: ['Vercel — deploy ready', 'GitHub — PR #482 merged'],
  },
  {
    label: 'Archived',
    count: 13,
    color: '#525252',
    items: ['Stripe payout · Newsletter · Receipts'],
  },
] as const

const TESTIMONIALS = [
  {
    quote:
      'Aura gave our leadership team four hours of their week back. It reads like email from the future.',
    name: 'Parker Wilf',
    role: 'Group Product Manager',
    company: 'MERCURY',
  },
  {
    quote:
      "The command palette alone has changed how I process messages. I can't imagine going back to a traditional client.",
    name: 'Andrew von Rosenbach',
    role: 'Senior Engineering Program Manager',
    company: 'COHERE',
  },
  {
    quote:
      'Triage that actually understands context. Our team stopped dreading Monday morning inboxes.',
    name: 'Mathies Christensen',
    role: 'Engineering Manager',
    company: 'LUNAR',
  },
] as const

const PLANS = [
  {
    tier: 'Free',
    priceMonthly: 'Free',
    priceYearly: 'Free',
    desc: 'For creators taking their first steps with Forma.',
    features: [
      'Up to 3 projects in the cloud',
      'Image export up to 1080p',
      'Basic editing tools',
      'Free templates and icons',
      'Access via web and mobile app',
    ],
    pro: false,
  },
  {
    tier: 'Standard',
    priceMonthly: '$9,99/m',
    priceYearly: '$99,99/y',
    desc: 'For freelancers and small teams who need more freedom and flexibility.',
    features: [
      'Up to 50 projects in the cloud',
      'Export up to 4K',
      'Advanced editing toolkit',
      'Team collaboration (up to 5 members)',
      'Access to premium template library',
    ],
    pro: false,
  },
  {
    tier: 'Pro',
    priceMonthly: '$19,99/m',
    priceYearly: '$199,99/y',
    desc: 'For studios, agencies, and professional creators working with brands.',
    features: [
      'Unlimited projects',
      'Export up to 8K + animations',
      'AI-powered content generation tools',
      'Unlimited team members',
      'Brand customization',
    ],
    pro: true,
  },
] as const

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 6.2L4.6 8.8L10 3.2" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function AuraLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [yearly, setYearly] = useState(false)

  return (
    <div className="aura-page relative min-h-screen overflow-x-hidden bg-[#0c0c0c] text-white">
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <filter id="c3-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0"
            />
            <feComposite in2="SourceGraphic" operator="in" result="noise" />
            <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
          </filter>
        </defs>
      </svg>

      <div className="pointer-events-none fixed inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="pointer-events-none h-full w-full object-cover"
          src={VIDEO_SRC}
        />
      </div>

      <div className="pointer-events-none fixed inset-y-0 left-1/2 z-[5] hidden w-px -translate-x-[calc(50%+36rem)] bg-white/10 md:block" />
      <div className="pointer-events-none fixed inset-y-0 left-1/2 z-[5] hidden w-px translate-x-[calc(-50%+36rem)] bg-white/10 md:block" />

      <div className="relative z-10">
        {/* Navbar */}
        <motion.nav
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5"
        >
          <LogoMark />
          <div className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link}
                href={`#${link.toLowerCase()}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05, duration: 0.45 }}
                className="text-sm font-medium text-white/70 hover:text-white"
              >
                {link}
              </motion.a>
            ))}
          </div>
          <div className="hidden md:block">
            <AppleButton />
          </div>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 md:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Menu className="h-4 w-4" />
          </button>
        </motion.nav>
        {menuOpen ? (
          <div className="mx-auto max-w-6xl space-y-2 px-6 pb-4 md:hidden">
            {NAV_LINKS.map((link) => (
              <a key={link} href={`#${link.toLowerCase()}`} className="block py-2 text-sm text-white/80">
                {link}
              </a>
            ))}
            <AppleButton full />
          </div>
        ) : null}

        {/* Hero */}
        <section className="flex flex-col items-center pb-20 pt-16 text-center md:pt-28">
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl font-semibold leading-[0.9] tracking-tight md:text-7xl"
          >
            <span className="block text-white">Your email.</span>
            <span className="animate-shiny mt-1 block" style={gradientStyle}>
              Revitalized
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mt-8 max-w-md text-base leading-[1.5] text-white/60"
          >
            Aura is the premier inbox platform for the current era. It leverages powerful AI to
            organize, prioritize, and refine your messages into total clarity.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mt-8 flex flex-col items-center gap-3"
          >
            <AppleButton />
            <p className="text-xs text-white/40">Download for Intel / Apple Silicon</p>
          </motion.div>
        </section>

        {/* macOS menu bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.55 }}
          className="h-10 border-b border-t border-white/10 bg-black/40 backdrop-blur-md"
        >
          <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6 text-xs">
            <div className="flex items-center gap-3">
              <AppleLogo className="h-3.5 w-3.5" />
              <span className="font-bold text-white">Aura</span>
              {MENU_ITEMS.map((item, index) => (
                <span
                  key={item}
                  className={cn(
                    'text-white/70',
                    index > 2 && 'hidden sm:inline',
                    index > 3 && 'hidden md:inline'
                  )}
                >
                  {item}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-white/70">
              <Search className="h-3.5 w-3.5" />
              <span>Wed May 6 1:09 PM</span>
            </div>
          </div>
        </motion.div>

        {/* Inbox mockup */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e1014]/90 backdrop-blur-2xl"
          >
            <div className="relative flex h-10 items-center border-b border-white/10 px-4">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>
              <p className="absolute inset-x-0 text-center text-xs text-white/50">Aura — Inbox</p>
            </div>

            <div className="grid h-auto grid-cols-1 md:grid-cols-12 md:h-[520px]">
              <aside className="border-b border-white/10 bg-black/30 p-4 md:col-span-3 md:border-b-0 md:border-r">
                <button
                  type="button"
                  className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Compose with Aura
                </button>
                <ul className="space-y-1">
                  {SIDEBAR_NAV.map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs',
                          item.active
                            ? 'bg-white/10 text-white'
                            : 'text-white/60 hover:bg-white/5'
                        )}
                      >
                        <span className="inline-flex items-center gap-2">
                          {item.icon}
                          {item.label}
                        </span>
                        {item.count != null ? <span>{item.count}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  Labels
                </p>
                <ul className="mt-2 space-y-2 text-xs text-white/70">
                  {[
                    ['Work', '#00d2ff'],
                    ['Personal', '#A4F4FD'],
                    ['Travel', '#f59e0b'],
                    ['Finance', '#10b981'],
                  ].map(([label, color]) => (
                    <li key={label} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                      {label}
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="border-b border-white/10 md:col-span-4 md:border-b-0 md:border-r">
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3 text-xs text-white/50">
                  <Search className="h-3.5 w-3.5" />
                  Search mail
                </div>
                <ul>
                  {MESSAGES.map((msg) => (
                    <li
                      key={msg.subject}
                      className={cn(
                        'cursor-default border-b border-white/5 px-3 py-3',
                        msg.active && 'bg-white/5'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            'text-xs',
                            msg.unread ? 'font-semibold text-white' : 'text-white/70'
                          )}
                        >
                          {msg.name}
                        </p>
                        <span className="text-[10px] text-white/40">{msg.time}</span>
                      </div>
                      <p
                        className={cn(
                          'mt-0.5 text-xs',
                          msg.unread ? 'text-white' : 'text-white/60'
                        )}
                      >
                        {msg.subject}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/40">{msg.preview}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-4 md:col-span-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex gap-1">
                    {[Reply, Forward, Archive, Trash2].map((Icon, index) => (
                      <button
                        key={index}
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/5"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-white/70 hover:bg-white/5"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
                <h3 className="text-lg font-semibold text-white">Weekly product digest</h3>
                <div className="mt-3 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#00d2ff] to-[#0B2551] text-[11px] font-bold">
                    L
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-white">
                      Linear <span className="text-white/50">to me · 9:41 AM</span>
                    </p>
                  </div>
                  <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/60">
                    Work
                  </span>
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#A4F4FD' }}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Summary by Aura
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">
                    Your team closed 23 issues, merged 14 PRs, and shipped 2 features. Top
                    contributor: Marcus. No action needed.
                  </p>
                </div>
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/80">
                  <p>Hi team,</p>
                  <p>
                    Here is your weekly digest of everything happening across your projects. This
                    was a strong week with significant progress on the Q3 roadmap.
                  </p>
                  <p>
                    Twenty-three issues were closed, fourteen pull requests were merged, and two
                    customer-facing features went out. The velocity trend continues to climb.
                  </p>
                  <p>
                    Let me know if you would like a deeper breakdown by project or contributor.
                  </p>
                  <p className="text-white/50">— The Linear team</p>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70">
                  <Paperclip className="h-3.5 w-3.5" />
                  digest-may-6.pdf
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* FeatureTriage */}
        <section id="solutions" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <SectionEyebrow label="Triage" tag="AI-native" />
              <h2 className="mt-5 text-3xl font-semibold leading-[1.02] tracking-tight md:text-5xl">
                Clear your inbox
                <br />
                in a single pass.
              </h2>
              <p className="mt-6 max-w-md text-base leading-[1.6] text-white/60">
                Aura reads every message, understands intent, and routes the noise away from the
                signal. Focus on what moves your day forward — the rest handles itself.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {['Auto-categorize', 'Snooze for later', 'Silent newsletters', 'One-tap unsubscribe'].map(
                  (chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70"
                    >
                      {chip}
                    </span>
                  )
                )}
              </div>
            </motion.div>

            <div className="liquid-glass rounded-2xl p-5">
              <p className="text-xs text-white/50">Today · 42 messages triaged</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {TRIAGE.map((bucket) => (
                  <div key={bucket.label} className="liquid-glass rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{bucket.label}</p>
                      <span className="text-xs font-semibold" style={{ color: bucket.color }}>
                        {bucket.count}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {bucket.items.map((item) => (
                        <li key={item} className="text-xs text-white/60">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Logo cloud */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
          <p className="text-center text-xs uppercase tracking-widest text-white/40">
            Trusted by the world&apos;s most thoughtful teams
          </p>
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4 lg:grid-cols-8">
            {LOGOS.map((name, i) => (
              <motion.p
                key={name}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="text-center text-sm font-semibold tracking-tight text-white/50 hover:text-white"
              >
                {name}
              </motion.p>
            ))}
          </div>
        </section>

        {/* Testimonials */}
        <section className="mx-auto max-w-6xl border-t border-white/10 px-6 py-20 md:py-28">
          <div className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <figure key={item.name} className="liquid-glass rounded-2xl p-6">
                <blockquote className="text-sm leading-[1.6] text-white/80">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-sm font-semibold text-white">{item.name}</p>
                  <p className="text-xs text-white/50">{item.role}</p>
                  <p className="mt-1 text-xs font-semibold tracking-wide text-white">{item.company}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="c3-pricing-section">
          <svg width="0" height="0" className="absolute" aria-hidden>
            <defs>
              <filter id="c3-noise-price">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.5"
                  numOctaves="2"
                  stitchTiles="stitch"
                />
                <feComponentTransfer>
                  <feFuncA type="linear" slope="0.075" />
                </feComponentTransfer>
                <feComposite in2="SourceGraphic" operator="in" result="noise" />
                <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
              </filter>
            </defs>
          </svg>

          <div className="c3-watermark-container">
            <div className="c3-watermark-main">
              <span className="c3-watermark-line-1">Your email.</span>
              <span className="c3-watermark-line-2">Revitalized</span>
            </div>
          </div>

          <div className="c3-grid">
            {PLANS.map((plan) => (
              <article key={plan.tier} className={cn('c3-card', plan.pro && 'c3-card-pro')}>
                <p className="c3-tier-small">{plan.tier}</p>
                <p className="c3-tier-large">
                  {yearly ? plan.priceYearly : plan.priceMonthly}
                </p>
                <p className="c3-desc">{plan.desc}</p>
                <ul className="c3-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <span className="c3-check">
                        <CheckIcon />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="c3-btn">
                  Choose Plan
                </button>
              </article>
            ))}
          </div>

          <div className="c3-toggle-wrap">
            <span className="text-sm text-white/70">Yearly</span>
            <button
              type="button"
              className={cn('c3-toggle', yearly && 'active')}
              aria-pressed={yearly}
              onClick={() => setYearly((v) => !v)}
            >
              <span className="c3-toggle-knob" />
            </button>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 text-center md:py-24"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                background:
                  'radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%)',
              }}
            />
            <h2 className="relative text-4xl font-semibold leading-[1.02] tracking-tight md:text-6xl">
              Close the tabs.
              <br />
              Open your day.
            </h2>
            <p className="relative mx-auto mt-6 max-w-md text-sm leading-[1.6] text-white/60">
              Join thousands of builders, founders, and operators who treat email like a tool —
              not an obligation.
            </p>
            <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <AppleButton label="Download Aura" />
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white hover:bg-white/5"
              >
                Talk to sales
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </section>

        <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">
          Aura preview · ruta de revisión `/aura` · no afecta `/agente`
        </footer>
      </div>
    </div>
  )
}
