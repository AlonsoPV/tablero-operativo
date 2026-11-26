/**
 * Modelo estructurado de creación conversacional de acciones (transversal: Web, WhatsApp, Voz).
 * Reutiliza los nombres, tipos y restricciones reales de SCRUMBAN (acciones_diarias) sin crear
 * tablas ni concatenar mensajes en el título.
 */
import { draftFromRequest } from '../../../src/features/ai-support/creationDraft.js'
import { parseDueDateHint } from '../../../src/features/ai-support/parseWorkFacts.js'
import type { R2ExecutionMode } from '../actions/executionMode.js'
import type { AgentActor } from '../query/resolveActor.js'

export type DraftFieldSource = 'explicit' | 'inferred' | 'pending'
export type ActionPriorityValue = 'P1_Alta' | 'P2_Media' | 'P3_Baja'
export type ActionStatusValue = 'Pendiente' | 'En_Ejecucion' | 'Hecho' | 'Verificado'

export type StructuredActionDraft = {
  titulo: string | null
  descripcion: string | null
  responsableId: string | null
  responsableNombre: string | null
  responsableHint: string | null
  responsableSource: DraftFieldSource
  fecha: string | null
  fechaSource: DraftFieldSource
  tablero: string | null
  tableroKind: 'corporativo' | 'equipo' | null
  tableroHint: string | null
  tableroSource: DraftFieldSource
  area: string | null
  prioridad: ActionPriorityValue | null
  estado: ActionStatusValue
  objetivoNombre: string | null
  checklists: string[]
}

export type DraftPatch = {
  titulo?: string | null
  descripcion?: string | null
  responsableSelf?: boolean
  responsableHint?: string | null
  fecha?: string | null
  tableroKind?: 'corporativo' | 'equipo' | 'default_kanban' | 'ambiguous' | null
  tableroHint?: string | null
  area?: string | null
  prioridad?: ActionPriorityValue | null
  estado?: ActionStatusValue | null
  objetivoNombre?: string | null
  checklists?: string[]
}

export type EntityCatalogUser = {
  id: string
  nombre: string
  activo?: boolean
  areas?: string[]
  hasWhatsApp?: boolean
  email?: string | null
}

export type EntityCatalogBoard = {
  id: string
  nombre: string
  kind: 'corporativo' | 'equipo'
  authorized: boolean
}

export type EntityResolutionCatalog = {
  users: EntityCatalogUser[]
  boards: EntityCatalogBoard[]
}

export type DraftResolutionResult = {
  draft: StructuredActionDraft
  clarification: string | null
  forbiddenReason: string | null
  missingRequired: string[]
}

const PRIORITY_LABEL: Record<ActionPriorityValue, string> = {
  P1_Alta: 'Alta',
  P2_Media: 'Media',
  P3_Baja: 'Baja',
}

const STATUS_LABEL: Record<ActionStatusValue, string> = {
  Pendiente: 'Pendiente',
  En_Ejecucion: 'En ejecución',
  Hecho: 'Hecho',
  Verificado: 'Verificado',
}

