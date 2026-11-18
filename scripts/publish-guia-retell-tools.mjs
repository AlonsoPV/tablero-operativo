/**
 * Actualiza y publica el agente Guia (RETELL_GUIDE_AGENT_ID):
 * - get_session_state → Vercel /api/guide-session-state
 * - custom function scrumban → Vercel /api/guide-retell-tool
 * - queue_workspace_draft → Vercel /api/guide-queue-workspace-draft
 * - webhook_url → Vercel /api/guide-retell-webhook
 * - steering A–D comunicaciones + work_intent action|whatsapp|email (prompt_version enviardian-voz-2026-11-17-intents)
 * No toca RETELL_AGENT_ID.
 *
 * Publicar remoto exige GUIDE_RETELL_PUBLISH_OK=1 (autorización explícita).
 * Sin esa variable: dry-run (imprime el payload y sale 0).
 */
import { loadDotenv } from './_load-dotenv.mjs'

loadDotenv(import.meta.url)

const API = 'https://api.retellai.com'
const configuredApp = process.env.GUIDE_RETELL_APP_URL?.trim()
const appUrl = new URL(configuredApp || 'https://sandbox.example.com')
if (appUrl.protocol !== 'https:' || appUrl.pathname !== '/' || appUrl.search ||
    appUrl.hash || appUrl.username || appUrl.password) {
  throw new Error('GUIDE_RETELL_APP_URL debe ser un origen HTTPS, sin ruta ni credenciales.')
}
const APP = appUrl.origin
const key = process.env.RETELL_API_KEY
const agentId = process.env.RETELL_GUIDE_AGENT_ID
const toolSecret = process.env.GUIDE_RETELL_TOOL_SECRET
const publishOk = process.env.GUIDE_RETELL_PUBLISH_OK === '1'
const PROMPT_VERSION = 'enviardian-voz-2026-11-17-comms-intents'

if (publishOk && (!configuredApp || !key || !agentId || !toolSecret)) {
  console.error('Para publicar define GUIDE_RETELL_APP_URL, RETELL_API_KEY, RETELL_GUIDE_AGENT_ID y GUIDE_RETELL_TOOL_SECRET.')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
}

async function retell(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!response.ok) {
    const err = new Error(`${method} ${path} → ${response.status}`)
    err.payload = json
    throw err
  }
  return json
}

