import { COPILOT_READ_TOOLS, COPILOT_WRITE_TOOLS } from './types'

type GeminiSchema = {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  description?: string
  enum?: string[]
  properties?: Record<string, GeminiSchema>
  required?: string[]
  items?: GeminiSchema
}

export type GeminiFunctionDeclaration = {
  name: string
  description: string
  parameters: GeminiSchema
}

const actionQueryProps: Record<string, GeminiSchema> = {
  action_id: { type: 'string', description: 'UUID de la accion si ya se conoce.' },
  query: { type: 'string', description: 'Titulo o fragmento para buscar la accion.' },
}

export const COPILOT_FUNCTION_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'get_my_actions',
    description:
      'Consulta acciones autorizadas del usuario. Filtros: open, overdue, due_week, stale, blocked, verification.',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['open', 'overdue', 'due_week', 'stale', 'blocked', 'verification'],
        },
        limit: { type: 'number', description: 'Maximo 12.' },
      },
    },
  },
  {
    name: 'get_action_details',
    description: 'Detalle de una accion visible: estado, checklist, comentarios y evidencia esperada.',
    parameters: {
      type: 'object',
      properties: actionQueryProps,
      required: [],
    },
  },
  {
    name: 'get_team_actions',
    description:
      'Retrasos y bloqueos de otras personas. Solo si el usuario tiene vista de tablero completo.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_pending_verifications',
    description: 'Acciones en Hecho pendientes de verificacion relacionadas con el usuario.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_okr_progress',
    description: 'Resumen de OKRs autorizados. Solo lectura.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'search_people',
    description: 'Busca usuarios activos por nombre para asignar. Si hay varios, no elijas: pide aclaracion.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre o fragmento.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_action',
    description:
      'Propone crear una accion. No la ejecuta. Requiere titulo y fecha. Si el responsable es ambiguo, no inventes.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        due_hint: { type: 'string', description: 'Fecha en lenguaje natural o YYYY-MM-DD.' },
        due_time: { type: 'string', description: 'HH:MM opcional.' },
        assignee_id: { type: 'string' },
        assignee_name: { type: 'string' },
        priority: { type: 'string', enum: ['P1_Critica', 'P2_Media', 'P3_Baja'] },
        evidence_expected: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_action',
    description:
      'Propone actualizar fecha, hora, responsable, prioridad o descripcion. No existe campo de porcentaje de avance.',
    parameters: {
      type: 'object',
      properties: {
        ...actionQueryProps,
        fecha: { type: 'string' },
        hora_limite: { type: 'string' },
        due_hint: { type: 'string' },
        assignee_id: { type: 'string' },
        assignee_name: { type: 'string' },
        prioridad: { type: 'string', enum: ['P1_Critica', 'P2_Media', 'P3_Baja'] },
        descripcion_accion: { type: 'string' },
      },
    },
  },
  {
    name: 'add_action_comment',
    description: 'Propone agregar un comentario a una accion visible.',
    parameters: {
      type: 'object',
      properties: {
        ...actionQueryProps,
        comment: { type: 'string' },
      },
      required: ['comment'],
    },
  },
  {
    name: 'update_checklist_item',
    description: 'Propone marcar un punto del checklist. Usa item_index (1-based) o checkpoint_id.',
    parameters: {
      type: 'object',
      properties: {
        ...actionQueryProps,
        checkpoint_id: { type: 'string' },
        item_index: { type: 'number' },
        completed: { type: 'boolean' },
      },
    },
  },
  {
    name: 'mark_action_done',
    description:
      'Propone marcar Hecho. No verifica. Si falta checklist, informa evidencias faltantes y no propongas cierre.',
    parameters: {
      type: 'object',
      properties: actionQueryProps,
    },
  },
  {
    name: 'verify_action',
    description:
      'Propone verificar una accion en Hecho. Solo el creador o un rol autorizado. Nunca verifiques solo porque el responsable dijo que termino.',
    parameters: {
      type: 'object',
      properties: actionQueryProps,
    },
  },
]

export const COPILOT_TOOL_NAMES = [...COPILOT_READ_TOOLS, ...COPILOT_WRITE_TOOLS] as const

export function isCopilotWriteTool(name: string): name is (typeof COPILOT_WRITE_TOOLS)[number] {
  return (COPILOT_WRITE_TOOLS as readonly string[]).includes(name)
}

export function isCopilotReadTool(name: string): name is (typeof COPILOT_READ_TOOLS)[number] {
  return (COPILOT_READ_TOOLS as readonly string[]).includes(name)
}