function norm(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function sentenceCase(value: string): string {
  const s = cleanSpaces(value).replace(/[.]+$/, '').trim()
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function emptyStructuredDraft(): StructuredActionDraft {
  return {
    titulo: null,
    descripcion: null,
    responsableId: null,
    responsableNombre: null,
    responsableHint: null,
    responsableSource: 'pending',
    fecha: null,
    fechaSource: 'pending',
    tablero: null,
    tableroKind: null,
    tableroHint: null,
    tableroSource: 'pending',
    area: null,
    prioridad: null,
    estado: 'Pendiente',
    objetivoNombre: null,
    checklists: [],
  }
}

export function parsePriorityValue(text: string): ActionPriorityValue | null {
  const n = norm(text)
  if (/\b(p1|prioridad\s+alta|alta\s+prioridad|urgente|como\s+prioridad\s+alta|en\s+prioridad\s+alta)\b/.test(n)) {
    return 'P1_Alta'
  }
  if (/\b(p3|prioridad\s+baja|baja\s+prioridad|como\s+prioridad\s+baja)\b/.test(n)) {
    return 'P3_Baja'
  }
  if (/\b(p2|prioridad\s+media|media\s+prioridad|como\s+prioridad\s+media)\b/.test(n)) {
    return 'P2_Media'
  }
  return null
}

function extractExplicitTitleChange(utterance: string): string | null {
  const m = cleanSpaces(utterance).match(
    /\b(?:cambia(?:r)?\s+(?:el\s+)?t[ií]tulo\s+(?:a|por)|renombra(?:r|la|lo)?\s+(?:a|como)|ponle\s+(?:de\s+)?t[ií]tulo|nuevo\s+t[ií]tulo\s*[:=]?|t[ií]tulo\s*[:=])\s*[«"']?([^"«»\n]+?)[»"']?\.?$/i
  )
  if (!m?.[1]) return null
  const t = sentenceCase(m[1])
  return t.length >= 2 ? t.slice(0, 70) : null
}

export function extractResponsablePatch(utterance: string): { self: boolean; hint: string | null } {
  const n = norm(utterance)
  if (
    /\b(asignamela|asignamelo|asigname|para mi\b|a mi\b|a mi mismo|ponmela|ponmelo|quedamela|yo me encargo|responsable\s*[:=]?\s*yo)\b/.test(
      n
    )
  ) {
    return { self: true, hint: null }
  }
  const named =
    cleanSpaces(utterance).match(
      /\b(?:[Aa]s[ií]gna(?:da|do|la|lo|le|sela|selo|r)?|[Rr]eas[ií]gna(?:da|do|la|lo|r)?|[Rr]esponsable(?:\s+sea|\s+a|\s*[:=])?|[Mm]ejor\s+a|[Pp]onle\s+(?:una\s+(?:tarea|acci[oó]n)\s+)?a|[Dd][eé]jale\s+(?:un\s+pendiente\s+)?a|[Ee]nc[aá]rgale\s+(?:esto\s+)?a|[Dd]ile\s+a)\s+(?:a\s+)?([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+)?)/
    ) ??
    cleanSpaces(utterance).match(
      /\b(?:as[ií]gna(?:da|do|la|lo|le|sela|selo|r)?|reas[ií]gna(?:da|do|la|lo|r)?|responsable(?:\s+sea|\s+a|\s*[:=])?|mejor\s+a|ponle\s+(?:una\s+(?:tarea|acci[oó]n)\s+)?a|d[eé]jale\s+(?:un\s+pendiente\s+)?a|enc[aá]rgale\s+(?:esto\s+)?a|dile\s+a)\s+(?:a\s+)?([a-záéíóúñ]{3,})/i
    ) ??
    cleanSpaces(utterance).match(
      /\bque\s+se\s+encargue\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.'-]+)?)/i
    ) ??
    cleanSpaces(utterance).match(
      /\bpara\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)\b/
    ) ??
    cleanSpaces(utterance).match(
      /^(?:(?:mejor|[A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:la|lo))\s+)?para\s+([a-záéíóúñ]{3,})\b/i
    )
  if (named?.[1]) {
    const candidate = cleanSpaces(named[1])
      .replace(/\b(en|con|para|el|la|los|las|lo|de|del|que|una|un)\b.*$/i, '')
      .trim()
    const bad = /^(el|la|los|las|lo|mi|mis|kanban|tablero|equipo|viernes|lunes|martes|miercoles|jueves|sabado|domingo|hoy|manana|prioridad|alta|media|baja|esta|esa|esto|una|un)$/i
    if (candidate.length >= 2 && !bad.test(norm(candidate))) {
      return { self: false, hint: candidate }
    }
  }
  return { self: false, hint: null }
}

function extractBoardPatch(utterance: string): {
  kind: DraftPatch['tableroKind']
  hint: string | null
} {
  const n = norm(utterance)
  if (/\b(kanban\s+corporativo|tablero\s+corporativo|tablero\s+general|tablero\s+principal)\b/.test(n)) {
    return { kind: 'corporativo', hint: 'Kanban corporativo' }
  }
  const teamMatch = cleanSpaces(utterance).match(
    /\b(?:en\s+el\s+)?(?:tablero|kanban)\s+de\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s-]{2,40}?)(?=\s+(?:para|con|asignad|responsable|prioridad|porque)|[.,]|$)/i
  )
  if (teamMatch?.[1]) {
    const rawName = cleanSpaces(teamMatch[1])
    if (/^equipo$/i.test(norm(rawName))) {
      return { kind: 'equipo', hint: 'Tablero de equipo' }
    }
    return { kind: 'equipo', hint: rawName }
  }
  if (/\b(tablero\s+de\s+equipo|kanban\s+de\s+equipo|mi\s+equipo)\b/.test(n)) {
    return { kind: 'equipo', hint: 'Tablero de equipo' }
  }
  if (/\b(en\s+el\s+kanban|al\s+kanban|en\s+kanban)\b/.test(n)) {
    return { kind: 'default_kanban', hint: 'Kanban' }
  }
  if (/\b(en\s+el\s+tablero|al\s+tablero)\b/.test(n)) {
    return { kind: 'ambiguous', hint: 'tablero' }
  }
  return { kind: null, hint: null }
}

