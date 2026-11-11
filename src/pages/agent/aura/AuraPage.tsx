import { useState } from 'react'
import { motion } from 'motion/react'
import {
  Archive,
  ChevronRight,
  Inbox,
  MoreHorizontal,
  Paperclip,
  Reply,
  Forward,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  AppleButton,
  AppleLogo,
  AURA_VIDEO_SRC,
  CheckIcon,
  gradientStyle,
  LiquidCard,
  LogoMark,
  MenuIconButton,
  SectionEyebrow,
} from './AuraPrimitives'
import '@/styles/aura.css'

const NAV_LINKS = ['Solutions', 'Pricing', 'Blog', 'Documentation', 'Careers'] as const
const MENU_ITEMS = ['File', 'Edit', 'View', 'Go', 'Window', 'Help'] as const
const LOGOS = ['Linear', 'Vercel', 'Figma', 'Stripe', 'Ramp', 'Notion', 'Loom', 'Arc'] as const

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

const TRIAGE = [
  {
    title: 'Priority',
    count: 4,
    color: '#ffffff',
    items: ['Sophia Chen — Q3 review', 'David Lim — contract signoff'],
  },
  {
    title: 'Follow-up',
    count: 7,
    color: '#e5e5e5',
    items: ['Marcus — design review', 'Figma — comment thread'],
  },
  {
    title: 'Updates',
    count: 18,
    color: '#a3a3a3',
    items: ['Vercel — deploy ready', 'GitHub — PR #482 merged'],
  },
  {
    title: 'Archived',
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
    monthly: 'Free',
    yearly: 'Free',
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
    monthly: '$9,99/m',
    yearly: '$99,99/y',
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
    monthly: '$19,99/m',
    yearly: '$199,99/y',
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

const SIDEBAR_NAV = [
  { icon: Inbox, label: 'Inbox', count: 12, active: true },
  { icon: Star, label: 'Starred', count: 3, active: false },
  { icon: Send, label: 'Sent', count: undefined, active: false },
  { icon: FileText, label: 'Drafts', count: 2, active: false },
  { icon: Archive, label: 'Archive', count: undefined, active: false },
  { icon: Trash2, label: 'Trash', count: undefined, active: false },
] as const

const LABELS = [
  { name: 'Work', color: '#00d2ff' },
  { name: 'Personal', color: '#A4F4FD' },
  { name: 'Travel', color: '#f59e0b' },
  { name: 'Finance', color: '#10b981' },
] as const

const CHIPS = ['Auto-categorize', 'Snooze for later', 'Silent newsletters', 'One-tap unsubscribe'] as const

export function AuraPage() {
  const [yearly, setYearly] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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
          src={AURA_VIDEO_SRC}
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
          <MenuIconButton onClick={() => setMenuOpen((v) => !v)} />
        </motion.nav>

        {menuOpen ? (
          <div className="mx-auto max-w-6xl space-y-2 px-6 pb-4 md:hidden">
            {NAV_LINKS.map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase()}`}
                className="block rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
                onClick={() => setMenuOpen(false)}
              >
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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="h-10 border-y border-white/10 bg-black/40 backdrop-blur-md"
        >
          <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6 text-xs">
            <div className="flex items-center gap-3">
              <AppleLogo className="h-3.5 w-3.5" />
              <span className="font-semibold text-white">Aura</span>
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
            <div className="flex items-center gap-2 text-white/60">
              <Search className="h-3.5 w-3.5" />
              <span>Wed May 6 1:09 PM</span>
            </div>
          </div>
        </motion.div>

        {/* Inbox mockup */}
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e1014]/90 backdrop-blur-2xl"
          >
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="mx-auto text-xs text-white/50">Aura — Inbox</span>
            </div>

            <div className="grid h-[520px] grid-cols-12">
              <aside className="col-span-3 border-r border-white/10 bg-black/30 p-4">
                <button
                  type="button"
                  className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Compose with Aura
                </button>
                <nav className="space-y-1">
                  {SIDEBAR_NAV.map((item) => (
                    <div
                      key={item.label}
                      className={cn(
                        'flex items-center justify-between rounded-md px-2 py-1.5 text-xs',
                        item.active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <item.icon className="h-3.5 w-3.5" />
                        {item.label}
                      </span>
                      {item.count != null ? <span>{item.count}</span> : null}
                    </div>
                  ))}
                </nav>
                <p className="mb-2 mt-6 text-[10px] uppercase tracking-widest text-white/40">Labels</p>
                <ul className="space-y-2">
                  {LABELS.map((label) => (
                    <li key={label.name} className="flex items-center gap-2 text-xs text-white/70">
                      <span className="h-2 w-2 rounded-full" style={{ background: label.color }} />
                      {label.name}
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="col-span-4 border-r border-white/10">
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-3 text-xs text-white/50">
                  <Search className="h-3.5 w-3.5" />
                  Search mail
                </div>
                <ul>
                  {MESSAGES.map((msg) => (
                    <li
                      key={msg.subject}
                      className={cn(
                        'border-b border-white/5 px-3 py-3',
                        msg.active && 'bg-white/5',
                        msg.unread && 'bg-white/[0.03]'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-xs', msg.unread ? 'font-semibold text-white' : 'text-white/80')}>
                          {msg.name}
                        </p>
                        <span className="text-[10px] text-white/40">{msg.time}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-white/80">{msg.subject}</p>
                      <p className="mt-0.5 truncate text-[11px] text-white/45">{msg.preview}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="col-span-5 p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ['reply', Reply],
                        ['forward', Forward],
                        ['archive', Archive],
                        ['trash', Trash2],
                      ] as const
                    ).map(([key, Icon]) => (
                      <button
                        key={key}
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/5"
                      >
                        <Icon className="h-3.5 w-3.5 text-white/70" />
                      </button>
                    ))}
                  </div>
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/5">
                    <MoreHorizontal className="h-3.5 w-3.5 text-white/70" />
                  </button>
                </div>
                <h3 className="text-lg font-semibold tracking-tight">Weekly product digest</h3>
                <div className="mt-3 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#00d2ff] to-[#0B2551] text-[10px] font-bold">
                    L
                  </span>
                  <div className="text-xs">
                    <p className="text-white">Linear</p>
                    <p className="text-white/45">to me · 9:41 AM</p>
                  </div>
                  <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/60">
                    Work
                  </span>
                </div>

                <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: '#A4F4FD' }}>
                    <Sparkles className="h-3.5 w-3.5" />
                    Summary by Aura
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/70">
                    Your team closed 23 issues, merged 14 PRs, and shipped 2 features. Top contributor:
                    Marcus. No action needed.
                  </p>
                </div>

                <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/70">
                  <p>Hi team,</p>
                  <p>
                    Here is your weekly digest of everything happening across your projects. This was a
                    strong week with significant progress on the Q3 roadmap.
                  </p>
                  <p>
                    Twenty-three issues were closed, fourteen pull requests were merged, and two
                    customer-facing features went out. The velocity trend continues to climb.
                  </p>
                  <p>Let me know if you would like a deeper breakdown by project or contributor.</p>
                  <p className="text-white/50">— The Linear team</p>
                </div>

                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70">
                  <Paperclip className="h-3.5 w-3.5" />
                  digest-may-6.pdf
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Feature triage */}
        <section id="solutions" className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <div className="grid items-start gap-10 md:grid-cols-2 md:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
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
                {CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </motion.div>

            <LiquidCard className="rounded-2xl p-5">
              <p className="text-xs text-white/50">Today · 42 messages triaged</p>
              <div className="mt-4 grid gap-3">
                {TRIAGE.map((bucket) => (
                  <LiquidCard key={bucket.title} className="rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium" style={{ color: bucket.color }}>
                        {bucket.title}
                      </p>
                      <span className="text-xs text-white/50">{bucket.count}</span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {bucket.items.map((item) => (
                        <li key={item} className="text-xs text-white/60">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </LiquidCard>
                ))}
              </div>
            </LiquidCard>
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
          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <LiquidCard key={item.name} className="rounded-2xl p-6">
                <blockquote className="text-sm leading-[1.6] text-white/80">
                  “{item.quote}”
                </blockquote>
                <figcaption className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-white/50">{item.role}</p>
                  <p className="mt-1 text-xs font-semibold tracking-wide text-white">{item.company}</p>
                </figcaption>
              </LiquidCard>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="c3-pricing-section">
          <svg width="0" height="0" className="absolute" aria-hidden>
            <defs>
              <filter id="c3-noise-pricing">
                <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" stitchTiles="stitch" />
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
                <p className="c3-tier-large">{yearly ? plan.yearly : plan.monthly}</p>
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
              onClick={() => setYearly((v) => !v)}
              aria-pressed={yearly}
              aria-label="Toggle yearly pricing"
            >
              <span className="c3-toggle-knob" />
            </button>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-32">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
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
              Join thousands of builders, founders, and operators who treat email like a tool — not an
              obligation.
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
      </div>
    </div>
  )
}
