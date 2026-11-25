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
  r2OptionsFromServerEnv,
  serializeToolResultForModel,
  type CopilotActor,
} from './_shared/assistantOpsRuntime.js'
import { inferAiConfirmText } from './_shared/whatsappAiConfirm.js'
import { composeSystemPrompt, sanitizeMessages } from '../src/lib/assistantPrompts.js'
import type { CopilotProposal } from '../src/features/ai-support/copilot/types.js'
import { COPILOT_FUNCTION_DECLARATIONS, isCopilotReadTool } from '../src/features/ai-support/copilot/catalog.js'
import { proposalFromPendingRow } from './_shared/assistantGoogleTools.js'
import { runChannelTurn } from './_shared/orchestrator/channelAdapters.js'
import {
  isWhatsAppR2ButtonsAllowedForUser,
  isWhatsAppVoiceNotesAllowedForUser,
  shouldUseWhatsAppOrchestrator,
} from './_shared/whatsappPilotGate.js'
import { R2_EXECUTION_DISABLED_MESSAGE, resolveR2ExecutionMode } from './_shared/actions/executionMode.js'
import { editR2PendingOp } from './_shared/actions/r2Runtime.js'
import {
  buildProposalBinding,
  buildWhatsAppInteractiveProposalButtons,
  formatWhatsAppProposalPrompt,
  formatWhatsAppR2ExecutionResult,
  isBoardWriteToolGatedByR2,
  parseWhatsAppApprovalIntent,
  resolveWhatsAppProposalApproval,
  type WhatsAppProposalBinding,
} from './_shared/whatsappR2Adapter.js'
import {
  fetchWhatsAppMediaFromGraph,
  processWhatsAppVoiceNote,
} from './_shared/whatsappVoiceNotes.js'
import { normalizeReplyAudioMode } from './_shared/whatsappAudioReply.js'

const WHATSAPP_READ_ONLY_DECLARATIONS = COPILOT_FUNCTION_DECLARATIONS.filter((d) =>
  isCopilotReadTool(d.name)
)

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
CANAL WHATSAPP (SOLO LECTURA):
- Responde en espanol, corto (maximo 900 caracteres).
- No uses markdown ni simbolos # *.
- No inventes telefonos, usuarios ni estados.
- Consulta los datos del tablero disponibles para la cuenta vinculada. Usa get_module_data para modulos especificos y search_board para buscar registros en el tablero.
- Responde a la consulta mas reciente. Un borrador que aparezca en el historial no impide hacer una consulta nueva.
- NO crees ni actualices acciones, checkpoints, correos ni eventos desde este canal.
- Si el usuario pide modificar/cerrar/actualizar una tarea, responde preguntando: Quieres actualizar esa tarea? y deja claro que use los botones del recordatorio (Realizada / En proceso / Requiero apoyo) o confirme el handoff.
- Si no tiene permiso para un modulo, dilo. No inventes cifras.
`.trim()

function detectTaskUpdateHandoff(userText: string, assistantText: string): boolean {
  const blob = `${userText}\n${assistantText}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const userWantsWrite =
    /\b(marca|marcar|actualiza|actualizar|cambia|cambiar|cierra|cerrar|completa|completar|pon como hecho|pasala a)\b/.test(
      blob
    )
  const offered =
    /\bquieres actualizar\b/.test(blob) ||
    /\bactualizar esa tarea\b/.test(blob) ||
    /\bbotones del recordatorio\b/.test(blob)
  return userWantsWrite || offered
}

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
  preview: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  expected_updated_at?: string | null
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

function pendingToProposal(row: PendingPreview): CopilotProposal {
  return proposalFromPendingRow({
    id: row.id,
    tool: row.tool,
    preview: (row.preview ?? {}) as Record<string, unknown>,
    expires_at: row.expires_at,
  })
}

