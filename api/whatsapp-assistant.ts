import { timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { defineApiHandler, readNumberEnv, readRequestBody, readStringEnv } from './_shared/http.js'
import {
  checkAssistantRateLimit,
  createServiceRoleClient,
} from './_shared/assistantAuth.js'
import { enableSystemCaCertificates } from './_shared/enableSystemCa.js'
import {
  geminiModelCandidates,
  isGeminiCapacityStatus,
  normalizeGeminiModel,
} from './_shared/geminiModel.js'
import { runGeminiToolLoop } from './_shared/geminiToolLoop.js'
import {
  cancelPendingOp,
  confirmPendingOp,
  dispatchCopilotTool,
  serializeToolResultForModel,
  type CopilotActor,
} from './_shared/assistantOpsRuntime.js'
import { inferAiConfirmText } from './_shared/whatsappAiConfirm.js'
import { composeSystemPrompt, sanitizeMessages } from '../src/lib/assistantPrompts.js'
import type { CopilotProposal } from '../src/features/ai-support/copilot/types.js'

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MAX_OUTPUT_TOKENS = 500
const DEFAULT_TEMPERATURE = 0.25
const DEFAULT_TIMEOUT_MS = 12000
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000
const HISTORY_LIMIT = 12
const HISTORY_CHARS = 8000
const REPLY_CHARS = 900

const WHATSAPP_CHANNEL_RULES = `
CANAL WHATSAPP:
- Responde en espanol, corto (maximo 900 caracteres).
- No uses markdown ni simbolos # *.
- No inventes telefonos, usuarios ni estados.
- Tienes un resumen inicial del tablero abajo. Usa herramientas para profundizar: dashboard, OKRs, organigrama, KPIs, gaps, tickets, calendario, kanban por equipos, acciones del equipo y el resto de modulos autorizados.
- Si no tiene permiso para un modulo, dilo. No inventes cifras ni organigrama.
- Las escrituras (crear/cambiar acciones) solo se proponen. El usuario confirma con boton o si/no.
- Si ya hay una propuesta pendiente, pide confirmar o cancelar. No crees otra.
`.trim()

const BOARD_SEED_CHARS = 4200

async function loadBoardSeedForWhatsApp(actor: CopilotActor): Promise<string> {
  const [dashboard, okrs, mine, team] = await Promise.all([
    dispatchCopilotTool(actor, 'get_dashboard_summary', {}),
    dispatchCopilotTool(actor, 'get_okr_progress', {}),
    dispatchCopilotTool(actor, 'get_my_actions', { filter: 'open', limit: 8 }),
    dispatchCopilotTool(actor, 'get_team_actions', { limit: 8 }),
  ])
  const payload = {
    dashboard: serializeToolResultForModel(dashboard),
    okrs: serializeToolResultForModel(okrs),
    mis_acciones: serializeToolResultForModel(mine),
    equipo_caliente: serializeToolResultForModel(team),
  }
  return JSON.stringify(payload).slice(0, BOARD_SEED_CHARS)
}

type PendingPreview = {
  id: string
  tool: string
  preview: { title?: string; summary?: string } | null
  expires_at: string
}

function secretsMatch(provided: string, expected: string): boolean {
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function readHeader(req: { headers?: Record<string, string | string[] | undefined> }, name: string) {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (key.toLowerCase() !== wanted) continue
    if (Array.isArray(value)) return value[0]
    return typeof value === 'string' ? value : undefined
  }
  return undefined
}

function clipReply(text: string) {
  const clean = text
    .replace(/[#*]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (clean.length <= REPLY_CHARS) return clean
  return `${clean.slice(0, REPLY_CHARS - 18).trim()}…`
}

function proposalToReply(text: string, proposal: CopilotProposal) {
  const fields = (proposal.fields ?? [])
    .filter((field) => field.to && field.to !== 'Ninguno' && field.to !== 'No solicitado')
    .map((field) => `${field.label}: ${field.to}`)
  const parts = [
    'Prepare esta propuesta. Todavia no esta creada.',
    proposal.summary,
    ...fields,
    clipReply(text),
    'Escribe si para crearla o no para cancelar.',
  ].filter(Boolean)
  return clipReply(parts.join('\n'))
}

function pendingToProposal(row: PendingPreview): CopilotProposal {
  return {
    id: row.id,
    tool: row.tool as CopilotProposal['tool'],
    title: row.preview?.title || 'Propuesta pendiente',
    summary: row.preview?.summary || 'Confirma o cancela esta operacion.',
    fields: [],
    expiresAt: row.expires_at,
  }
}

async function loadLatestPending(supabase: SupabaseClient, usuarioId: string): Promise<PendingPreview | null> {
  const { data } = await supabase
    .from('assistant_pending_ops')
    .select('id,tool,preview,expires_at,status')
    .eq('usuario_id', usuarioId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data?.id) return null
  return {
    id: data.id as string,
    tool: String(data.tool ?? ''),
    preview: (data.preview as PendingPreview['preview']) ?? null,
    expires_at: String(data.expires_at),
  }
}

async function loadHistory(supabase: SupabaseClient, waId: string) {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('direction,source,body_text,created_at')
    .eq('wa_id', waId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  const newestFirst = data ?? []
  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let chars = 0
  for (const row of newestFirst) {
    const content = typeof row.body_text === 'string' ? row.body_text.trim() : ''
    if (!content) continue
    const role: 'user' | 'assistant' = row.direction === 'inbound' ? 'user' : 'assistant'
    chars += content.length
    if (chars > HISTORY_CHARS && kept.length > 0) break
    kept.push({ role, content: content.slice(0, 1200) })
  }
  return sanitizeMessages(kept.reverse())
}

async function runGeminiChat(input: {
  actor: CopilotActor
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw Object.assign(new Error('missing_gemini'), { status: 500 })

  let boardSeed = ''
  try {
    boardSeed = await loadBoardSeedForWhatsApp(input.actor)
  } catch (error) {
    console.error('whatsapp-assistant board seed', error)
  }

  const systemInstruction = [
    composeSystemPrompt('operativo', {
      hasBoardContext: true,
      hasOkrContext: true,
    }),
    WHATSAPP_CHANNEL_RULES,
    boardSeed
      ? `RESUMEN INICIAL DEL TABLERO (JSON; datos de herramientas; no inventes fuera de esto ni de llamadas posteriores):\n${boardSeed}`
      : 'No se pudo precargar el resumen del tablero. Usa herramientas antes de responder cifras.',
  ].join('\n\n')
  const candidates = geminiModelCandidates(process.env.GEMINI_MODEL)
  const generationConfig = {
    maxOutputTokens: readNumberEnv('GEMINI_MAX_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS),
    temperature: readNumberEnv('GEMINI_TEMPERATURE', DEFAULT_TEMPERATURE),
  }
  const timeoutMs = readNumberEnv('WHATSAPP_AI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
  const contents = input.messages.map((message) => ({
    role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
    parts: [{ text: message.content }],
  }))

  let lastError: unknown
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i] ?? normalizeGeminiModel(process.env.GEMINI_MODEL)
    const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    try {
      return await runGeminiToolLoop({
        apiKey,
        url,
        model,
        systemInstruction,
        contents,
        generationConfig,
        actor: input.actor,
        timeoutMs,
      })
    } catch (error) {
      lastError = error
      const status = typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 0
      if (isGeminiCapacityStatus(status) && i < candidates.length - 1) continue
      throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('gemini_failed')
}

export default defineApiHandler(async (req, res) => {
  enableSystemCaCertificates()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
  }

  const expected = readStringEnv('WHATSAPP_ASSISTANT_SECRET')
  const provided = readHeader(req, 'x-whatsapp-assistant-secret') ?? ''
  if (!expected || !secretsMatch(provided, expected)) {
    return res.status(401).json({ error: 'No autorizado.' })
  }

  const body = await readRequestBody(req)
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Solicitud invalida.' })
  }
  const payload = body as {
    action?: unknown
    wa_id?: unknown
    usuario_id?: unknown
    text?: unknown
    op_id?: unknown
  }
  const usuarioId = typeof payload.usuario_id === 'string' ? payload.usuario_id.trim() : ''
  const waId = typeof payload.wa_id === 'string' ? payload.wa_id.trim() : ''
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  let action =
    payload.action === 'confirm' || payload.action === 'cancel' || payload.action === 'chat'
      ? payload.action
      : 'chat'
  let opId = typeof payload.op_id === 'string' ? payload.op_id.trim() : ''

  if (!usuarioId || !waId) {
    return res.status(400).json({ error: 'Faltan usuario_id o wa_id.' })
  }

  const rate = checkAssistantRateLimit({
    key: `${usuarioId}:whatsapp-assistant`,
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  })
  if (rate.ok === false) {
    return res.status(429).json({
      error: `Demasiadas solicitudes. Espera ${rate.retryAfterSec}s.`,
      text: `Demasiadas consultas seguidas. Espera ${rate.retryAfterSec}s y escribe de nuevo.`,
    })
  }

  let supabase: SupabaseClient
  try {
    supabase = createServiceRoleClient()
  } catch {
    return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
  }

  const { data: allowed, error: accessError } = await supabase.rpc('can_use_ai_whatsapp_for_usuario', {
    p_usuario_id: usuarioId,
  })
  if (accessError) {
    console.error('whatsapp-assistant access rpc', accessError.message)
    return res.status(403).json({ error: 'No se pudo validar acceso al asistente.' })
  }
  if (allowed !== true) {
    return res.status(403).json({ error: 'El asistente por WhatsApp solo esta disponible para OKRS y Super Admin.' })
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('id,user_id,rol,activo')
    .eq('id', usuarioId)
    .maybeSingle()
  if (usuarioError || !usuario?.id || usuario.activo === false || !usuario.user_id) {
    return res.status(403).json({ error: 'Usuario no disponible.' })
  }

  const actor: CopilotActor = {
    supabase,
    usuarioId,
    authUserId: String(usuario.user_id),
    rol: typeof usuario.rol === 'string' ? usuario.rol : null,
  }

  const textDecision = action === 'chat' ? inferAiConfirmText(text) : null
  if (textDecision) action = textDecision

  try {
    if (action === 'confirm' || action === 'cancel') {
      const pending = opId ? { id: opId } : await loadLatestPending(supabase, usuarioId)
      if (!pending?.id) {
        return res.status(200).json({
          text: 'No hay una propuesta pendiente. Escribe tu consulta.',
          proposals: [],
        })
      }
      if (action === 'cancel') {
        await cancelPendingOp(actor, pending.id)
        return res.status(200).json({ text: 'Listo, cancele la propuesta. No se cambio nada en el tablero.', proposals: [] })
      }
      const result = await confirmPendingOp(actor, pending.id)
      const created = result.result as { title?: string; fecha?: string; href?: string; checkpoints?: number } | null
      const createdTitle = created?.title || 'La accion'
      const lines = [
        'Accion creada. Estado: Pendiente.',
        createdTitle,
        created?.fecha ? `Fecha de compromiso: ${created.fecha}` : '',
        typeof created?.checkpoints === 'number' && created.checkpoints > 0
          ? `Checkpoints pendientes: ${created.checkpoints}`
          : '',
        created?.href ? `Puedes consultarla en Scrumban: ${created.href}` : 'Puedes consultarla en Scrumban.',
      ].filter(Boolean)
      return res.status(200).json({
        text: lines.join('\n'),
        proposals: [],
        result: result.result ?? null,
      })
    }

    const pending = await loadLatestPending(supabase, usuarioId)
    if (pending) {
      const proposal = pendingToProposal(pending)
      return res.status(200).json({
        text: proposalToReply(
          'Tienes una propuesta pendiente. Confirma o cancela antes de seguir.',
          proposal
        ),
        proposals: [proposal],
      })
    }

    if (!text) {
      return res.status(400).json({ error: 'Falta el mensaje.' })
    }

    const history = await loadHistory(supabase, waId)
    if (!history.some((m) => m.role === 'user' && m.content === text)) {
      history.push({ role: 'user', content: text.slice(0, 2000) })
    }

    const loopResult = await runGeminiChat({ actor, messages: history })
    let proposals = loopResult.proposals
    if (proposals.length > 1) {
      for (const extra of proposals.slice(1)) {
        try {
          await cancelPendingOp(actor, extra.id)
        } catch (error) {
          console.error('whatsapp-assistant cancel extra proposal', extra.id, error)
        }
      }
      proposals = proposals.slice(0, 1)
    }

    const clarification = loopResult.clarification
    let textOut = clipReply(loopResult.text || '')
    if (proposals[0]) {
      textOut = proposalToReply(textOut, proposals[0])
    } else if (clarification) {
      const options = clarification.options.map((opt) => `- ${opt.label}`).join('\n')
      textOut = clipReply(`${clarification.question}\n${options}`.trim())
    }
    if (!textOut) {
      textOut = 'No pude consultar el tablero ahora. Intenta de nuevo en un momento.'
    }

    return res.status(200).json({
      text: textOut,
      proposals,
      clarification: clarification ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.'
    console.error('whatsapp-assistant', message)
    if (/expiro|cancelada|cambio despues|no te pertenece|no encontr/i.test(message)) {
      return res.status(200).json({ text: message.slice(0, 240), proposals: [] })
    }
    const status = typeof (error as { status?: number }).status === 'number' ? (error as { status: number }).status : 0
    if (isGeminiCapacityStatus(status) || status === 0) {
      return res.status(200).json({
        text: 'No pude consultar el tablero ahora. Intenta de nuevo en unos minutos.',
        proposals: [],
      })
    }
    return res.status(200).json({
      text: 'No pude consultar el tablero ahora.',
      proposals: [],
    })
  }
})
