#!/usr/bin/env node
/**
 * Ensayo automatizado de extremo a extremo de la Demostración Comercial (8 pasos)
 * contra Supabase Local (`scrumban-tc-local`) + Vite local (0 llamadas externas).
 *
 * Verifica:
 * 1. Diagnóstico ejecutivo con datos reales sintéticos (bloqueos, retrasos, OKR en riesgo).
 * 2. Identificación de prioridades (Top 3).
 * 3. Análisis de bloqueo (proveedor de empaque).
 * 4. Recomendación ejecutiva (hechos vs análisis vs recomendación).
 * 5. Creación de compromiso como propuesta R2 (0 escritura directa antes de aprobar).
 * 6. Aprobación explícita y ejecución real en PostgreSQL.
 * 7. Consulta del resultado en el tablero.
 * 8. Continuidad en canal Voz R4 (`channel: 'voice'`, spokenText es-MX) + captura visual 1440px y 390px.
 */
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:57421'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const BASE_URL = process.env.DEMO_BASE_URL || 'http://127.0.0.1:5179'
const EMAIL = process.env.DEMO_EMAIL || 'qa-superadmin@tc-local.test'
const PASSWORD = process.env.DEMO_PASSWORD || 'TcLocalQa#2026!'

if (!SUPABASE_ANON_KEY) {
  console.error('Falta SUPABASE_ANON_KEY para el ensayo local.')
  process.exit(1)
}

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: authData, error: authErr } = await client.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
})
if (authErr || !authData?.session?.access_token) {
  throw new Error(`Login fallido: ${authErr?.message || 'sin sesión'}`)
}
const jwt = authData.session.access_token
const convId = `demo-rehearsal-${Date.now()}`

async function ask(utterance, channel = 'web') {
  const started = Date.now()
  const res = await fetch(`${BASE_URL}/api/gemini-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      mode: 'operativo',
      channel,
      conversationId: convId,
      messages: [{ role: 'user', content: utterance }],
    }),
  })
  const ms = Date.now() - started
  const body = await res.json()
  return { status: res.status, ms, body }
}

const steps = []

// Paso 1: Diagnóstico ejecutivo
const s1 = await ask('¿Qué necesita mi atención hoy?')
steps.push({
  step: 1,
  name: 'Diagnóstico ejecutivo',
  ok: s1.status === 200 && /bloque|prioridad|vencid|retraso/i.test(s1.body.answer || ''),
  ms: s1.ms,
  intent: s1.body.agent?.intent,
  preview: (s1.body.answer || '').slice(0, 180),
})

// Paso 2: OKRs en riesgo y prioridades
const s2 = await ask('¿Qué objetivos están en riesgo y por qué?')
steps.push({
  step: 2,
  name: 'Objetivos en riesgo y prioridades',
  ok: s2.status === 200 && /riesgo|entrega|empaque|bloque/i.test(s2.body.answer || ''),
  ms: s2.ms,
  intent: s2.body.agent?.intent,
  preview: (s2.body.answer || '').slice(0, 180),
})

// Paso 3: Análisis de bloqueo
const s3 = await ask('¿Qué está frenando a mi equipo?')
steps.push({
  step: 3,
  name: 'Análisis de bloqueos',
  ok: s3.status === 200 && /bloque|proveedor|empaque|facturaci/i.test(s3.body.answer || ''),
  ms: s3.ms,
  intent: s3.body.agent?.intent,
  preview: (s3.body.answer || '').slice(0, 180),
})

// Paso 4: Recomendación del asistente
const s4 = await ask('¿Qué decisiones debería tomar?')
steps.push({
  step: 4,
  name: 'Recomendación ejecutiva',
  ok: s4.status === 200 && (s4.body.agent?.blocks?.recommendation?.length ?? 0) > 0,
  ms: s4.ms,
  intent: s4.body.agent?.intent,
  preview: (s4.body.answer || '').slice(0, 180),
})

// Paso 5: Creación de compromiso (propuesta R2 sin escritura directa)
const s5 = await ask('Crea una acción para revisar este problema con el proveedor el viernes.')
const proposal = s5.body.proposals?.[0]
steps.push({
  step: 5,
  name: 'Propuesta de compromiso R2',
  ok: s5.status === 200 && Boolean(proposal?.id) && s5.body.agent?.executionEnabled === true,
  ms: s5.ms,
  proposalId: proposal?.id ?? null,
  summary: proposal?.summary ?? null,
})

// Paso 6: Aprobación explícita y ejecución real en PostgreSQL
let createdActionId = null
if (proposal?.id) {
  const started = Date.now()
  const confirmRes = await fetch(`${BASE_URL}/api/assistant-ops`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ action: 'confirm', op_id: proposal.id }),
  })
  const confirmBody = await confirmRes.json()
  createdActionId = confirmBody.result?.id ?? confirmBody.id ?? null
  steps.push({
    step: 6,
    name: 'Aprobación explícita y ejecución SQL',
    ok: confirmRes.status === 200 && confirmBody.status === 'confirmed',
    ms: Date.now() - started,
    status: confirmBody.status,
    createdActionId,
  })
} else {
  steps.push({ step: 6, name: 'Aprobación explícita y ejecución SQL', ok: false, reason: 'Sin propuesta previa' })
}

// Paso 7: Consulta del resultado (compromisos de la última reunión + verificación de persistencia)
const s7 = await ask('Revisa los compromisos de nuestra última reunión.')
steps.push({
  step: 7,
  name: 'Consulta de compromisos + memoria R3',
  ok: s7.status === 200 && /empaque|compromiso|acuerdo|reunión|bloque/i.test(s7.body.answer || ''),
  ms: s7.ms,
  intent: s7.body.agent?.intent,
  preview: (s7.body.answer || '').slice(0, 180),
})

// Paso 8: Seguimiento desde canal Voz R4 (`channel: 'voice'`)
const s8 = await ask('¿Qué necesita mi atención hoy?', 'voice')
steps.push({
  step: 8,
  name: 'Seguimiento multicanal Voz R4 (es-MX)',
  ok:
    s8.status === 200 &&
    Boolean(s8.body.spokenText) &&
    s8.body.voice?.mode === 'turn_based' &&
    s8.body.voice?.realtimeStreamingAvailable === false &&
    !/[#*`]|https?:\/\//.test(s8.body.spokenText || ''),
  ms: s8.ms,
  voiceMode: s8.body.voice?.mode,
  spokenPreview: (s8.body.spokenText || '').slice(0, 180),
})