async function loadActivePendingList(
  supabase: SupabaseClient,
  usuarioId: string
): Promise<PendingPreview[]> {
  const { data } = await supabase
    .from('assistant_pending_ops')
    .select('id,tool,preview,payload,expected_updated_at,expires_at,status')
    .eq('usuario_id', usuarioId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5)
  if (!Array.isArray(data)) return []
  return data
    .filter((row) => Boolean(row?.id))
    .map((row) => ({
      id: String(row.id),
      tool: String(row.tool ?? ''),
      preview: row.preview && typeof row.preview === 'object' ? (row.preview as Record<string, unknown>) : null,
      payload: row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : null,
      expected_updated_at: typeof row.expected_updated_at === 'string' ? row.expected_updated_at : null,
      expires_at: String(row.expires_at),
    }))
}

function bindingFromPending(usuarioId: string, row: PendingPreview): WhatsAppProposalBinding {
  const proposal = pendingToProposal(row)
  return buildProposalBinding({
    proposalId: row.id,
    usuarioId,
    operation: row.tool,
    scope: row.tool,
    summary: proposal.summary || proposal.title || 'Operación pendiente',
    payload: row.payload ?? row.preview,
    expectedUpdatedAt: row.expected_updated_at ?? null,
    expiresAt: row.expires_at,
  })
}

async function hydrateProposalBindings(
  supabase: SupabaseClient,
  usuarioId: string,
  proposalList: ReadonlyArray<CopilotProposal | { operation: string; payload: unknown }>,
  turnSummary: string,
  batchId: string | null
): Promise<Array<{ binding: WhatsAppProposalBinding; proposal: CopilotProposal | null }>> {
  const persistedIds = proposalList
    .filter((p): p is CopilotProposal => !('operation' in p) && Boolean(p.id))
    .map((p) => p.id)

  const rowById = new Map<string, PendingPreview>()
  if (persistedIds.length > 0) {
    const { data } = await supabase
      .from('assistant_pending_ops')
      .select('id,tool,preview,payload,expected_updated_at,expires_at')
      .eq('usuario_id', usuarioId)
      .in('id', persistedIds)
    if (Array.isArray(data)) {
      for (const row of data) {
        if (!row?.id) continue
        rowById.set(String(row.id), {
          id: String(row.id),
          tool: String(row.tool ?? ''),
          preview: row.preview && typeof row.preview === 'object' ? (row.preview as Record<string, unknown>) : null,
          payload: row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : null,
          expected_updated_at: typeof row.expected_updated_at === 'string' ? row.expected_updated_at : null,
          expires_at: String(row.expires_at),
        })
      }
    }
  }

  return proposalList.map((proposal) => {
    if ('operation' in proposal) {
      return {
        proposal: null,
        binding: buildProposalBinding({
          proposalId: `draft-${proposal.operation}`,
          usuarioId,
          operation: proposal.operation,
          scope: proposal.operation,
          summary: turnSummary || `Propuesta ${proposal.operation}`,
          payload: proposal.payload as Record<string, unknown>,
          batchId,
        }),
      }
    }
    const row = rowById.get(proposal.id)
    const binding = row
      ? { ...bindingFromPending(usuarioId, row), batchId }
      : buildProposalBinding({
          proposalId: proposal.id,
          usuarioId,
          operation: proposal.tool,
          scope: proposal.tool,
          summary: proposal.summary || proposal.title,
          payload: null,
          expiresAt: proposal.expiresAt,
          batchId,
        })
    return { proposal, binding }
  })
}

