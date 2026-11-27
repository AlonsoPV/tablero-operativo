import { readRequestBody, type JsonResponse, type VercelRequestLike } from './http.js'
import {
  checkAssistantRateLimit,
  createServiceRoleClient,
  isSuperAdminAssistantUser,
  requireAssistantAuth,
} from './assistantAuth.js'
import { listDocuments, publishDocument, withdrawDocument } from './memory/store.js'

export async function handleR3Documents(req: VercelRequestLike, res: JsonResponse) {
  try {
    const auth = await requireAssistantAuth(req, { requireAiModule: true })
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

    const isAdmin = await isSuperAdminAssistantUser(auth.supabase, auth.authUserId, auth.usuarioId, auth.rol)
    if (!isAdmin) return res.status(403).json({ error: 'Solo Super Admin puede gestionar documentos R3.' })

    const rate = checkAssistantRateLimit({
      key: `${auth.usuarioId}:r3-documents`,
      limit: 20,
      windowMs: 60_000,
    })
    if (rate.ok === false) {
      return res.status(429).json({ error: `Espera ${rate.retryAfterSec}s.` })
    }

    const admin = createServiceRoleClient()

    if (req.method === 'GET') {
      const listed = await listDocuments(admin)
      if (!listed.ok) return res.status(500).json({ error: listed.error })
      return res.status(200).json({
        documents: listed.documents.map((row) => ({
          id: row.id,
          logicalId: row.logical_id,
          title: row.title,
          version: row.version,
          status: row.status,
          sourceLabel: row.source_label,
          publishedAt: row.published_at,
          withdrawnAt: row.withdrawn_at,
          excerpt: row.body.slice(0, 240),
        })),
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Usa GET o POST.' })
    const body = await readRequestBody(req)
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Solicitud invalida.' })
    const payload = body as {
      action?: unknown
      title?: unknown
      body?: unknown
      sourceLabel?: unknown
      logicalId?: unknown
    }
    const action = typeof payload.action === 'string' ? payload.action : ''
    const logicalId = typeof payload.logicalId === 'string' ? payload.logicalId.trim() : ''

    if (action === 'withdraw') {
      if (!logicalId) return res.status(400).json({ error: 'Indica el logical_id a retirar.' })
      const withdrawn = await withdrawDocument(admin, logicalId)
      if (!withdrawn.ok) return res.status(500).json({ error: withdrawn.error })
      try {
        await admin.from('assistant_op_log').insert({
          usuario_id: auth.usuarioId,
          tool: 'r3_document_withdraw',
          result: 'ok',
          channel: 'web',
          payload: { logicalId: withdrawn.logicalId, count: withdrawn.count },
        })
      } catch {
        /* auditoría best-effort */
      }
      return res.status(200).json({ withdrawn: true, logicalId: withdrawn.logicalId, count: withdrawn.count })
    }

    if (action !== 'publish') {
      return res.status(400).json({ error: 'Acción inválida. Usa publish o withdraw.' })
    }

    const published = await publishDocument(admin, {
      title: typeof payload.title === 'string' ? payload.title : '',
      body: typeof payload.body === 'string' ? payload.body : '',
      sourceLabel: typeof payload.sourceLabel === 'string' ? payload.sourceLabel : 'sop',
      logicalId: logicalId || undefined,
    })
    if (!published.ok) return res.status(400).json({ error: published.error })
    try {
      await admin.from('assistant_op_log').insert({
        usuario_id: auth.usuarioId,
        tool: 'r3_document_publish',
        result: 'ok',
        channel: 'web',
        payload: {
          logicalId: published.document.logical_id,
          version: published.document.version,
        },
      })
    } catch {
      /* auditoría best-effort */
    }
    return res.status(200).json({
      published: true,
      document: {
        id: published.document.id,
        logicalId: published.document.logical_id,
        title: published.document.title,
        version: published.document.version,
        status: published.document.status,
        sourceLabel: published.document.source_label,
      },
    })
  } catch (error) {
    console.error('assistant-r3-documents', error)
    return res.status(500).json({ error: 'No pude gestionar documentos R3.' })
  }
}