function extractAreaPatch(utterance: string): string | null {
  const m = cleanSpaces(utterance).match(
    /\b(?:[áa]rea\s*(?:de|:)?|departamento\s*(?:de|:)?)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s-]{2,35}?)(?=\s+(?:para|con|en|prioridad|asignad|responsable|porque)|[.,]|$)/i
  )
  return m?.[1] ? sentenceCase(m[1]) : null
}

function extractObjectivePatch(utterance: string): string | null {
  const m = cleanSpaces(utterance).match(
    /\b(?:vinculad[ao]\s+al\s+|para\s+el\s+)?(?:objetivo|okr|iniciativa)\s*[:"]?\s*([^.,\n]{3,80})/i
  )
  return m?.[1] ? sentenceCase(m[1]) : null
}

function cleanTitleFromStructuredClauses(rawTitle: string, responsableHint?: string | null): string {
  const escaped = responsableHint?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const withoutAssignee = escaped
    ? rawTitle.replace(new RegExp(`[,;]\\s*(?:para\\s+|responsable\\s*[:=]\\s*)${escaped}(?=\\s*[,;.]|$)`, 'gi'), '')
    : rawTitle
  const stripped = cleanSpaces(withoutAssignee)
    .replace(/\b(?:en\s+el\s+|al\s+|en\s+)?(?:kanban\s+corporativo|tablero\s+corporativo|tablero\s+de\s+equipo|tablero\s+de\s+[A-Za-zÁÉÍÓÚÑáéíóúñ\s-]+|kanban)\b/gi, '')
    .replace(/\b(?:con\s+|como\s+|en\s+)?prioridad\s+(?:alta|media|baja|p1|p2|p3)\b/gi, '')
    .replace(/\b(?:as[ií]gna(?:da|do|mela|melo|la|lo|sela|selo|r)?(?:\s+a\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ]+)?)?|para\s+m[ií]|a\s+m[ií])(?=\s|[,.;:]|$)/gi, '')
    .replace(/\b(?:[áa]rea|departamento)\s+(?:de\s+)?[A-Za-zÁÉÍÓÚÑáéíóúñ]+\b/gi, '')
    .replace(/\b(?:para\s+el|el|para)\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|hoy|ma[ñn]ana)\b/gi, '')
    .replace(/[()]/g, ' ')
    .replace(/(?:\s*[,;]\s*)+$/g, '')
    .replace(/\s+[.:]+$/g, '')
    .replace(/^[.,;:\s-]+/g, '')
  return sentenceCase(stripped).slice(0, 70)
}

