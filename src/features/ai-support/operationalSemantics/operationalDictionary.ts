/**
 * Diccionario semántico operativo Scrumban / Enviardián (SSOT).
 * Fuente de verdad versionada: código → doc. No glosarios JSON/YAML paralelos.
 */

export const OPERATIONAL_DICTIONARY_VERSION = 'ops-dict-2026-11-17-mvp'

export type OperationalModule = 'kanban' | 'okrs' | 'comms' | 'org' | 'cross'

export type OperationalOperation =
  | 'query'
  | 'propose_create'
  | 'propose_update'
  | 'prepare_comms'
  | 'recommend'
  | 'clarify'

export type OperationalTerm = {
  id: string
  businessName: string
  aliases: string[]
  module: OperationalModule
  entity: string
  definition: string
  /** Tabla.campo o recurso lógico real (no inventado). */
  schemaRef?: string
  /** Tool(s) canónicas. */
  tools?: string[]
  relations?: string[]
  interpretRules: string[]
  allowedOperations: OperationalOperation[]
  ambiguities?: string[]
}

/** Matriz auditoría MVP: término → entidad → esquema → tool. */
export type OperationalMatrixRow = {
  businessTerm: string
  entityId: string
  tableOrField: string
  tool: string
  notes?: string
}

export const OPERATIONAL_AUDIT_MATRIX: OperationalMatrixRow[] = [
  {
    businessTerm: 'acción / tarea / incidencia',
    entityId: 'kanban_action',
    tableOrField: 'acciones_diarias',
    tool: 'get_my_actions | create_action',
  },
  {
    businessTerm: 'iniciativa',
    entityId: 'okr_initiative',
    tableOrField: 'OKR initiatives (módulo okrs; no create_action)',
    tool: 'get_okr_progress',
    notes: 'Propuesta de creación de iniciativa: aclarar/usar flujo OKR; no create_action.',
  },
  {
    businessTerm: 'objetivo / OKR',
    entityId: 'okr_objective',
    tableOrField: 'módulo okrs',
    tool: 'get_okr_progress',
  },
  {
    businessTerm: 'KR / resultado clave',
    entityId: 'okr_key_result',
    tableOrField: 'módulo okrs',
    tool: 'get_okr_progress',
  },
  {
    businessTerm: 'responsable',
    entityId: 'role_responsable',
    tableOrField: 'acciones_diarias.responsable',
    tool: 'get_my_actions scope=assigned_to_me',
  },
  {
    businessTerm: 'creador',
    entityId: 'role_creador',
    tableOrField: 'acciones_diarias.created_by',
    tool: 'get_my_actions scope=created_by_me',
  },
  {
    businessTerm: 'verificador',
    entityId: 'role_verificador',
    tableOrField: 'acciones_diarias.verificador_dato | verificador_gobierno',
    tool: 'get_my_actions status_group=verification',
  },
  {
    businessTerm: 'asignador / solicitante',
    entityId: 'role_asignador_unmapped',
    tableOrField: '(sin columna dedicada)',
    tool: 'clarify | created_by como aproximación solo si el usuario dice «creé/asigné»',
    notes: 'No existe asignador distinto de created_by en el esquema actual.',
  },
  {
    businessTerm: 'rojo (tablero)',
    entityId: 'visual_board_red',
    tableOrField: 'priorityColorFor=rojo OR Retraso/overdue',
    tool: 'get_my_actions visual=board_red',
  },
  {
    businessTerm: 'prioridad roja',
    entityId: 'visual_priority_red',
    tableOrField: 'priorities.color / inferPriorityColor',
    tool: 'get_my_actions visual=priority_red',
  },
  {
    businessTerm: 'vencida / en retraso',
    entityId: 'visual_overdue',
    tableOrField: 'isCorporateOverdue / estado Retraso',
    tool: 'get_my_actions visual=overdue | status_group=overdue',
  },
  {
    businessTerm: 'BAU / dashboard / tablero',
    entityId: 'bau_dashboard',
    tableOrField: 'dashboard corporativo',
    tool: 'get_dashboard_summary',
    notes: 'Solo con alcance explícito; nunca para «mis acciones».',
  },
  {
    businessTerm: 'WhatsApp / correo',
    entityId: 'comms_draft',
    tableOrField: 'assistant_pending_ops',
    tool: 'queue_workspace_draft',
  },
]

