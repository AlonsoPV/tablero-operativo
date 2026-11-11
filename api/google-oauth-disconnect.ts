import { defineApiHandler } from './_shared/http.js'
import { requireAssistantAuth } from './_shared/assistantAuth.js'
import { disconnectGoogleConnection, GoogleUserError } from './_shared/googleUserClient.js'

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
  }
  const auth = await requireAssistantAuth(req, { requireAiModule: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  try {
    await disconnectGoogleConnection(auth.usuarioId)
    return res.status(200).json({ ok: true, status: 'revoked' })
  } catch (error) {
    const message =
      error instanceof GoogleUserError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'No se pudo desconectar Google.'
    return res.status(400).json({ error: message.slice(0, 240) })
  }
})