export function extractActionPatch(utterance: string, today: string, isFollowUp: boolean): DraftPatch {
  const patch: DraftPatch = {}
  const explicitTitle = extractExplicitTitleChange(utterance)
  if (explicitTitle) {
    patch.titulo = explicitTitle
  }

  const due = parseDueDateHint(utterance, today)
  if (due.dateYmd) {
    patch.fecha = due.dateYmd
  }

  const priority = parsePriorityValue(utterance)
  if (priority) {
    patch.prioridad = priority
  }

  const resp = extractResponsablePatch(utterance)
  if (resp.self) {
    patch.responsableSelf = true
  } else if (resp.hint) {
    patch.responsableHint = resp.hint
  }

  const board = extractBoardPatch(utterance)
  if (board.kind) {
    patch.tableroKind = board.kind
    patch.tableroHint = board.hint
  }

  const area = extractAreaPatch(utterance)
  if (area) patch.area = area

  const objetivo = extractObjectivePatch(utterance)
  if (objetivo) patch.objetivoNombre = objetivo

  if (!isFollowUp) {
    const strippedFiller = cleanSpaces(utterance)
      .replace(/^(?:oye|porfa|por\s+favor|f[ií]jate\s+que|a\s+ver|me\s+urge\s+que|necesito\s+que)\s+/i, '')
      .replace(/\bporfa(?:vor)?\b/gi, '')
      .trim()
    const base = draftFromRequest(strippedFiller)
    const directLead = cleanSpaces(strippedFiller)
      .replace(
        /^(?:crea|crear|creame|genera|generar|agrega|agregar|registra|registrar|nueva|necesito)\s+(?:una\s+)?(?:acci[oó]n|acion|tarea|actividad|iniciativa|pendiente)\s+(?:para\s+que|para|de|sobre)\s+/i,
        ''
      )
      .replace(/^(?:crea|crear|creame|genera|generar|agrega|agregar|registra|registrar)\s+(?:una\s+)?(?:acci[oó]n|acion|tarea|actividad|iniciativa|pendiente)\s+/i, '')
      .replace(
        /^(?:ponle|d[eé]jale|enc[aá]rgale)\s+(?:una\s+(?:tarea|acci[oó]n)\s+|un\s+pendiente\s+)?(?:a\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?\s+)?(?:de\s+|sobre\s+|lo\s+de(?:l)?\s+)?/i,
        ''
      )
      .replace(
        /^(?:que\s+se\s+encargue\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?\s+de\s+|dile\s+a\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?\s+que\s+(?:me\s+)?)/i,
        ''
      )
      .replace(/^(?:hay\s+que|que\s+no\s+se\s+nos\s+olvide|ap[uú]ntalo\s+para|agr[eé]galo\s+al\s+kanban(?:\s*:|\s+para)?)\s+/i, '')
    const candidateTitle =
      explicitTitle ??
      (directLead !== cleanSpaces(strippedFiller)
        ? cleanTitleFromStructuredClauses(directLead, resp.hint)
        : cleanTitleFromStructuredClauses(base.title, resp.hint))
    if (candidateTitle.length >= 2) {
      patch.titulo = candidateTitle
    }
    const descriptionSource = directLead !== cleanSpaces(strippedFiller) ? draftFromRequest(cleanTitleFromStructuredClauses(directLead, resp.hint)).description : base.description
    if (descriptionSource && descriptionSource.length >= 3) {
      const cleanedDesc = cleanTitleFromStructuredClauses(descriptionSource, resp.hint)
      patch.descripcion = cleanedDesc.length >= 3 ? cleanedDesc : candidateTitle
    }
    if (base.checkpoints.length > 0) {
      patch.checklists = base.checkpoints
    }
  } else {
    const descMatch = cleanSpaces(utterance).match(/\b(?:descripci[oó]n|detalle)\s*[:=]\s*(.+)$/i)
    if (descMatch?.[1]) {
      patch.descripcion = sentenceCase(descMatch[1]).slice(0, 4000)
    }
  }

  return patch
}