const SCRUMBAN = {
  tool_id: 'tool_scrumban',
  type: 'custom',
  name: 'scrumban',
  description:
    'Consulta o propone cambios en el tablero Scrumban del usuario de esta sesion. ' +
    'Prefiere tool=get_my_actions|get_okr_progress|get_dashboard_summary|get_action_details|' +
    'get_team_actions|get_pending_verifications|search_people. ' +
    'Para preparar WhatsApp usa whatsapp_prepare_send con recipient y body. Si piden acciones vencidas, usa include_overdue=true. Para estado usa get_whatsapp_operation_status. Para correo de una acción al responsable usa notify_action_email. El envío se aprueba en la app. ' +
    'Evita search_board y get_module_data amplios salvo peticion explicita del usuario. ' +
    'Escrituras: create_action|update_action|add_action_comment|update_checklist_item|mark_action_done|verify_action. ' +
    'Para cambios de tablero que admiten confirmación verbal, usa confirm_pending_op con pending_op_id tras un sí explícito. Para comunicaciones, indica que el borrador se revisa en la app autenticada. ' +
    'Anuncia éxito solo si la herramienta lo confirma. Si falta un dato o hay error, comunica el resultado y continúa. No envíes usuario_id ni session_id.',
  url: `${APP}/api/guide-retell-tool`,
  method: 'POST',
  parameter_type: 'json',
  // false: Retell envía name + call (metadata/session) + args. Con true se pierde guide_session_id.
  args_at_root: false,
  speak_after_execution: true,
  speak_during_execution: true,
  execution_message_type: 'static_text',
  execution_message_description: 'Un momento, consulto el tablero.',
  timeout_ms: 30000,
  headers: {
    'x-guide-tool-secret': toolSecret,
  },
  query_params: {},
  parameters: {
    type: 'object',
    required: ['tool'],
    properties: {
      tool: {
        type: 'string',
        description:
          'Nombre de la herramienta. Preferir get_my_actions, get_okr_progress o get_dashboard_summary.',
      },
      filter: { type: 'string', description: 'Filtro opcional (open, done, etc.).' },
      query: { type: 'string', description: 'Texto de busqueda.' },
      recipient: { type: 'string', description: 'Nombre de la persona o yo para whatsapp_prepare_send.' },
      body: { type: 'string', description: 'Mensaje o introducción para whatsapp_prepare_send.' },
      include_overdue: { type: 'boolean', description: 'Agrega acciones vencidas asignadas al destinatario.' },
      mensaje: { type: 'string', description: 'Nota opcional para el responsable en el correo de una acción.' },
      action_id: { type: 'string', description: 'Id de accion cuando aplique.' },
      title: { type: 'string', description: 'Titulo para create_action u otras escrituras.' },
      comment: { type: 'string', description: 'Comentario cuando aplique.' },
      module: { type: 'string', description: 'Modulo para get_module_data (solo si el usuario lo pide).' },
      objective: { type: 'string', description: 'Objetivo o contexto opcional.' },
      priority: { type: 'string', description: 'Prioridad opcional P1_Alta|P2_Media|P3_Baja.' },
      due_date: { type: 'string', description: 'Fecha opcional YYYY-MM-DD.' },
      owner_hint: { type: 'string', description: 'Pista de responsable opcional.' },
      description: { type: 'string', description: 'Descripcion opcional.' },
      pending_op_id: {
        type: 'string',
        description: 'ID de propuesta para consultar estado WhatsApp o confirmar o descartar una operación de tablero.',
      },
    },
  },
}

const QUEUE_WORKSPACE_DRAFT = {
  tool_id: 'tool_queue_workspace_draft',
  type: 'custom',
  name: 'queue_workspace_draft',
  description:
    'Encola, actualiza o cancela borradores de WhatsApp y eventos para revisión al terminar. Para correo de acciones usa scrumban tool=notify_action_email. ' +
    'Nunca envia. Usa action=prepare|update|cancel. Reutiliza pending_op_id al actualizar/cancelar. ' +
    'Para preparar usa channel=whatsapp|event. Si el canal no está claro, pregunta antes de llamar. ' +
    'No uses esta tool ante menciones informativas (mejorar WhatsApp, nunca revisa correos).',
  url: `${APP}/api/guide-queue-workspace-draft`,
  method: 'POST',
  parameter_type: 'json',
  args_at_root: false,
  speak_after_execution: true,
  speak_during_execution: true,
  execution_message_type: 'static_text',
  execution_message_description: 'Un segundo, lo anoto.',
  timeout_ms: 15000,
  headers: {},
  query_params: {},
  parameters: {
    type: 'object',
    required: ['action', 'channel'],
    properties: {
      action: {
        type: 'string',
        description: 'prepare | update | cancel',
      },
      channel: {
        type: 'string',
        description: 'whatsapp | event. email se conserva para cancelar borradores anteriores.',
      },
      purpose: { type: 'string', description: 'Propósito del mensaje o evento. Requerido para preparar o actualizar.' },
      recipient: { type: 'string', description: 'Nombre o pista del destinatario.' },
      pending_op_id: {
        type: 'string',
        description: 'Id del borrador al actualizar o cancelar.',
      },
      content_instructions: {
        type: 'string',
        description: 'Tono o contenido pedido (corto).',
      },
      conversation_context: {
        type: 'string',
        description: 'Contexto corto de la conversacion (acuerdos).',
      },
      uttered_at: { type: 'string', description: 'ISO de cuando lo pidio el usuario.' },
      idempotency_key: { type: 'string', description: 'Clave estable para reintentos.' },
      time_anchor: { type: 'string', description: 'Ancla temporal para eventos.' },
      attendees: { type: 'string', description: 'Asistentes de evento (opcional).' },
    },
  },
}