async function loadHistory(supabase: SupabaseClient, waId: string, usuarioId: string) {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('direction,source,body_text,created_at')
    .eq('wa_id', waId)
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  const newestFirst = data ?? []
  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = []
  let chars = 0
  for (const row of newestFirst) {
    const content = typeof row.body_text === 'string' ? row.body_text.trim() : ''
    if (!content) continue
    const role: 'user' | 'assistant' = row.direction === 'inbound' ? 'user' : 'assistant'
    if (role === 'assistant' && row.source === 'ai' &&
      (content.startsWith('Prepare este borrador de Google.') || content.startsWith('Prepare esta propuesta.'))) continue
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
        functionDeclarations: WHATSAPP_READ_ONLY_DECLARATIONS,
        readOnly: true,
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
    button_id?: unknown
    version?: unknown
    media_id?: unknown
    mime_type?: unknown
    duration_seconds?: unknown
    prefer_voice_reply?: unknown
    reply_audio_mode?: unknown
  }
  const usuarioId = typeof payload.usuario_id === 'string' ? payload.usuario_id.trim() : ''
  const waId = typeof payload.wa_id === 'string' ? payload.wa_id.trim() : ''
  let text = typeof payload.text === 'string' ? payload.text.trim() : ''
  const buttonId = typeof payload.button_id === 'string' ? payload.button_id.trim() : ''
  let boundVersion = typeof payload.version === 'string' ? payload.version.trim().toUpperCase() : ''
  let action =
    payload.action === 'confirm' ||
    payload.action === 'cancel' ||
    payload.action === 'chat' ||
    payload.action === 'voice_note'
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
  const pilotIdentity = {
    usuarioId,
    waId,
    active: usuario.activo === true,
    aiAuthorized: allowed === true,
  }

  if (action === 'voice_note') {
    if (!isWhatsAppVoiceNotesAllowedForUser(pilotIdentity)) {
      return res.status(200).json({
        text: 'Las notas de voz por WhatsApp aún no están habilitadas para tu cuenta. Escríbeme tu consulta en texto.',
        transcript: null,
        replyMode: 'text',
        audioDelivery: null,
        audioRetained: false,
        proposals: [],
      })
    }
    const mediaId = typeof payload.media_id === 'string' ? payload.media_id.trim() : ''
    const mimeType = typeof payload.mime_type === 'string' ? payload.mime_type.trim() : null
    const durationSeconds =
      typeof payload.duration_seconds === 'number' && Number.isFinite(payload.duration_seconds)
        ? payload.duration_seconds
        : null
    const accessToken = readStringEnv('WHATSAPP_ACCESS_TOKEN')
    const graphVersion = readStringEnv('WHATSAPP_GRAPH_VERSION', 'v20.0')
    const recentHistory = await loadHistory(supabase, waId, usuarioId)
    const replyAudioMode =
      payload.reply_audio_mode !== undefined
        ? normalizeReplyAudioMode(payload.reply_audio_mode)
        : payload.prefer_voice_reply === true
          ? 'audio'
          : 'text'
    let voiceInteractiveButtons: ReturnType<typeof buildWhatsAppInteractiveProposalButtons> = []
    const voiceResult = await processWhatsAppVoiceNote(
      {
        waId,
        usuarioId,
        active: usuario.activo !== false,
        aiAuthorized: allowed === true,
        replyAudioMode,
      },
      { mediaId, mimeType, durationSeconds },
      {
        fetchMetaMedia: (id) =>
          fetchWhatsAppMediaFromGraph({ mediaId: id, accessToken, graphVersion }),
        conversationContext: {
          recentTurns: recentHistory.slice(-4).map((m) => ({
            role: m.role,
            content: m.content,
            modality: 'text',
          })),
        },
        runAssistant: async ({ transcript }) => {
          if (shouldUseWhatsAppOrchestrator(pilotIdentity)) {
            const turn = await runChannelTurn({
              identity: {
                supabase,
                authUserId: actor.authUserId,
                usuarioId,
                rol: actor.rol,
                active: usuario.activo !== false,
              },
              channel: 'whatsapp',
              sessionId: waId,
              utterance: transcript.slice(0, 2000),
            })
            if (turn.handled) {
              const mode = resolveR2ExecutionMode()
              const proposalList = turn.proposals?.length
                ? turn.proposals
                : turn.proposal
                  ? [turn.proposal]
                  : []
              if (turn.intent === 'write_request' && proposalList.length > 0) {
                const hydrated = await hydrateProposalBindings(
                  supabase,
                  usuarioId,
                  proposalList,
                  turn.response.blocks.data[0] ?? '',
                  turn.batchId ?? null
                )
                if (hydrated.length === 1) {
                  voiceInteractiveButtons = buildWhatsAppInteractiveProposalButtons(hydrated[0]!.binding, mode)
                }
                const body = hydrated
                  .map(({ binding, proposal }) =>
                    formatWhatsAppProposalPrompt(binding, { executionMode: mode, proposal })
                  )
                  .join('\n\n')
                return { text: clipReply(body) }
              }
              const options = turn.clarification?.options.map((opt) => `- ${opt.label}`).join('\n')
              return { text: clipReply(options ? `${turn.text}\n${options}` : turn.text) }
            }
          }
          const history = [...recentHistory, { role: 'user' as const, content: transcript.slice(0, 2000) }]
          const loop = await runGeminiChat({ actor, messages: history })
          return { text: clipReply(loop.text || 'No pude consultar el tablero ahora.') }
        },
        voiceReplyEnabled: readStringEnv('WHATSAPP_VOICE_REPLY_ENABLED') === '1',
      }
    )
    return res.status(200).json({
      text: clipReply(voiceResult.replyText),
      transcript: voiceResult.ok ? voiceResult.transcript : null,
      replyMode: voiceResult.ok ? voiceResult.replyMode : 'text',
      audioDelivery: voiceResult.ok ? voiceResult.audioDelivery : null,
      audioRetained: voiceResult.audioRetained,
      interactiveButtons: voiceInteractiveButtons,
      proposals: [],
    })
  }

  if (buttonId && /^(?:r2_confirm|r2_edit|r2_cancel):/i.test(buttonId) && !isWhatsAppR2ButtonsAllowedForUser(pilotIdentity)) {
    return res.status(200).json({
      text: 'Esta función aún no está habilitada para tu cuenta.',
      proposals: [],
    })
  }

  // TODA aprobación/cancelación/edición por texto o botón pasa por el adaptador R2 estricto.
  // Ninguna ruta legacy (incluyendo "sí" suelto con 1 sola propuesta) puede evadir las compuertas R2.
  const r2Decision =
    action === 'chat' ? parseWhatsAppApprovalIntent({ text, buttonId }) : { kind: 'none' as const }
  let resolvedBinding: WhatsAppProposalBinding | null = null
  if (r2Decision.kind !== 'none') {
    const activeRows = await loadActivePendingList(supabase, usuarioId)
    const bindings = activeRows.map((row) => bindingFromPending(usuarioId, row))
    const resolution = resolveWhatsAppProposalApproval({
      actorUsuarioId: usuarioId,
      actorActive: usuario.activo !== false,
      pending: bindings,
      decision: r2Decision,
      executionMode: resolveR2ExecutionMode(),
    })
    if (resolution.status === 'ready_to_execute') {
      action = 'confirm'
      opId = resolution.binding.proposalId
      boundVersion = resolution.binding.version
      resolvedBinding = resolution.binding
    } else if (resolution.status === 'ready_to_cancel') {
      action = 'cancel'
      opId = resolution.binding.proposalId
      resolvedBinding = resolution.binding
    } else if (resolution.status === 'ready_to_edit') {
      const executionMode = resolveR2ExecutionMode()
      if (executionMode === 'disabled') {
        return res.status(200).json({
          text: clipReply(R2_EXECUTION_DISABLED_MESSAGE),
          proposals: [],
          executionEnabled: false,
        })
      }
      try {
        const editedProposal = await editR2PendingOp(actor, resolution.binding.proposalId, resolution.patch)
        const hydrated = await hydrateProposalBindings(
          supabase,
          usuarioId,
          [editedProposal],
          editedProposal.summary || editedProposal.title,
          resolution.binding.batchId ?? null
        )
        const nextBinding = hydrated[0]!.binding
        const prompt = formatWhatsAppProposalPrompt(nextBinding, {
          executionMode,
          proposal: editedProposal,
        })
        return res.status(200).json({
          text: clipReply(`Propuesta actualizada (código previo ${resolution.binding.version} invalidado).\n\n${prompt}`),
          proposals: [],
          draftBinding: nextBinding,
          interactiveButtons: buildWhatsAppInteractiveProposalButtons(nextBinding, executionMode),
          executionEnabled: true,
        })
      } catch (editError) {
        const msg = editError instanceof Error ? editError.message : 'No se pudo actualizar la propuesta.'
        return res.status(200).json({
          text: clipReply(msg),
          proposals: [],
        })
      }
    } else if (resolution.status === 'edit_prompt') {
      return res.status(200).json({
        text: clipReply(resolution.message),
        proposals: [],
        draftBinding: resolution.binding,
      })
    } else {
      return res.status(200).json({
        text: clipReply(resolution.message),
        proposals: [],
      })
    }
  }

  // Legacy textDecision sólo admite cancelación explícita ("no") cuando hay exactamente 1 pendiente;
  // NUNCA ejecuta una confirmación por texto suelto.
  const legacyTextDecision = action === 'chat' ? inferAiConfirmText(text) : null
  if (legacyTextDecision === 'cancel') {
    const activeRows = await loadActivePendingList(supabase, usuarioId)
    if (activeRows.length === 1) {
      action = 'cancel'
      opId = activeRows[0]!.id
    } else if (activeRows.length > 1) {
      const list = activeRows
        .map((row) => {
          const b = bindingFromPending(usuarioId, row)
          return `- ${b.version}: ${b.summary}`
        })
        .join('\n')
      return res.status(200).json({
        text: clipReply(`Tienes ${activeRows.length} propuestas activas. Indica cuál cancelar con "cancelar <código>":\n${list}`),
        proposals: [],
      })
    }
  }

  try {
    if (action === 'confirm' || action === 'cancel') {
      const activeRows = await loadActivePendingList(supabase, usuarioId)
      const pendingRow = opId
        ? activeRows.find((row) => row.id === opId) ?? null
        : activeRows.length === 1
          ? activeRows[0]!
          : null
      if (!pendingRow?.id) {
        return res.status(200).json({
          text: 'No hay una propuesta pendiente vigente. Escribe tu consulta.',
          proposals: [],
        })
      }
      if (action === 'cancel') {
        await cancelPendingOp(actor, pendingRow.id)
        return res.status(200).json({ text: 'Listo, cancele la propuesta. No se cambio nada en el tablero.', proposals: [] })
      }

      const binding = resolvedBinding ?? bindingFromPending(usuarioId, pendingRow)
      if (boundVersion && binding.version !== boundVersion) {
        return res.status(200).json({
          text: 'La propuesta cambió de versión. Revisa el nuevo borrador antes de confirmar.',
          proposals: [],
        })
      }
      // Compuerta dura R2 OFF: ninguna escritura al tablero puede evadir R2_EXECUTION_MODE === 'disabled'.
      const executionMode = resolveR2ExecutionMode()
      if (isBoardWriteToolGatedByR2(pendingRow.tool) && executionMode === 'disabled') {
        return res.status(200).json({
          text: clipReply(R2_EXECUTION_DISABLED_MESSAGE),
          proposals: [],
          executionEnabled: false,
        })
      }

      const result = await confirmPendingOp(actor, pendingRow.id, { r2: r2OptionsFromServerEnv() })
      const created = result.result as {
        title?: string
        fecha?: string
        href?: string
        checkpoints?: number
        gmail_message_id?: string
        event_id?: string
      } | null
      if (created?.gmail_message_id) {
        return res.status(200).json({
          text: `Correo enviado desde tu Gmail.${created.href ? ` ${created.href}` : ''}`,
          proposals: [],
          result: result.result ?? null,
        })
      }
      if (created?.event_id) {
        return res.status(200).json({
          text: created.href ? `Evento actualizado en tu Calendar. ${created.href}` : 'Evento actualizado en tu Calendar.',
          proposals: [],
          result: result.result ?? null,
        })
      }
      if (isBoardWriteToolGatedByR2(pendingRow.tool)) {
        return res.status(200).json({
          text: clipReply(formatWhatsAppR2ExecutionResult(binding, result.result ?? null)),
          proposals: [],
          result: result.result ?? null,
        })
      }
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

    if (!text) {
      return res.status(400).json({ error: 'Falta el mensaje.' })
    }

    if (shouldUseWhatsAppOrchestrator(pilotIdentity)) {
      const turn = await runChannelTurn({
        identity: {
          supabase,
          authUserId: actor.authUserId,
          usuarioId,
          rol: actor.rol,
          active: usuario.activo !== false,
        },
        channel: 'whatsapp',
        sessionId: waId,
        utterance: text.slice(0, 2000),
      })
      if (turn.handled) {
        const mode = resolveR2ExecutionMode()
        const proposalList = turn.proposals?.length
          ? turn.proposals
          : turn.proposal
            ? [turn.proposal]
            : []
        if (turn.intent === 'write_request' && proposalList.length > 0) {
          const hydrated = await hydrateProposalBindings(
            supabase,
            usuarioId,
            proposalList,
            turn.response.blocks.data[0] ?? '',
            turn.batchId ?? null
          )
          const bindings = hydrated.map((h) => h.binding)
          const body = hydrated
            .map(({ binding, proposal }) =>
              formatWhatsAppProposalPrompt(binding, { executionMode: mode, proposal })
            )
            .join('\n\n')
          return res.status(200).json({
            text: clipReply(body),
            proposals: [],
            draftBinding: bindings[0] ?? null,
            draftBindings: bindings,
            interactiveButtons:
              bindings.length === 1 ? buildWhatsAppInteractiveProposalButtons(bindings[0]!, mode) : [],
            batchId: turn.batchId ?? null,
            executionEnabled: mode !== 'disabled',
            clarification: turn.clarification ?? null,
            handoff: null,
          })
        }
        // Respuesta manejada por el orquestador unificado (consulta, forbidden, aclaración o vacío): nunca evade a Gemini.
        const options = turn.clarification?.options.map((opt) => `- ${opt.label}`).join('\n')
        return res.status(200).json({
          text: clipReply(options ? `${turn.text}\n${options}` : turn.text),
          proposals: [],
          clarification: turn.clarification ?? null,
          handoff: null,
        })
      }
    }

    const history = await loadHistory(supabase, waId, usuarioId)
    const currentMessage = { role: 'user' as const, content: text.slice(0, 2000) }
    const lastMessage = history.at(-1)
    if (lastMessage?.role !== 'user' || lastMessage.content !== currentMessage.content) {
      history.push(currentMessage)
    }

    const loopResult = await runGeminiChat({ actor, messages: history })
    // QUERY read-only: no crear propuestas nuevas desde WhatsApp.
    for (const extra of loopResult.proposals) {
      try {
        await cancelPendingOp(actor, extra.id)
      } catch (error) {
        console.error('whatsapp-assistant cancel read-only proposal', extra.id, error)
      }
    }

    const clarification = loopResult.clarification
    let textOut = clipReply(loopResult.text || '')
    if (clarification) {
      const options = clarification.options.map((opt) => `- ${opt.label}`).join('\n')
      textOut = clipReply(`${clarification.question}\n${options}`.trim())
    }
    if (!textOut) {
      textOut = 'No pude consultar el tablero ahora. Intenta de nuevo en un momento.'
    }

    const handoff = detectTaskUpdateHandoff(text, textOut) ? 'task_update' : null
    if (handoff && !/quieres actualizar/i.test(textOut)) {
      textOut = clipReply(
        `${textOut}\n\nSi quieres actualizar esa tarea, usa los botones del recordatorio o responde Realizada / En proceso / Requiero apoyo.`
      )
    }

    return res.status(200).json({
      text: textOut,
      proposals: [],
      clarification: clarification ?? null,
      handoff,
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
