/**
 * Actualiza y publica el agente Guia (RETELL_GUIDE_AGENT_ID):
 * - get_session_state → Vercel /api/guide-session-state
 * - custom function scrumban → Vercel /api/guide-retell-tool
 * - webhook_url → Vercel /api/guide-retell-webhook
 * No toca RETELL_AGENT_ID.
 *
 * Publicar remoto exige GUIDE_RETELL_PUBLISH_OK=1 (autorización explícita).
 * Sin esa variable: dry-run (imprime el payload de scrumban y sale 0).
 */
import { loadDotenv } from './_load-dotenv.mjs'

loadDotenv(import.meta.url)

const API = 'https://api.retellai.com'
const APP = 'https://scrumbanemx.vercel.app'
const key = process.env.RETELL_API_KEY
const agentId = process.env.RETELL_GUIDE_AGENT_ID
const toolSecret = process.env.GUIDE_RETELL_TOOL_SECRET
const publishOk = process.env.GUIDE_RETELL_PUBLISH_OK === '1'

if (!key || !agentId || !toolSecret) {
  console.error('Faltan RETELL_API_KEY, RETELL_GUIDE_AGENT_ID o GUIDE_RETELL_TOOL_SECRET')
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
    'Evita search_board y get_module_data amplios salvo peticion explicita del usuario. ' +
    'Escrituras: create_action|update_action|add_action_comment|update_checklist_item|mark_action_done|verify_action. ' +
    'No inventes cifras: si falla o viene vacio, dilo. No envies usuario_id ni session_id.',
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
      action_id: { type: 'string', description: 'Id de accion cuando aplique.' },
      title: { type: 'string', description: 'Titulo para create_action u otras escrituras.' },
      comment: { type: 'string', description: 'Comentario cuando aplique.' },
      module: { type: 'string', description: 'Modulo para get_module_data (solo si el usuario lo pide).' },
      objective: { type: 'string', description: 'Objetivo o contexto opcional.' },
      priority: { type: 'string', description: 'Prioridad opcional P1_Alta|P2_Media|P3_Baja.' },
      due_date: { type: 'string', description: 'Fecha opcional YYYY-MM-DD.' },
      owner_hint: { type: 'string', description: 'Pista de responsable opcional.' },
      description: { type: 'string', description: 'Descripcion opcional.' },
    },
  },
}

if (!publishOk) {
  console.log(
    JSON.stringify(
      {
        dry_run: true,
        reason: 'Falta GUIDE_RETELL_PUBLISH_OK=1. No se publica ni se crea draft remoto.',
        before: {
          speak_during_execution: false,
          execution_message_type: null,
          execution_message_description: null,
        },
        after: {
          speak_during_execution: SCRUMBAN.speak_during_execution,
          execution_message_type: SCRUMBAN.execution_message_type,
          execution_message_description: SCRUMBAN.execution_message_description,
          speak_after_execution: SCRUMBAN.speak_after_execution,
          timeout_ms: SCRUMBAN.timeout_ms,
          args_at_root: SCRUMBAN.args_at_root,
          description_steering: 'prefer get_my_actions|get_okr_progress|get_dashboard_summary',
        },
        how_to_publish:
          'Autoriza y corre: GUIDE_RETELL_PUBLISH_OK=1 node scripts/publish-guia-retell-tools.mjs',
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

const otherTools = (flow.tools || []).filter((t) => t.name !== 'get_session_state' && t.name !== 'scrumban')
const tools = [...otherTools, nextClock, SCRUMBAN]

const nodeIdsWithClock = new Set(
  (flow.nodes || [])
    .filter((n) => Array.isArray(n.tool_ids) && n.tool_ids.includes('tool_get_session_state'))
    .map((n) => n.id)
)

const nodes = (flow.nodes || []).map((node) => {
  if (!nodeIdsWithClock.has(node.id) && node.type !== 'conversation') return node
  const ids = Array.isArray(node.tool_ids) ? [...node.tool_ids] : []
  if (nodeIdsWithClock.has(node.id) || ids.includes('tool_get_session_state')) {
    if (!ids.includes('tool_scrumban')) ids.push('tool_scrumban')
    return { ...node, tool_ids: ids }
  }
  return node
})

console.log('PATCH flow', flowId, 'version', draftVersion)
const updatedFlow = await retell(
  'PATCH',
  `/update-conversation-flow/${flowId}?version=${draftVersion}`,
  { tools, nodes }
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
  version_title: 'Guia voz: speak_during + steering slim',
  version_description:
    'scrumban speak_during_execution + mensaje espera; prefer get_my_actions/okr/dashboard; reloj speak_during',
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
      scrumban_args_at_root: SCRUMBAN.args_at_root,
      publish_response: published,
    },
    null,
    2
  )
)