const COMMS_STEERING = `
Comunicaciones (prompt_version=${PROMPT_VERSION}): interpreta intencion, no solo keywords.
Detecta el canal que el usuario pide durante la conversación, incluso si la llamada empezó en consulta.
Para WhatsApp usa scrumban tool=whatsapp_prepare_send con recipient y body. Si pide las acciones vencidas del destinatario, usa include_overdue=true.
Para correo de una acción usa notify_action_email. Los borradores quedan disponibles en el informe para revisión. Para cambios al contenido generado indica que puede editarlo allí.
Ante una mención informativa no prepares un mensaje. Si pide cancelar un WhatsApp pendiente, usa queue_workspace_draft con action=cancel y su pending_op_id.
Canal ambiguo: pregunta WhatsApp o correo antes de encolar. Confirma solo si tool ok. No envies ni leas borradores largos en la llamada.
work_intent: consult|action|whatsapp|email (create legacy = action).
Reserva confirm_pending_op para cambios de tablero que admiten aprobación verbal. La aprobación de envíos se hace en la app autenticada.
Para correo de una acción al responsable usa scrumban tool=notify_action_email con action_id o query.
Para consultar el estado de un WhatsApp usa scrumban tool=get_whatsapp_operation_status con pending_op_id.
Si la herramienta pide aclarar o devuelve error, dilo en una frase y sigue la conversación.
Variables: work_intent, consult_instruction, work_instruction, prompt_version.
`.trim()

if (!publishOk) {
  console.log(
    JSON.stringify(
      {
        dry_run: true,
        reason: 'Falta GUIDE_RETELL_PUBLISH_OK=1. No se publica ni se crea draft remoto.',
        prompt_version: PROMPT_VERSION,
        app_url: APP,
        webhook_url: APP + '/api/guide-retell-webhook',
        tools: [SCRUMBAN, QUEUE_WORKSPACE_DRAFT].map(({ headers, ...tool }) => ({
          ...tool,
          header_names: Object.keys(headers),
        })),
        global_prompt_appendix: COMMS_STEERING,
      },
      null,
      2
    )
  )
  process.exit(0)
}

const agent = await retell('GET', `/get-agent/${agentId}`)
const flowId = agent.response_engine?.conversation_flow_id
const baseVersion = Number(agent.version ?? agent.response_engine?.version ?? 0)
if (!flowId) {
  console.error('El agente Guia no tiene conversation_flow_id')
  process.exit(1)
}
if (!Number.isFinite(baseVersion) || baseVersion < 0) {
  console.error('No pude resolver la version base del agente', agent.version)
  process.exit(1)
}

console.log('CREATE draft from version', baseVersion)
const draftAgent = await retell('POST', `/create-agent-version/${agentId}`, {
  base_version: baseVersion,
})
const draftVersion = Number(draftAgent.version ?? 0)
if (!Number.isFinite(draftVersion) || draftVersion <= 0) {
  console.error('No pude resolver la version draft', draftAgent)
  process.exit(1)
}
console.log('draft version', draftVersion)

const flow = await retell('GET', `/get-conversation-flow/${flowId}?version=${draftVersion}`)
const clock = (flow.tools || []).find((t) => t.name === 'get_session_state')
if (!clock) {
  console.error('No existe get_session_state en el flow')
  process.exit(1)
}

const nextClock = {
  ...clock,
  url: `${APP}/api/guide-session-state`,
  headers: {
    ...(clock.headers || {}),
    'x-guide-tool-secret': toolSecret,
  },
  method: 'POST',
  timeout_ms: clock.timeout_ms || 15000,
  speak_after_execution: true,
  speak_during_execution: true,
  execution_message_type: 'static_text',
  execution_message_description: 'Un segundo.',
}

