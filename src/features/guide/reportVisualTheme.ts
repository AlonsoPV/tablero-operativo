/**
 * Paleta semántica del informe ejecutivo Enviardian (web + PDF).
 * Color = significado; no decoración arbitraria.
 */
import type { EvidenceKind, ReportCommitmentStatus } from '@/features/guide/enviardianReportDocument'

export const REPORT_PALETTE = {
  navy: '#172B59',
  blue: '#2563EB',
  teal: '#0D9488',
  green: '#16A34A',
  amber: '#D97706',
  coral: '#EA580C',
  red: '#DC2626',
  violet: '#7C3AED',
  surface: '#F4F7FC',
  white: '#FFFFFF',
  ink: '#0F172A',
  muted: '#64748B',
} as const

export type ReportToneId =
  | 'navy'
  | 'blue'
  | 'teal'
  | 'green'
  | 'amber'
  | 'coral'
  | 'red'
  | 'violet'
  | 'neutral'

function hexToRgb01(hex: string): string {
  const raw = hex.replace('#', '')
  const n = Number.parseInt(raw, 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`
}

export const REPORT_PDF_RGB: Record<ReportToneId | 'surface' | 'ink' | 'muted' | 'rule', string> = {
  navy: hexToRgb01(REPORT_PALETTE.navy),
  blue: hexToRgb01(REPORT_PALETTE.blue),
  teal: hexToRgb01(REPORT_PALETTE.teal),
  green: hexToRgb01(REPORT_PALETTE.green),
  amber: hexToRgb01(REPORT_PALETTE.amber),
  coral: hexToRgb01(REPORT_PALETTE.coral),
  red: hexToRgb01(REPORT_PALETTE.red),
  violet: hexToRgb01(REPORT_PALETTE.violet),
  neutral: hexToRgb01(REPORT_PALETTE.muted),
  surface: hexToRgb01(REPORT_PALETTE.surface),
  ink: hexToRgb01(REPORT_PALETTE.ink),
  muted: hexToRgb01(REPORT_PALETTE.muted),
  rule: '0.820 0.847 0.890',
}

export type ReportToneClasses = {
  id: ReportToneId
  hex: string
  rail: string
  card: string
  border: string
  text: string
  badge: string
  bar: string
  kpiValue: string
}

const TONE: Record<ReportToneId, ReportToneClasses> = {
  navy: {
    id: 'navy',
    hex: REPORT_PALETTE.navy,
    rail: 'bg-[#172B59]',
    card: 'bg-[#172B59]/[0.06]',
    border: 'border-[#172B59]/25',
    text: 'text-[#172B59]',
    badge: 'border-[#172B59]/30 bg-[#172B59]/10 text-[#172B59]',
    bar: 'bg-[#172B59]',
    kpiValue: 'text-[#172B59]',
  },
  blue: {
    id: 'blue',
    hex: REPORT_PALETTE.blue,
    rail: 'bg-[#2563EB]',
    card: 'bg-[#2563EB]/[0.08]',
    border: 'border-[#2563EB]/25',
    text: 'text-[#1D4ED8]',
    badge: 'border-[#2563EB]/30 bg-[#2563EB]/10 text-[#1D4ED8]',
    bar: 'bg-[#2563EB]',
    kpiValue: 'text-[#1D4ED8]',
  },
  teal: {
    id: 'teal',
    hex: REPORT_PALETTE.teal,
    rail: 'bg-[#0D9488]',
    card: 'bg-[#0D9488]/[0.08]',
    border: 'border-[#0D9488]/25',
    text: 'text-[#0F766E]',
    badge: 'border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0F766E]',
    bar: 'bg-[#0D9488]',
    kpiValue: 'text-[#0F766E]',
  },
  green: {
    id: 'green',
    hex: REPORT_PALETTE.green,
    rail: 'bg-[#16A34A]',
    card: 'bg-[#16A34A]/[0.08]',
    border: 'border-[#16A34A]/25',
    text: 'text-[#15803D]',
    badge: 'border-[#16A34A]/30 bg-[#16A34A]/10 text-[#15803D]',
    bar: 'bg-[#16A34A]',
    kpiValue: 'text-[#15803D]',
  },
  amber: {
    id: 'amber',
    hex: REPORT_PALETTE.amber,
    rail: 'bg-[#D97706]',
    card: 'bg-[#D97706]/[0.09]',
    border: 'border-[#D97706]/28',
    text: 'text-[#B45309]',
    badge: 'border-[#D97706]/30 bg-[#D97706]/10 text-[#B45309]',
    bar: 'bg-[#D97706]',
    kpiValue: 'text-[#B45309]',
  },
  coral: {
    id: 'coral',
    hex: REPORT_PALETTE.coral,
    rail: 'bg-[#EA580C]',
    card: 'bg-[#EA580C]/[0.09]',
    border: 'border-[#EA580C]/28',
    text: 'text-[#C2410C]',
    badge: 'border-[#EA580C]/30 bg-[#EA580C]/10 text-[#C2410C]',
    bar: 'bg-[#EA580C]',
    kpiValue: 'text-[#C2410C]',
  },
  red: {
    id: 'red',
    hex: REPORT_PALETTE.red,
    rail: 'bg-[#DC2626]',
    card: 'bg-[#DC2626]/[0.08]',
    border: 'border-[#DC2626]/28',
    text: 'text-[#B91C1C]',
    badge: 'border-[#DC2626]/30 bg-[#DC2626]/10 text-[#B91C1C]',
    bar: 'bg-[#DC2626]',
    kpiValue: 'text-[#B91C1C]',
  },
  violet: {
    id: 'violet',
    hex: REPORT_PALETTE.violet,
    rail: 'bg-[#7C3AED]',
    card: 'bg-[#7C3AED]/[0.08]',
    border: 'border-[#7C3AED]/28',
    text: 'text-[#6D28D9]',
    badge: 'border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#6D28D9]',
    bar: 'bg-[#7C3AED]',
    kpiValue: 'text-[#6D28D9]',
  },
  neutral: {
    id: 'neutral',
    hex: REPORT_PALETTE.muted,
    rail: 'bg-slate-400',
    card: 'bg-slate-500/[0.06]',
    border: 'border-slate-300/70',
    text: 'text-slate-700',
    badge: 'border-slate-300 bg-slate-100 text-slate-600',
    bar: 'bg-slate-400',
    kpiValue: 'text-slate-700',
  },
}

export function toneClasses(id: ReportToneId): ReportToneClasses {
  return TONE[id]
}

/** Evidencia → tono (violeta solo recomendaciones IA). */
export function toneForEvidence(kind: EvidenceKind): ReportToneId {
  if (kind === 'verified') return 'green'
  if (kind === 'hypothesis') return 'amber'
  if (kind === 'recommendation') return 'violet'
  return 'blue'
}

export function toneForDecision(kind: 'confirmed' | 'pending' | 'recommendation'): ReportToneId {
  if (kind === 'confirmed') return 'green'
  if (kind === 'pending') return 'amber'
  return 'violet'
}

export function toneForCommitment(status: ReportCommitmentStatus): ReportToneId {
  if (status === 'confirmed') return 'green'
  if (status === 'proposal') return 'violet'
  return 'amber'
}

export function toneForSessionAction(
  status: 'executed' | 'pending_confirmation' | 'commitment' | 'recommendation'
): ReportToneId {
  if (status === 'executed') return 'green'
  if (status === 'pending_confirmation') return 'amber'
  if (status === 'recommendation') return 'violet'
  return 'blue'
}

const CRITICAL_RE =
  /critic|riesgo\s+alto|bloqueo|bloquead|urgente|falla\s+crit|caida|caída|parada|outage|incumpl/i
const PROBLEM_RE = /problema|retraso|atras|faltan|falta|riesgo|incidenc|desabast|perdid|pérdid/i

/**
 * Rojo solo si evidencia verificada y texto indica criticidad.
 * Coral = problema relevante; ámbar = atención; teal = oportunidad.
 */
export function toneForRisk(
  riskText: string,
  opts?: { evidence?: EvidenceKind; hasOpportunity?: boolean; isOpportunityBlock?: boolean }
): ReportToneId {
  if (opts?.isOpportunityBlock) return 'teal'
  const text = riskText || ''
  if (opts?.evidence === 'verified' && CRITICAL_RE.test(text)) return 'red'
  if (CRITICAL_RE.test(text) || PROBLEM_RE.test(text)) return 'coral'
  if (opts?.hasOpportunity && !PROBLEM_RE.test(text)) return 'teal'
  return 'amber'
}

export function pdfToneForSectionKind(
  kind: 'lead' | 'finding' | 'action' | 'note' | 'closing' | 'risk' | 'metric' | 'ai' | undefined
): ReportToneId {
  if (kind === 'lead' || kind === 'closing') return 'navy'
  if (kind === 'finding') return 'blue'
  if (kind === 'metric') return 'teal'
  if (kind === 'action') return 'green'
  if (kind === 'risk') return 'coral'
  if (kind === 'ai' || kind === 'note') return 'violet'
  return 'navy'
}

export function isCriticalVerifiedRisk(riskText: string, evidence?: EvidenceKind): boolean {
  return evidence === 'verified' && CRITICAL_RE.test(riskText || '')
}
