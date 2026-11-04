import { defineApiHandler, type VercelRequestLike } from './_shared/http'

type DemoRequestBody = {
  name?: string
  email?: string
  company?: string
  teamSize?: string
  need?: string
}

const NEED_LABELS: Record<string, string> = {
  visibilidad: 'Visibilidad para dirección',
  seguimiento: 'Seguimiento de compromisos',
  indicadores: 'Indicadores / OKRs',
  comunicacion: 'Comunicación entre equipos',
}

const TEAM_LABELS: Record<string, string> = {
  '1-15': '1–15 personas',
  '16-50': '16–50 personas',
  '51-200': '51–200 personas',
  '200+': '200+ personas',
}

const VALID_TEAM = new Set(Object.keys(TEAM_LABELS))
const VALID_NEED = new Set(Object.keys(NEED_LABELS))
const DEMO_RATE_LIMIT = 5
const DEMO_RATE_WINDOW_MS = 15 * 60 * 1000
const demoRateBuckets = new Map<string, number[]>()

function clientIp(req: VercelRequestLike): string {
  const headers = (req as { headers?: Record<string, string | string[] | undefined> }).headers ?? {}
  const forwarded = headers['x-forwarded-for']
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const first = typeof raw === 'string' ? raw.split(',')[0]?.trim() : ''
  if (first) return first
  const realIp = headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()
  return 'unknown'
}

function checkDemoRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const prev = demoRateBuckets.get(ip) ?? []
  const recent = prev.filter((ts) => now - ts < DEMO_RATE_WINDOW_MS)
  if (recent.length >= DEMO_RATE_LIMIT) {
    const oldest = recent[0] ?? now
    const retryAfterSec = Math.max(1, Math.ceil((DEMO_RATE_WINDOW_MS - (now - oldest)) / 1000))
    demoRateBuckets.set(ip, recent)
    return { ok: false, retryAfterSec }
  }
  recent.push(now)
  demoRateBuckets.set(ip, recent)
  if (demoRateBuckets.size > 5_000) {
    const cutoff = now - DEMO_RATE_WINDOW_MS * 2
    for (const [k, stamps] of demoRateBuckets) {
      const next = stamps.filter((ts) => ts >= cutoff)
      if (next.length === 0) demoRateBuckets.delete(k)
      else demoRateBuckets.set(k, next)
    }
  }
  return { ok: true }
}

function parseBody(req: VercelRequestLike): DemoRequestBody {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as DemoRequestBody
    } catch {
      return {}
    }
  }
  if (req.body && typeof req.body === 'object') {
    return req.body as DemoRequestBody
  }
  return {}
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default defineApiHandler(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const rate = checkDemoRateLimit(clientIp(req))
    if (rate.ok === false) {
      return res.status(429).json({
        error: `Demasiadas solicitudes. Espera ${rate.retryAfterSec}s.`,
      })
    }

    const body = parseBody(req)
    const name = body.name?.trim() ?? ''
    const email = body.email?.trim() ?? ''
    const company = body.company?.trim() ?? ''
    const teamSize = body.teamSize ?? ''
    const need = body.need ?? ''

    if (!name || !email || !company || !VALID_TEAM.has(teamSize) || !VALID_NEED.has(need)) {
      return res.status(400).json({ error: 'Datos incompletos o inválidos' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Email inválido' })
    }

    const text = [
      'Solicitud de demo SCRUMBAN',
      '',
      `Nombre: ${name}`,
      `Email: ${email}`,
      `Empresa: ${company}`,
      `Equipo: ${TEAM_LABELS[teamSize]}`,
      `Necesidad: ${NEED_LABELS[need]}`,
      '',
      `Enviado: ${new Date().toISOString()}`,
    ].join('\n')

    const resendKey = process.env.RESEND_API_KEY
    const to = process.env.DEMO_REQUEST_TO ?? 'demo@scrumban.mx'

    if (resendKey) {
      const from = process.env.DEMO_REQUEST_FROM ?? 'SCRUMBAN <onboarding@resend.dev>'
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: email,
          subject: `Demo SCRUMBAN — ${company}`,
          text,
        }),
      })

      if (!emailRes.ok) {
        console.error('[demo-request] Resend error:', await emailRes.text())
        return res.status(502).json({ error: 'No se pudo enviar la solicitud' })
      }
    } else {
      console.log('[demo-request]', text)
    }

    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('[demo-request]', error)
    return res.status(500).json({ error: 'Error inesperado al enviar la solicitud' })
  }
})