export const OPERATIONAL_TERMS: OperationalTerm[] = [
  {
    id: 'kanban_action',
    businessName: 'Acción Kanban',
    aliases: [
      'accion',
      'acciones',
      'tarea',
      'tareas',
      'incidencia',
      'incidencias',
      'pendiente',
      'pendientes',
      'compromiso',
      'compromisos',
      'actividad',
      'actividades',
      'tarjeta',
    ],
    module: 'kanban',
    entity: 'acciones_diarias',
    definition: 'Unidad de trabajo operativo en Scrumban (Kanban / acciones diarias).',
    schemaRef: 'acciones_diarias',
    tools: ['get_my_actions', 'get_action_details', 'create_action', 'update_action'],
    relations: ['role_responsable', 'role_creador', 'role_verificador', 'okr_objective'],
    interpretRules: [
      'Por defecto «mis acciones» = responsable autenticado (assigned_to_me).',
      'No convertir automáticamente en iniciativa OKR.',
      'create_action propone; no ejecuta sin confirm_pending_op.',
    ],
    allowedOperations: ['query', 'propose_create', 'propose_update', 'recommend'],
    ambiguities: [
      '«acción para un objetivo» puede ser Kanban vinculada a OKR o iniciativa — aclarar una vez.',
    ],
  },
  {
    id: 'okr_objective',
    businessName: 'Objetivo OKR',
    aliases: ['okr', 'okrs', 'objetivo', 'objetivos'],
    module: 'okrs',
    entity: 'okr_objective',
    definition: 'Objetivo estratégico del módulo OKRs.',
    tools: ['get_okr_progress'],
    relations: ['okr_key_result', 'okr_initiative'],
    interpretRules: [
      'Consultas de avance usan get_okr_progress.',
      'No crear acciones Kanban cuando el usuario pide un objetivo.',
    ],
    allowedOperations: ['query', 'recommend'],
  },
  {
    id: 'okr_key_result',
    businessName: 'Resultado clave',
    aliases: ['kr', 'krs', 'key result', 'resultado clave', 'resultados clave'],
    module: 'okrs',
    entity: 'okr_key_result',
    definition: 'Resultado clave medible bajo un objetivo.',
    tools: ['get_okr_progress'],
    relations: ['okr_objective', 'okr_initiative'],
    interpretRules: ['No equivale a una acción Kanban.'],
    allowedOperations: ['query', 'recommend'],
  },
  {
    id: 'okr_initiative',
    businessName: 'Iniciativa OKR',
    aliases: ['iniciativa', 'iniciativas'],
    module: 'okrs',
    entity: 'okr_initiative',
    definition: 'Iniciativa estratégica del módulo OKRs (no es create_action).',
    tools: ['get_okr_progress'],
    relations: ['okr_objective', 'okr_key_result'],
    interpretRules: [
      '«Registra una iniciativa» → propose_create_initiative / flujo OKR, nunca create_action.',
      'No crear tarea Kanban cuando piden iniciativa.',
    ],
    allowedOperations: ['query', 'propose_create', 'recommend'],
    ambiguities: ['Sin contexto, «acción al objetivo» puede confundirse con iniciativa.'],
  },
  {
    id: 'bau_dashboard',
    businessName: 'Dashboard BAU / tablero',
    aliases: ['dashboard', 'bau', 'tablero', 'tablero corporativo', 'toda la org', 'organizacion'],
    module: 'org',
    entity: 'dashboard',
    definition: 'Resumen corporativo de acciones; no es «mis acciones».',
    tools: ['get_dashboard_summary', 'get_team_actions'],
    interpretRules: [
      'Solo con petición explícita de alcance amplio.',
      'Nunca responder «tengo/mis/responsable» con este resumen.',
    ],
    allowedOperations: ['query'],
  },
  {
    id: 'role_responsable',
    businessName: 'Responsable',
    aliases: [
      'responsable',
      'asignado',
      'me asignaron',
      'soy responsable',
      'mis acciones',
      'tengo',
      'yo',
      'mio',
      'mia',
      'mias',
      'mios',
    ],
    module: 'kanban',
    entity: 'usuario',
    definition: 'Persona con acciones_diarias.responsable = usuario autenticado.',
    schemaRef: 'acciones_diarias.responsable',
    tools: ['get_my_actions'],
    interpretRules: ['Identidad siempre desde sesión autenticada, nunca solo por nombre.'],
    allowedOperations: ['query'],
  },
  {
    id: 'role_creador',
    businessName: 'Creador',
    aliases: ['cree', 'creé', 'solicite', 'solicité', 'que yo pedi', 'creador', 'cree yo'],
    module: 'kanban',
    entity: 'usuario',
    definition: 'Persona con acciones_diarias.created_by = usuario autenticado.',
    schemaRef: 'acciones_diarias.created_by',
    tools: ['get_my_actions'],
    interpretRules: ['«Acciones que creé» → scope created_by_me.'],
    allowedOperations: ['query'],
  },
  {
    id: 'role_verificador',
    businessName: 'Verificador',
    aliases: ['verifico', 'verificar', 'verificacion', 'verificación', 'verificador'],
    module: 'kanban',
    entity: 'usuario',
    definition: 'Usuario ligado como verificador_dato o verificador_gobierno, o responsable en Hecho.',
    schemaRef: 'acciones_diarias.verificador_dato|verificador_gobierno',
    tools: ['get_my_actions', 'get_pending_verifications'],
    interpretRules: ['status_group=verification (estado Hecho, no Verificado).'],
    allowedOperations: ['query', 'propose_update'],
  },
  {
    id: 'role_asignador_unmapped',
    businessName: 'Asignador / solicitante',
    aliases: ['asigne', 'asigné', 'asigne a', 'solicitante', 'asignador'],
    module: 'kanban',
    entity: 'usuario',
    definition:
      'No hay columna asignador distinta. «Asigné» se interpreta como creador (created_by) si el usuario habla de lo que él registró; si pide «asignador» literal, aclarar.',
    schemaRef: undefined,
    interpretRules: [
      'No inventar campo asignador.',
      'Si «asigné a X» → created_by=yo y responsable≈X cuando se pueda resolver.',
    ],
    allowedOperations: ['query', 'clarify'],
    ambiguities: ['Asignador ≠ creador en lenguaje de negocio, pero el esquema solo tiene created_by.'],
  },
  {
    id: 'role_team',
    businessName: 'Mi equipo',
    aliases: ['mi equipo', 'todo el equipo', 'de mi equipo', 'companeros', 'compañeros', 'nosotros'],
    module: 'kanban',
    entity: 'equipo',
    definition: 'Alcance team_authorized / get_team_actions según permisos.',
    tools: ['get_team_actions', 'get_my_actions'],
    interpretRules: ['Cambio explícito de alcance; no es default de «mis».'],
    allowedOperations: ['query'],
  },
  {
    id: 'visual_board_red',
    businessName: 'Rojo (tablero)',
    aliases: ['en rojo', 'rojas', 'rojos', 'rojo'],
    module: 'kanban',
    entity: 'visual',
    definition: 'Unión UI: prioridad color rojo O vencida/Retraso (board_red).',
    tools: ['get_my_actions'],
    interpretRules: [
      'Si el usuario dice solo «rojo» sin «prioridad»: board_red.',
      'No equivale automáticamente a bloqueado ni a stale.',
    ],
    allowedOperations: ['query'],
    ambiguities: ['Puede confundirse con prioridad roja o con riesgo OKR.'],
  },
  {
    id: 'visual_priority_red',
    businessName: 'Prioridad roja',
    aliases: ['prioridad roja', 'prioridad rojo', 'p1', 'critica', 'crítica', 'urgente'],
    module: 'kanban',
    entity: 'visual',
    definition: 'Solo prioridad con color rojo (priorityColorFor), no vencimiento.',
    tools: ['get_my_actions'],
    interpretRules: ['visual=priority_red.'],
    allowedOperations: ['query'],
  },
  {
    id: 'visual_overdue',
    businessName: 'Vencida / retraso',
    aliases: ['vencida', 'vencidas', 'vencido', 'en retraso', 'atrasada', 'atrasadas', 'overdue'],
    module: 'kanban',
    entity: 'visual',
    definition: 'isCorporateOverdue / columna Retraso en CDMX.',
    tools: ['get_my_actions'],
    interpretRules: ['No confundir con Bloqueado.'],
    allowedOperations: ['query'],
  },
  {
    id: 'comms_draft',
    businessName: 'Comunicación (borrador)',
    aliases: ['whatsapp', 'wasap', 'correo', 'email', 'mail', 'mensaje'],
    module: 'comms',
    entity: 'assistant_pending_ops',
    definition: 'Preparación de WhatsApp o correo; no envío automático en entrevista read-only.',
    tools: ['queue_workspace_draft'],
    interpretRules: [
      'Usar classifyCommunicationIntent (taxonomía A–D).',
      'Destinatario y datos deben resolverse; no usar las tareas del hablante como las del destinatario.',
    ],
    allowedOperations: ['prepare_comms', 'clarify'],
  },
]

