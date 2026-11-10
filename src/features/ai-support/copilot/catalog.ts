import { COPILOT_READ_TOOLS, COPILOT_WRITE_TOOLS } from './types.js'

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
      'Consulta acciones corporativas autorizadas del usuario. overdue usa la columna Retraso (fecha y hora en CDMX) y no incluye Bloqueado. verification son acciones en Hecho, que no equivalen a Verificado. Si truncated es true, la lista está recortada.',
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
      'Retrasos y bloqueos de otras personas del tablero corporativo. Disponible si el usuario no es Analista (vista amplia de acciones).',
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
    description:
      'Resumen de OKRs autorizados con el mismo avance que el modulo. progress null significa sin datos suficientes, no cero. pace bajo_ritmo compara el avance medible con el tiempo transcurrido; sin_datos no es una causa inventada. without_initiatives no cambia el porcentaje. truncated indica recorte.',
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
    name: 'get_dashboard_summary',
    description:
      'Resumen del dashboard BAU de acciones corporativas. Vencida, bloqueada, Hecho (pendiente de verificar) y Verificado son conteos distintos. El avance puede venir null cuando faltan datos. Incluye alcance, zona horaria y truncated si el lote de 400 filas se llenó. Solo si el usuario puede ver /dashboard.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_org_chart',
    description:
      'Organigrama: personas, a quien reportan y equipo directo. Filtro opcional por nombre. Solo si el usuario puede ver /organigrama.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre o fragmento para enfocar a una persona.' },
      },
    },
  },
  {
    name: 'get_module_data',
    description:
      'Lee un modulo del tablero que el usuario tenga permiso de ver: kpis, gaps, impacto, tickets, team_kanban, calendar, challenges, notifications, sprints, strategy, disciplina, academy, areas, plan_accion, reports, distancias, okrs, dashboard u org_chart.',
    parameters: {
      type: 'object',
      properties: {
        module: {
          type: 'string',
          enum: [
            'dashboard',
            'kpis',
            'gaps',
            'impacto',
            'org_chart',
            'tickets',
            'team_kanban',
            'calendar',
            'challenges',
            'notifications',
            'sprints',
            'strategy',
            'disciplina',
            'academy',
            'areas',
            'plan_accion',
            'reports',
            'distancias',
            'okrs',
          ],
        },
        query: { type: 'string', description: 'Filtro opcional: nombre, titulo o fecha YYYY-MM-DD.' },
      },
      required: ['module'],
    },
  },
  {
    name: 'search_board',
    description:
      'Busca texto en el tablero (acciones, personas, tickets, KPIs, gaps, retos, organigrama, OKRs, kanban equipos) solo en modulos autorizados para el usuario.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'create_action',
    description:
      'Propone crear UNA accion corporativa. No la ejecuta ni avisa por WhatsApp. Pasa request con el texto del usuario. No inventes hechos, evidencia ni checkpoints que no haya pedido. Si el nombre es ambiguo, no elijas. Si pide varias, llama esta herramienta una vez por accion. Si solo pide una recomendacion, no llames esta herramienta.',
    parameters: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'Pedido original del usuario.' },
        title: { type: 'string' },
        description: { type: 'string' },
        due_hint: { type: 'string', description: 'Fecha en lenguaje natural o YYYY-MM-DD. Obligatoria.' },
        due_time: { type: 'string', description: 'HH:MM opcional.' },
        assignee_id: { type: 'string' },
        assignee_name: { type: 'string' },
        priority: { type: 'string', enum: ['P1_Critica', 'P2_Media', 'P3_Baja'] },
        evidence_expected: { type: 'string' },
        checkpoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Hasta 4 pasos que el usuario pidio. No los marques completos.',
        },
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
