/**
 * Router Hobby: create | validate | consent
 * URLs públicas: /api/create-guide-user-link, /api/validate-guide-user-link, /api/consent-guide-user-link
 */
import { apiOpOf } from './_shared/apiOp.js'
import { defineOpRouter } from './_shared/routeHandler.js'
import consentGuideUserLink from './_shared/handlers/consent-guide-user-link.js'
import createGuideUserLink from './_shared/handlers/create-guide-user-link.js'
import validateGuideUserLink from './_shared/handlers/validate-guide-user-link.js'

function resolveOp(req: { url?: string }) {
  const op = apiOpOf(req, ['guide-user-link-'])
  if (op === 'create' || op === 'create-guide-user-link') return 'create'
  if (op === 'validate' || op === 'validate-guide-user-link') return 'validate'
  if (op === 'consent' || op === 'consent-guide-user-link') return 'consent'
  // Path leaf when rewrite missing: create-guide-user-link / validate-guide-user-link
  const leaf = (req.url || '').split('?')[0]?.split('/').filter(Boolean).pop() || ''
  if (leaf.includes('create')) return 'create'
  if (leaf.includes('validate')) return 'validate'
  if (leaf.includes('consent')) return 'consent'
  return op
}

export default defineOpRouter(resolveOp, {
  create: createGuideUserLink,
  validate: validateGuideUserLink,
  consent: consentGuideUserLink,
}, 'Operacion de liga Guía desconocida.')