export function applyDraftPatch(base: StructuredActionDraft, patch: DraftPatch): StructuredActionDraft {
  const next: StructuredActionDraft = { ...base }
  if (patch.titulo) {
    next.titulo = patch.titulo
    if (!next.descripcion) next.descripcion = patch.titulo
  }
  if (patch.descripcion) {
    next.descripcion = patch.descripcion
  }
  if (patch.fecha) {
    next.fecha = patch.fecha
    next.fechaSource = 'explicit'
  }
  if (patch.prioridad) {
    next.prioridad = patch.prioridad
  }
  if (patch.estado) {
    next.estado = patch.estado
  }
  if (patch.area) {
    next.area = patch.area
  }
  if (patch.objetivoNombre) {
    next.objetivoNombre = patch.objetivoNombre
  }
  if (patch.checklists && patch.checklists.length > 0) {
    next.checklists = patch.checklists
  }
  if (patch.responsableSelf) {
    next.responsableHint = '__self__'
    next.responsableId = null
    next.responsableNombre = null
    next.responsableSource = 'explicit'
  } else if (patch.responsableHint) {
    next.responsableHint = patch.responsableHint
    next.responsableId = null
    next.responsableNombre = null
    next.responsableSource = 'explicit'
  }
  if (patch.tableroKind) {
    next.tableroHint = patch.tableroHint ?? null
    next.tableroSource = 'explicit'
    if (patch.tableroKind === 'corporativo') {
      next.tableroKind = 'corporativo'
      next.tablero = 'Kanban corporativo'
    } else if (patch.tableroKind === 'equipo') {
      next.tableroKind = 'equipo'
      next.tablero = patch.tableroHint || 'Tablero de equipo'
    } else {
      next.tableroKind = null
      next.tablero = null
    }
  }
  return next
}