function normalizeAlias(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Índice alias → term id (primera coincidencia; aliases más largos primero al buscar). */
export function buildAliasIndex(terms: OperationalTerm[] = OPERATIONAL_TERMS) {
  const map = new Map<string, string>()
  for (const term of terms) {
    map.set(normalizeAlias(term.id), term.id)
    map.set(normalizeAlias(term.businessName), term.id)
    for (const alias of term.aliases) {
      const key = normalizeAlias(alias)
      if (!map.has(key)) map.set(key, term.id)
    }
  }
  return map
}

export const OPERATIONAL_ALIAS_INDEX = buildAliasIndex()

export function getOperationalTerm(id: string): OperationalTerm | undefined {
  return OPERATIONAL_TERMS.find((t) => t.id === id)
}

export function findTermsInText(text: string, terms: OperationalTerm[] = OPERATIONAL_TERMS): OperationalTerm[] {
  const normalized = normalizeAlias(text)
  const found: OperationalTerm[] = []
  const seen = new Set<string>()
  const sorted = [...terms].sort(
    (a, b) =>
      Math.max(...b.aliases.map((x) => x.length), b.businessName.length) -
      Math.max(...a.aliases.map((x) => x.length), a.businessName.length)
  )
  for (const term of sorted) {
    const candidates = [term.id, term.businessName, ...term.aliases].map(normalizeAlias)
    if (candidates.some((alias) => alias && (normalized.includes(alias) || new RegExp(`\\b${escapeReg(alias)}\\b`).test(normalized)))) {
      if (!seen.has(term.id)) {
        seen.add(term.id)
        found.push(term)
      }
    }
  }
  return found
}

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Aliases exportables para WhatsApp / otros canales (sin duplicar glosarios). */
export function kanbanActionAliases(): string[] {
  return getOperationalTerm('kanban_action')?.aliases ?? []
}

export function boardRedAliases(): string[] {
  return getOperationalTerm('visual_board_red')?.aliases ?? []
}

export function responsableAliases(): string[] {
  return getOperationalTerm('role_responsable')?.aliases ?? []
}
