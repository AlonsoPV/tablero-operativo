import type { JsonResponse, VercelRequestLike } from './http.js'
import {
  createServiceRoleClient,
  isSuperAdminAssistantUser,
  requireAssistantAuth,
} from './assistantAuth.js'
import { todayWallClockCDMX } from '../../src/lib/dateUtils.js'
import { buildProactiveCandidates, decideDryRun, decideGroupedDryRun, prefsFromRow } from './proactivePlanner.js'

export async function handleProactivePlanner(req: VercelRequestLike, res: JsonResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' })
    const cron = req.headers?.['x-cron-secret']
    const cronOk =
      typeof cron === 'string' &&
      Boolean(process.env.CRON_SECRET) &&
      cron === process.env.CRON_SECRET
    if (!cronOk) {
      const auth = await requireAssistantAuth(req, { requireAiModule: true })
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error })
      const admin = await isSuperAdminAssistantUser(auth.supabase, auth.authUserId, auth.usuarioId, auth.rol)
      if (!admin) return res.status(403).json({ error: 'Solo Super Admin o cron autorizado.' })
    }

    const admin = createServiceRoleClient()
    const { data: settings } = await admin
      .from('whatsapp_followup_settings')
      .select('proactive_enabled')
      .eq('id', 'default')
      .maybeSingle()
    if (settings?.proactive_enabled === true) {
      return res.status(200).json({
        dryRun: true,
        insertedJobs: 0,
        note: 'proactive_enabled está true; este planner sigue en dry-run y no encola envíos.',
      })
    }

    const today = todayWallClockCDMX()
    const { data: actions } = await admin
      .from('acciones_diarias')
      .select('id,titulo_accion,estado,fecha,responsable,updated_at')
      .in('estado', ['Pendiente', 'En_Ejecucion', 'Bloqueado', 'Retraso', 'Hecho'])
      .limit(400)

    const candidates = buildProactiveCandidates(actions ?? [], today)
    const userIds = [...new Set(candidates.map((c) => c.usuarioId))]
    const { data: prefsRows } = userIds.length
      ? await admin.from('whatsapp_proactive_preferences').select('*').in('usuario_id', userIds)
      : { data: [] }
    const prefsByUser = new Map(
      (prefsRows ?? []).map((row) => [String(row.usuario_id), prefsFromRow(row as never)])
    )
    const { data: logs } = await admin
      .from('whatsapp_proactive_sent_log')
      .select('dedupe_key')
      .gte('created_at', `${today}T00:00:00.000Z`)
    const sentKeys = new Set((logs ?? []).map((row) => String(row.dedupe_key)))
    const nowIso = new Date().toISOString()
    const decided = decideDryRun(candidates, prefsByUser, sentKeys, nowIso)
    const grouped = decideGroupedDryRun(candidates, prefsByUser, sentKeys, nowIso)

    const rows = decided.slice(0, 80).map(({ candidate, decision }) => ({
      usuario_id: candidate.usuarioId,
      dedupe_key: decision.dedupeKey,
      category: candidate.category,
      status: 'dry_run',
      reason: decision.allowed ? 'would_send' : decision.reason,
    }))
    if (rows.length) {
      await admin.from('whatsapp_proactive_sent_log').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    }

    return res.status(200).json({
      dryRun: true,
      insertedJobs: 0,
      candidates: candidates.length,
      evaluated: decided.length,
      wouldSend: grouped.filter((row) => row.digest.allowed).length,
      wouldSendItems: decided.filter((d) => d.decision.allowed).length,
      logged: rows.length,
      grouped: grouped.slice(0, 40).map(({ usuarioId, missingConsent, digest }) => ({
        usuarioId,
        missingConsent,
        allowed: digest.allowed,
        includedCount: digest.includedCount,
        suppressedCount: digest.suppressedCount,
        suppressedReasons: [...new Set(digest.suppressedReasons)],
        preview: digest.bodyText,
      })),
    })
  } catch (error) {
    console.error('whatsapp-proactive-planner', error)
    return res.status(500).json({ error: 'No pude evaluar el seguimiento proactivo.' })
  }
}
