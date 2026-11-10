/**
 * Envia por WhatsApp el informe ya guardado. Requiere sesion del dueno.
 * confirm=false devuelve la vista previa; confirm=true envia.
 */
import { createServiceRoleClient, requireAssistantAuth } from './_shared/assistantAuth.js'
import { shareGuideReport } from './_shared/shareGuideReport.js'
import { defineApiHandler, readRequestBody } from './_shared/http.js'

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido.' })
  const auth = await requireAssistantAuth(req, { requireAiModule: true })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const body = (await readRequestBody(req)) as { entry_id?: unknown; confirm?: unknown } | null
  const entryId = typeof body?.entry_id === 'string' ? body.entry_id.trim() : ''
  if (!entryId) return res.status(400).json({ error: 'Falta el informe.' })

  const { data: journal, error } = await auth.supabase
    .from('guide_journal_entries')
    .select('id,usuario_id,topic,summary,executive_report')
    .eq('id', entryId)
    .eq('usuario_id', auth.usuarioId)
    .maybeSingle()
  if (error || !journal?.id) return res.status(404).json({ error: 'No se encontro el informe.' })

  let admin: ReturnType<typeof createServiceRoleClient>
  try {
    admin = createServiceRoleClient()
  } catch {
    return res.status(500).json({ error: 'Falta la configuracion del servidor.' })
  }
  const share = await shareGuideReport(admin, journal, body?.confirm === true)
  return res.status(200).json({
    ok: share.ok,
    code: share.code,
    preview: share.preview,
    phone: share.phone,
    sent: share.code === 'sent',
  })
})
