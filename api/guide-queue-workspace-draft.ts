/**
 * Custom function de Retell: encola un borrador de correo/evento.
 * No envia nada. Al colgar, finalizeGuideInterview rellena el borrador.
 */
import { createServiceRoleClient } from './_shared/assistantAuth.js'
import { queueWorkspaceDraft } from './_shared/assistantGoogleTools.js'
import { defineApiHandler, readHeader, readRequestBody, readStringEnv } from './_shared/http.js'
import { verifyRetellSignature } from './_shared/guideInterviewReport.js'

type RetellCall = {
  call_id?: unknown
  metadata?: unknown
}

function asString(value: unknown, max = 400) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido.' })
  }

  const apiKey = readStringEnv('RETELL_API_KEY')
  const rawBody = typeof req.rawBody === 'string' ? req.rawBody : ''
  const signature = readHeader(req, 'x-retell-signature')
  if (!apiKey) {
    return res.status(503).json({ error: 'Falta RETELL_API_KEY.' })
  }
  if (!rawBody || !verifyRetellSignature(rawBody, apiKey, signature)) {
    return res.status(401).json({ error: 'Firma de Retell invalida.' })
  }

  const body = (await readRequestBody(req)) as {
    name?: unknown
    args?: unknown
    arguments?: unknown
    call?: RetellCall
  } | null
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Solicitud invalida.' })
  }

  const call = (body.call ?? {}) as RetellCall
  const metadata = (call.metadata ?? {}) as {
    guide_session_id?: unknown
    usuario_id?: unknown
    product?: unknown
  }
  if (metadata.product && metadata.product !== 'guide') {
    return res.status(200).json({ result: 'Ignorado: no es una llamada de Guia.' })
  }

  const sessionId = asString(metadata.guide_session_id, 80)
  const usuarioId = asString(metadata.usuario_id, 80)
  if (!sessionId || !usuarioId) {
    return res.status(200).json({
      result: 'No pude anotar el borrador porque falta la sesion. Sigue la conversacion; no afirmo que se envio.',
    })
  }

  const args = (
    body.args && typeof body.args === 'object'
      ? body.args
      : body.arguments && typeof body.arguments === 'object'
        ? body.arguments
        : body
  ) as Record<string, unknown>

  const typeRaw = asString(args.type, 12).toLowerCase()
  const type = typeRaw === 'event' ? 'event' : 'email'
  const purpose = asString(args.purpose, 500)
  if (!purpose) {
    return res.status(200).json({
      result: 'Necesito el proposito del correo o evento para dejar el borrador. No envio nada ahora.',
    })
  }

  const attendees = Array.isArray(args.attendees)
    ? args.attendees.map((item) => String(item).trim()).filter(Boolean)
    : asString(args.attendees, 300)
      ? asString(args.attendees, 300).split(/[,;]+/).map((item) => item.trim()).filter(Boolean)
      : undefined

  try {
    const supabase = createServiceRoleClient()
    const { data: usuario, error } = await supabase
      .from('usuarios')
      .select('id,user_id,rol,activo')
      .eq('id', usuarioId)
      .maybeSingle()
    if (error || !usuario?.id || usuario.activo === false || !usuario.user_id) {
      return res.status(200).json({ result: 'No pude anotar el borrador para este usuario.' })
    }
    const proposal = await queueWorkspaceDraft(
      {
        supabase,
        usuarioId,
        authUserId: String(usuario.user_id),
        rol: typeof usuario.rol === 'string' ? usuario.rol : null,
      },
      {
        type,
        recipient: asString(args.recipient, 160) || undefined,
        attendees,
        purpose,
        utteredAt: asString(args.uttered_at, 40) || new Date().toISOString(),
        timeAnchor: asString(args.time_anchor, 80) || undefined,
        sessionId,
      }
    )
    return res.status(200).json({
      result: `Deje un borrador de ${type === 'event' ? 'evento' : 'correo'} para revisar al terminar. No se envio. Id ${proposal.id}.`,
      pending_op_id: proposal.id,
    })
  } catch (error) {
    console.error('guide-queue-workspace-draft', error instanceof Error ? error.message : error)
    return res.status(200).json({
      result: 'No pude guardar el borrador ahora. Sigue; no afirmo que se haya enviado.',
    })
  }
})
