/**
 * Resolución segura de referencias por URL interna de SCRUMBAN (P1).
 *
 * Solo interpreta rutas realmente soportadas por la aplicación (/kanban, /kanban-equipos, /okrs),
 * valida permisos y consulta datos reales a través de las herramientas autorizadas existentes.
 * Nunca infiere contenido desde el texto del enlace ni navega a sitios externos.
 */
import type { AgentActor } from '../query/resolveActor.js'
import { authorizeQuery } from '../query/authorizeQuery.js'
import { queryActions, queryOkrs, type ToolDispatcher } from '../query/index.js'
import type { ReferencedAction, SessionContext } from './sessionContext.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const URL_TOKEN_RE = /https?:\/\/[^\s<>()]+/gi
const RELATIVE_ROUTE_RE = /(?:^|[\s:(])(\/(?:kanban(?:-equipos(?:\/tablero)?)?|okrs)(?:\?[^\s<>()]+)?(?:#[^\s<>()]+)?)/i

export type ParsedResourceUrl =
  | { kind: 'action'; rawUrl: string; actionId: string; href: string }
  | { kind: 'board'; rawUrl: string; boardKind: 'corporativo' | 'equipo'; areaId: string | null; href: string }
  | { kind: 'okr'; rawUrl: string; objectiveId: string | null; href: string }
  | { kind: 'unsupported_internal'; rawUrl: string; pathname: string }
  | { kind: 'external'; rawUrl: string; hostname: string }

function isInternalScrumbanHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1') return true
  if (h === 'tablero-operativo.vercel.app') return true
  if (/^tablero-operativo-[a-z0-9-]+\.vercel\.app$/.test(h)) return true
  const configured = [process.env.VITE_APP_URL, process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]
  for (const base of configured) {
    if (!base) continue
    try {
      if (new URL(base).hostname.toLowerCase() === h) return true
    } catch {
      // ignore invalid env URL
    }
  }
  return false
}

function cleanRawToken(token: string): string {
  return token.replace(/[.,;!?)\]]+$/, '')
}

function parseInternalPath(rawUrl: string, pathname: string, searchParams: URLSearchParams, hash: string): ParsedResourceUrl {
  const path = pathname.replace(/\/+$/, '') || '/'

  if (path === '/kanban') {
    const rawId =
      searchParams.get('accion') ??
      searchParams.get('action_id') ??
      searchParams.get('id') ??
      hash.match(/accion=([0-9a-f-]{36})/i)?.[1] ??
      null
    if (rawId && UUID_RE.test(rawId)) {
      return { kind: 'action', rawUrl, actionId: rawId, href: `/kanban?accion=${rawId}` }
    }
    return { kind: 'board', rawUrl, boardKind: 'corporativo', areaId: null, href: '/kanban' }
  }

  if (path === '/kanban-equipos' || path === '/kanban-equipos/tablero') {
    const areaId = searchParams.get('area')
    return {
      kind: 'board',
      rawUrl,
      boardKind: 'equipo',
      areaId: areaId && areaId.trim() ? areaId.trim() : null,
      href: areaId ? `${path}?area=${encodeURIComponent(areaId)}` : path,
    }
  }

  if (path === '/okrs') {
    const hashObj = hash.match(/okr-objective-([0-9a-f-]{36})/i)?.[1] ?? null
    const paramObj = searchParams.get('objetivo') ?? searchParams.get('okr') ?? searchParams.get('id') ?? null
    const rawObj = paramObj ?? hashObj
    const objectiveId = rawObj && UUID_RE.test(rawObj) ? rawObj : null
    return {
      kind: 'okr',
      rawUrl,
      objectiveId,
      href: objectiveId ? `/okrs#okr-objective-${objectiveId}` : '/okrs',
    }
  }

  return { kind: 'unsupported_internal', rawUrl, pathname: path }
}

/** Extrae la primera referencia URL (interna de SCRUMBAN o externa) presente en un turno. */
export function extractResourceUrl(utterance: string): ParsedResourceUrl | null {
  const matches = utterance.match(URL_TOKEN_RE)
  if (matches && matches.length > 0) {
    for (const m of matches) {
      const cleaned = cleanRawToken(m)
      try {
        const parsed = new URL(cleaned)
        if (isInternalScrumbanHost(parsed.hostname)) {
          return parseInternalPath(cleaned, parsed.pathname, parsed.searchParams, parsed.hash)
        }
        return { kind: 'external', rawUrl: cleaned, hostname: parsed.hostname }
      } catch {
        continue
      }
    }
  }

  const relMatch = utterance.match(RELATIVE_ROUTE_RE)
  if (relMatch?.[1]) {
    const cleaned = cleanRawToken(relMatch[1])
    try {
      const parsed = new URL(cleaned, 'https://tablero-operativo.vercel.app')
      return parseInternalPath(cleaned, parsed.pathname, parsed.searchParams, parsed.hash)
    } catch {
      return null
    }
  }

  return null
}