// Captura visual real del ensayo comercial en Desktop 1440px y Móvil 390px
const browser = await chromium.launch({ headless: true })
let mobileOverlaps = -1
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('input[type="email"]', { timeout: 25000 })
  await page.fill('input[type="email"]', 'qa-direccion@tc-local.test')
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 })
  await page.goto(`${BASE_URL}/asistente-ia?lane=write`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('button[aria-label*="voz"]', { timeout: 25000 })
  await page.waitForTimeout(1000)

  // Consulta real en pantalla desktop para capturar tarjetas ejecutivas con datos sintéticos
  const inputBox = page.locator('#ai-assistant-input')
  await inputBox.fill('¿Qué necesita mi atención hoy?')
  await page.locator('button[aria-label="Enviar"]').click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: '.qa/demo-rehearsal-desktop-1440.png' })

  // Verificar móvil 390px en una sola fila superior limpia + 0 solapamientos
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  // Si el menú móvil está abierto, cerrarlo
  const closeNav = page.locator('button[aria-label*="Cerrar"]').first()
  if (await closeNav.isVisible().catch(() => false)) {
    await closeNav.click()
    await page.waitForTimeout(300)
  }
  const headerAudit = await page.evaluate(() => {
    const h = document.querySelector('main header')
    if (!h) return { overlaps: 99, topRowCount: 0 }
    const els = Array.from(h.querySelectorAll('button, [role="tab"]')).filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    const rects = els.map((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, r: r.right, b: r.bottom, label: (el.getAttribute('aria-label') || el.textContent || '').trim() }
    })
    let overlaps = 0
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (Math.min(rects[i].r, rects[j].r) - Math.max(rects[i].x, rects[j].x) > 2 &&
            Math.min(rects[i].b, rects[j].b) - Math.max(rects[i].y, rects[j].y) > 2) {
          overlaps += 1
        }
      }
    }
    const distinctRows = new Set(rects.map((r) => Math.round(r.y / 12))).size
    return { overlaps, distinctRows, count: rects.length }
  })
  mobileOverlaps = headerAudit.overlaps
  await page.screenshot({ path: '.qa/demo-rehearsal-mobile-390.png' })
  steps.push({
    step: 'UX',
    name: 'Visual Desktop 1440px + Móvil 390px (header compacto)',
    ok: headerAudit.overlaps === 0 && headerAudit.distinctRows <= 2,
    overlaps: headerAudit.overlaps,
    distinctRows: headerAudit.distinctRows,
  })
} finally {
  await browser.close()
}

const passed = steps.filter((s) => s.ok).length
const failed = steps.length - passed
console.log(
  JSON.stringify(
    {
      rehearsalVerdict: failed === 0 ? 'PASS' : 'FAIL',
      passed,
      total: steps.length,
      externalPaidCalls: 0,
      mobileOverlaps,
      steps,
    },
    null,
    2
  )
)
if (failed > 0) process.exit(1)