export function isStructuredFollowUpUtterance(utterance: string): boolean {
  const n = norm(utterance)
  if (/^(crea|crear|creame|genera|generar|nueva accion|otra accion)\b/.test(n)) return false
  return Boolean(
    extractExplicitTitleChange(utterance) ||
      parsePriorityValue(utterance) ||
      extractResponsablePatch(utterance).self ||
      extractResponsablePatch(utterance).hint ||
      extractBoardPatch(utterance).kind ||
      extractAreaPatch(utterance) ||
      /\b(mejor\s+para|mejor\s+a\b|para\s+(?:hoy|manana|el\s+(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|\d{4}-\d{2}-\d{2})|cambia(?:r)?\s+(?:la\s+)?fecha|reprograma|en\s+el\s+kanban|en\s+el\s+tablero|ponla|ponlo|asignamela|asignala|asignalo|asignasela|asignaselo|pasalo|pasala)\b/.test(
        n
      )
  )
}

export async function loadEntityCatalogFromActor(actor: AgentActor): Promise<EntityResolutionCatalog> {
  const users: EntityCatalogUser[] = []
  try {
    const client = actor.copilot.supabase
    if (client && typeof client.from === 'function') {
      const { data } = await client
        .from('usuarios')
        .select('id,nombre,activo')
        .eq('activo', true)
        .limit(120)
      if (Array.isArray(data)) {
        const seen = new Set<string>()
        for (const row of data as Array<{ id?: string; nombre?: string; activo?: boolean }>) {
          if (row.id && row.nombre && !seen.has(row.id)) {
            users.push({ id: row.id, nombre: row.nombre, activo: row.activo !== false })
            seen.add(row.id)
          }
        }
      }
    }
  } catch {
    /* fallback seguro: al menos el actor autenticado */
  }
  if (!users.some((u) => u.id === actor.usuarioId)) {
    const actorName = (actor.copilot as { nombre?: string | null }).nombre?.trim() || 'Tú'
    users.unshift({ id: actor.usuarioId, nombre: actorName, activo: true })
  }

  const canTeamBoard =
    actor.capabilities.readCrossAreaExecution ||
    actor.rol === 'Líder' ||
    actor.rol === 'Dirección' ||
    actor.rol === 'Super Admin'
  const boards: EntityCatalogBoard[] = [
    { id: 'kanban_corporativo', nombre: 'Kanban corporativo', kind: 'corporativo', authorized: true },
    { id: 'tablero_equipo', nombre: 'Tablero de equipo', kind: 'equipo', authorized: canTeamBoard },
  ]
  return { users, boards }
}

export function resolveDraftEntities(
  draft: StructuredActionDraft,
  actor: AgentActor,
  catalog: EntityResolutionCatalog
): DraftResolutionResult {
  const resolved: StructuredActionDraft = { ...draft }
  const clarifications: string[] = []
  let forbiddenReason: string | null = null

  // 1. Resolver responsable real (sin IDs inventados y respetando permisos)
  if (resolved.responsableHint === '__self__') {
    const selfRow = catalog.users.find((u) => u.id === actor.usuarioId)
    resolved.responsableId = actor.usuarioId
    resolved.responsableNombre =
      selfRow?.nombre ?? (actor.copilot as { nombre?: string | null }).nombre?.trim() ?? 'Tú'
    resolved.responsableSource = 'explicit'
  } else if (resolved.responsableHint && !resolved.responsableId) {
    const needle = norm(resolved.responsableHint)
    const activeUsers = catalog.users.filter((u) => u.activo !== false)
    const exact = activeUsers.filter((u) => norm(u.nombre) === needle)
    const partial = exact.length
      ? exact
      : activeUsers.filter((u) => norm(u.nombre).includes(needle))

    if (partial.length === 1) {
      const target = partial[0]!
      const canAssignOthers =
        target.id === actor.usuarioId ||
        actor.capabilities.readCrossAreaExecution ||
        actor.rol === 'Líder' ||
        actor.rol === 'Dirección' ||
        actor.rol === 'Super Admin'
      if (!canAssignOthers) {
        forbiddenReason = `No tienes permiso para asignar acciones a ${target.nombre}; solo puedes asignártelas a ti.`
      } else {
        resolved.responsableId = target.id
        resolved.responsableNombre = target.nombre
      }
    } else if (partial.length > 1) {
      const names = partial.slice(0, 4).map((u) => u.nombre).join(', ')
      clarifications.push(`Encontré varios responsables para «${resolved.responsableHint}»: ${names}. ¿A cuál te refieres?`)
    } else {
      forbiddenReason = `No encontré un usuario activo y autorizado llamado «${resolved.responsableHint}».`
    }
  }

  // 2. Resolver tablero real (respetando permisos; si hay uno único aplicable para "Kanban", resolver sin preguntar)
  const authorizedBoards = catalog.boards.filter((b) => b.authorized)
  if (resolved.tableroHint) {
    const hintNorm = norm(resolved.tableroHint)
    if (hintNorm === 'kanban') {
      const corp = authorizedBoards.find((b) => b.kind === 'corporativo')
      if (corp) {
        resolved.tablero = corp.nombre
        resolved.tableroKind = corp.kind
      }
    } else if (hintNorm === 'tablero') {
      if (authorizedBoards.length === 1) {
        resolved.tablero = authorizedBoards[0]!.nombre
        resolved.tableroKind = authorizedBoards[0]!.kind
      } else if (authorizedBoards.length > 1) {
        clarifications.push(
          `¿En qué tablero deseas ubicarla? Disponibles: ${authorizedBoards.map((b) => b.nombre).join(' o ')}.`
        )
      }
    } else {
      const allMatches = catalog.boards.filter(
        (b) => norm(b.nombre) === hintNorm || norm(b.nombre).includes(hintNorm)
      )
      const authMatches = allMatches.filter((b) => b.authorized)
      if (authMatches.length === 1) {
        resolved.tablero = authMatches[0]!.nombre
        resolved.tableroKind = authMatches[0]!.kind
      } else if (authMatches.length > 1) {
        clarifications.push(
          `Hay varios tableros que coinciden con «${resolved.tableroHint}»: ${authMatches.map((b) => b.nombre).join(', ')}. ¿Cuál prefieres?`
        )
      } else if (allMatches.length > 0) {
        forbiddenReason = `No tienes permiso para crear acciones en «${allMatches[0]!.nombre}».`
      } else if (resolved.tableroKind === 'equipo') {
        const teamBoard = authorizedBoards.find((b) => b.kind === 'equipo')
        if (teamBoard) {
          resolved.tablero = teamBoard.nombre
          resolved.tableroKind = 'equipo'
        } else {
          forbiddenReason = `No tienes acceso al tablero «${resolved.tableroHint}» dentro de tu alcance autorizado.`
        }
      } else {
        forbiddenReason = `No encontré un tablero autorizado llamado «${resolved.tableroHint}».`
      }
    }
  } else if (!resolved.tablero && authorizedBoards.length === 1) {
    resolved.tablero = authorizedBoards[0]!.nombre
    resolved.tableroKind = authorizedBoards[0]!.kind
    resolved.tableroSource = 'inferred'
  }

  const missingRequired: string[] = []
  if (!resolved.titulo) missingRequired.push('título')
  if (!resolved.responsableId) missingRequired.push('responsable')

  return {
    draft: resolved,
    clarification: clarifications.length ? clarifications.join(' ') : null,
    forbiddenReason,
    missingRequired,
  }
}

export function formatStructuredActionDraft(
  draft: StructuredActionDraft,
  options: { mode: R2ExecutionMode; version?: string | null; missingRequired?: string[] }
): string {
  const lines: string[] = ['Nueva acción', '']
  lines.push(`Título: ${draft.titulo ?? 'Pendiente de definir'}`)
  lines.push(`Responsable: ${draft.responsableNombre ?? 'Pendiente de definir'}`)
  lines.push(`Fecha de entrega: ${draft.fecha ?? 'Sin fecha definida'}`)
  lines.push(`Tablero: ${draft.tablero ?? 'Kanban corporativo'}`)
  if (draft.area) lines.push(`Área: ${draft.area}`)
  if (draft.prioridad) lines.push(`Prioridad: ${PRIORITY_LABEL[draft.prioridad]}`)
  lines.push(`Estado: ${STATUS_LABEL[draft.estado]}`)
  if (draft.objetivoNombre) lines.push(`Objetivo vinculado: ${draft.objetivoNombre}`)
  if (draft.checklists.length > 0) {
    lines.push(`Checklist: ${draft.checklists.join(' · ')}`)
  }

  lines.push('')
  const missing = options.missingRequired ?? []
  if (missing.length > 0) {
    lines.push(`Para completarla, indícame: ${missing.join(' y ')}.`)
  } else if (options.mode === 'disabled') {
    lines.push(
      'Este borrador es solo para revisión; la creación automática de acciones aún no está habilitada y no se guardó en Scrumban.'
    )
  } else if (options.version) {
    lines.push(
      `¿Confirmas crear esta acción? Usa los botones o responde "confirmar ${options.version}", "editar ${options.version} fecha=YYYY-MM-DD" o "cancelar ${options.version}".`
    )
  } else {
    lines.push('Propuesta lista para confirmación explícita.')
  }
  return lines.join('\n')
}