const otherTools = (flow.tools || []).filter(
  (t) =>
    t.name !== 'get_session_state' &&
    t.name !== 'scrumban' &&
    t.name !== 'queue_workspace_draft'
)
const existingQueue = (flow.tools || []).find((t) => t.name === 'queue_workspace_draft')
const nextQueue = {
  ...QUEUE_WORKSPACE_DRAFT,
  tool_id: existingQueue?.tool_id || QUEUE_WORKSPACE_DRAFT.tool_id,
}
const existingScrumban = (flow.tools || []).find((t) => t.name === 'scrumban')
const nextScrumban = { ...SCRUMBAN, tool_id: existingScrumban?.tool_id || SCRUMBAN.tool_id }
const tools = [...otherTools, nextClock, nextScrumban, nextQueue]

const nodeIdsWithClock = new Set(
  (flow.nodes || [])
    .filter((n) => Array.isArray(n.tool_ids) && n.tool_ids.includes(clock.tool_id))
    .map((n) => n.id)
)

const nodes = (flow.nodes || []).map((node) => {
  if (!nodeIdsWithClock.has(node.id) && node.type !== 'conversation') return node
  const ids = Array.isArray(node.tool_ids) ? [...node.tool_ids] : []
  if (nodeIdsWithClock.has(node.id) || ids.includes(clock.tool_id) || node.type === 'conversation') {
    if (!ids.includes(nextScrumban.tool_id)) ids.push(nextScrumban.tool_id)
    if (!ids.includes(nextQueue.tool_id)) ids.push(nextQueue.tool_id)
  }
  // No mutar node.instruction: en Retell es objeto estructurado, no string.
  return { ...node, tool_ids: ids }
})

const currentPrompt = typeof flow.global_prompt === 'string' ? flow.global_prompt : ''
const flowPatch = {
  tools,
  nodes,
  global_prompt: currentPrompt.includes(COMMS_STEERING)
    ? currentPrompt
    : [currentPrompt.trim(), COMMS_STEERING].filter(Boolean).join('\n\n'),
}

console.log('PATCH flow', flowId, 'version', draftVersion)
const updatedFlow = await retell(
  'PATCH',
  `/update-conversation-flow/${flowId}?version=${draftVersion}`,
  flowPatch
)
const toolNames = (updatedFlow.tools || tools).map((t) => `${t.name}@${t.url}`)
console.log('tools', toolNames)

console.log('PATCH agent webhook', agentId, 'version', draftVersion)
await retell('PATCH', `/update-agent/${agentId}?version=${draftVersion}`, {
  webhook_url: `${APP}/api/guide-retell-webhook`,
  webhook_events: ['call_ended', 'call_analyzed'],
})

console.log('PUBLISH agent-version', agentId, 'version', draftVersion)
const published = await retell('POST', `/publish-agent-version/${agentId}`, {
  version: draftVersion,
  version_title: `Guia voz: ${PROMPT_VERSION}`,
  version_description:
    'Comunicaciones A-D + queue_workspace_draft prepare/update/cancel; scrumban speak_during; reloj speak_during',
})
const verify = await retell('GET', `/get-agent/${agentId}`)
console.log(
  JSON.stringify(
    {
      agent_id: agentId,
      flow_id: flowId,
      published_version: verify.version,
      is_published: verify.is_published,
      webhook_url: verify.webhook_url,
      webhook_events: verify.webhook_events,
      clock_url: nextClock.url,
      scrumban_url: SCRUMBAN.url,
      queue_workspace_draft_url: nextQueue.url,
      prompt_version: PROMPT_VERSION,
      scrumban_args_at_root: SCRUMBAN.args_at_root,
      publish_response: published,
    },
    null,
    2
  )
)
