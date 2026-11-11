import { defineApiHandler } from './_shared/http.js'
import { requireAssistantAuth } from './_shared/assistantAuth.js'
import { googleConnectionMeta, GoogleUserError } from './_shared/googleUserClient.js'
import { googleScopeLabels } from '../src/features/ai-support/copilot/googleWorkspace.js'

export default defineApiHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido. Usa GET.' })
  }
  const auth = await requireAssistantAuth(req, { requireAiModule: false })
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  try {
    const meta = await googleConnectionMeta(auth.usuarioId)
    return res.status(200).json({
      ...meta,
      scope_labels: googleScopeLabels(meta.scopes),
    })
  } catch (error) {
    const message =
      error instanceof GoogleUserError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'No se pudo leer el estado de Google.'
    return res.status(500).json({ error: message.slice(0, 240) })
  }
})