export function stripResourceUrl(utterance: string, rawUrl: string): string {
  return utterance
    .replace(rawUrl, ' ')
    .replace(/:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type ResolvedUrlContext =
  | {
      kind: 'action'
      action: ReferencedAction
      summaryLines: string[]
      href: string
      actionId: string
    }
  | {
      kind: 'board'
      actions: ReferencedAction[]
      summaryLines: string[]
      href: string
      total: number
    }
  | {
      kind: 'okr'
      summaryLines: string[]
      href: string
      total: number
      objectiveTitle?: string
    }
  | { kind: 'forbidden'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'external'; message: string }
  | { kind: 'unsupported_internal'; message: string }

type ActionDetailsPayload = {
  action?: {
    id?: string
    titulo?: string
    accion?: string
    estado?: string
    fecha?: string | null
    prioridad?: string | null
    responsable?: string | null
    responsable_id?: string | null
    responsable_nombre?: string | null
    area?: string | null
    updated_at?: string | null
  }
  checklist?: Array<{ completado?: boolean }>
  comments?: Array<{ contenido?: string }>
}

export async function resolveResourceUrl(params: {
  parsed: ParsedResourceUrl
  actor: AgentActor
  dispatch: ToolDispatcher
  ctx: SessionContext
}): Promise<ResolvedUrlContext> {
  const { parsed, actor, dispatch, ctx } = params

  if (parsed.kind === 'external') {
    return {
      kind: 'external',
      message: `No puedo abrir ni consultar el enlace externo (${parsed.hostname}). Solo puedo revisar enlaces internos de SCRUMBAN (/kanban?accion=..., /kanban-equipos o /okrs) dentro de tu alcance autorizado.`,
    }
  }

  if (parsed.kind === 'unsupported_internal') {
    return {
      kind: 'unsupported_internal',
      message: `La ruta interna «${parsed.pathname}» no tiene consulta directa vinculada aún. Puedo resolver enlaces de acciones (/kanban?accion=...), tableros (/kanban, /kanban-equipos) y objetivos (/okrs).`,
    }
  }

  if (parsed.kind === 'action') {
    const auth = authorizeQuery(actor, { entity: 'actions', scope: 'board_authorized', statusGroup: 'open', visual: 'none' })
    const res = await dispatch(actor.copilot, 'get_action_details', { action_id: parsed.actionId })
    if (!res.ok) {
      const errText = res.error ?? 'No tienes permiso o la acción no existe en tu alcance autorizado.'
      if (/permiso|denegad|acceso|autorizad|no puedes|not allowed/i.test(errText) || !auth.allowed) {
        return { kind: 'forbidden', message: errText }
      }
      if (/no encontr|no existe|missing/i.test(errText)) {
        return { kind: 'empty', message: `No encontré la acción referenciada (${parsed.href}) dentro de tu alcance autorizado.` }
      }
      return { kind: 'error', message: `No pude consultar la acción referenciada: ${errText}` }
    }

    const payload = (res.data ?? {}) as ActionDetailsPayload
    const a = payload.action
    if (!a?.id) {
      return { kind: 'empty', message: `No encontré la acción referenciada (${parsed.href}) dentro de tu alcance autorizado.` }
    }

    const title = String(a.titulo ?? a.accion ?? 'Acción sin título').trim()
    const responsableId = a.responsable_id ?? (a.responsable && UUID_RE.test(a.responsable) ? a.responsable : null)
    const responsableNombre =
      a.responsable_nombre ?? (a.responsable && !UUID_RE.test(a.responsable) ? a.responsable : null)

    const ref: ReferencedAction = {
      id: a.id,
      title,
      estado: String(a.estado ?? 'Pendiente'),
      fecha: a.fecha ?? null,
      prioridad: a.prioridad ?? null,
      responsableId,
      responsableNombre,
      area: a.area ?? null,
      updatedAt: a.updated_at ?? null,
      href: `/kanban?accion=${a.id}`,
    }

    ctx.lastActions = [ref, ...ctx.lastActions.filter((item) => item.id !== ref.id)].slice(0, 10)
    ctx.lastEntity = { kind: 'action', id: ref.id, label: ref.title }

    const checklist = payload.checklist ?? []
    const doneChecks = checklist.filter((c) => c.completado).length
    const comments = payload.comments ?? []
    const summaryLines = [
      `Acción consultada: «${ref.title}»`,
      `- Estado: ${ref.estado}${ref.prioridad ? ` · Prioridad: ${ref.prioridad}` : ''}`,
      `- Responsable: ${ref.responsableNombre ?? 'Sin responsable asignado'}${ref.fecha ? ` · Fecha compromiso: ${ref.fecha.slice(0, 10)}` : ''}`,
    ]
    if (checklist.length > 0) {
      summaryLines.push(`- Checklist: ${doneChecks}/${checklist.length} completados`)
    }
    if (comments.length > 0 && comments[0]?.contenido) {
      summaryLines.push(`- Último comentario: ${comments[0].contenido}`)
    }
    summaryLines.push(`- Enlace: ${ref.href}`)

    return { kind: 'action', action: ref, summaryLines, href: ref.href, actionId: ref.id }
  }

  if (parsed.kind === 'board') {
    const scope = parsed.boardKind === 'equipo' ? 'team_authorized' : 'board_authorized'
    const auth = authorizeQuery(actor, { entity: 'actions', scope, statusGroup: 'open', visual: 'none' })
    const effectiveScope = auth.allowed ? scope : 'assigned_to_me'
    const res = await queryActions(actor.copilot, { entity: 'actions', scope: effectiveScope, statusGroup: 'open', visual: 'none' }, dispatch)
    if (res.status === 'forbidden') return { kind: 'forbidden', message: res.error?.message ?? 'No tienes acceso a este tablero.' }
    if (res.status === 'error') return { kind: 'error', message: res.error?.message ?? 'No pude consultar el tablero referenciado.' }

    const items = parsed.areaId
      ? res.items.filter((i) => !i.area || i.area.toLowerCase().includes(parsed.areaId!.toLowerCase()))
      : res.items

    const refs: ReferencedAction[] = items.slice(0, 10).map((i) => ({
      id: i.id,
      title: i.title,
      estado: i.estado,
      fecha: i.fecha,
      prioridad: i.prioridad,
      responsableId: i.responsableId,
      responsableNombre: i.responsableNombre,
      area: i.area,
      updatedAt: i.updatedAt,
      href: i.href,
    }))
    if (refs.length > 0) ctx.lastActions = refs

    if (items.length === 0) {
      return { kind: 'empty', message: `El tablero referenciado (${parsed.href}) no tiene acciones abiertas en tu alcance autorizado.` }
    }

    const boardLabel = parsed.boardKind === 'equipo' ? 'Tablero de equipo' : 'Kanban corporativo'
    const summaryLines = [
      `${boardLabel} (${parsed.href}): ${items.length} acción(es) abierta(s) en tu alcance autorizado.`,
      ...items.slice(0, 5).map(
        (i) => `- «${i.title}» (${i.estado}${i.responsableNombre ? ` · ${i.responsableNombre}` : ''}${i.fecha ? ` · ${i.fecha.slice(0, 10)}` : ''})`
      ),
    ]
    return { kind: 'board', actions: refs, summaryLines, href: parsed.href, total: items.length }
  }

  // parsed.kind === 'okr'
  const auth = authorizeQuery(actor, { entity: 'okrs', period: 'all_active' })
  if (!auth.allowed) return { kind: 'forbidden', message: auth.reason }
  const res = await queryOkrs(actor.copilot, { entity: 'okrs', period: 'all_active' }, dispatch)
  if (res.status === 'forbidden') return { kind: 'forbidden', message: res.error?.message ?? 'No tienes acceso a objetivos OKR.' }
  if (res.status === 'error') return { kind: 'error', message: res.error?.message ?? 'No pude consultar los objetivos OKR.' }

  if (parsed.objectiveId) {
    const found = res.items.find((o) => o.id === parsed.objectiveId)
    if (!found) {
      return { kind: 'empty', message: `No encontré el objetivo referenciado (${parsed.href}) dentro de tu alcance autorizado.` }
    }
    const progressLabel = found.progress == null ? 'sin datos suficientes' : `${Math.round(found.progress)}%`
    return {
      kind: 'okr',
      href: parsed.href,
      total: 1,
      objectiveTitle: found.name,
      summaryLines: [
        `Objetivo OKR consultado: «${found.name}»`,
        `- Avance: ${progressLabel}${found.withoutInitiatives ? ' · sin iniciativas vinculadas' : ''}`,
        `- Enlace: ${parsed.href}`,
      ],
    }
  }

  if (res.items.length === 0) {
    return { kind: 'empty', message: 'No hay objetivos OKR activos registrados en tu alcance autorizado.' }
  }
  return {
    kind: 'okr',
    href: parsed.href,
    total: res.items.length,
    summaryLines: [
      `Objetivos OKR activos (${parsed.href}): ${res.items.length}.`,
      ...res.items.slice(0, 5).map(
        (o) => `- «${o.name}»: ${o.progress == null ? 'sin datos suficientes' : `${Math.round(o.progress)}%`}`
      ),
    ],
  }
}
