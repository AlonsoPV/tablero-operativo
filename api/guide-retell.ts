/**
 * Router Hobby: webhook | web-call | queue-workspace-draft
 */
import { apiOpOf } from './_shared/apiOp.js'
import { defineOpRouter } from './_shared/routeHandler.js'
import guideRetellWebhook from './_shared/handlers/guide-retell-webhook.js'
import guideRetellWebCall from './_shared/handlers/guide-retell-web-call.js'
import guideQueueWorkspaceDraft from './_shared/handlers/guide-queue-workspace-draft.js'

function resolveOp(req: { url?: string }) {
  const op = apiOpOf(req, ['guide-retell-', 'guide-'])
  if (op === 'webhook' || op === 'guide-retell-webhook') return 'webhook'
  if (op === 'web-call' || op === 'webcall' || op === 'guide-retell-web-call') return 'web-call'
  if (
    op === 'queue-workspace-draft' ||
    op === 'queue_workspace_draft' ||
    op === 'guide-queue-workspace-draft'
  ) {
    return 'queue-workspace-draft'
  }
  const leaf = (req.url || '').split('?')[0]?.split('/').filter(Boolean).pop() || ''
  if (leaf.includes('webhook')) return 'webhook'
  if (leaf.includes('web-call')) return 'web-call'
  if (leaf.includes('queue-workspace')) return 'queue-workspace-draft'
  return op
}

export default defineOpRouter(
  resolveOp,
  {
    webhook: guideRetellWebhook,
    'web-call': guideRetellWebCall,
    'queue-workspace-draft': guideQueueWorkspaceDraft,
  },
  'Operacion Retell desconocida.'
)
