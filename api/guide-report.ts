/**
 * Router Hobby: link-report | share
 */
import { apiOpOf } from './_shared/apiOp.js'
import { defineOpRouter } from './_shared/routeHandler.js'
import guideLinkReport from './_shared/handlers/guide-link-report.js'
import guideReportShare from './_shared/handlers/guide-report-share.js'

function resolveOp(req: { url?: string }) {
  const op = apiOpOf(req, ['guide-', 'guide-report-'])
  if (op === 'link-report' || op === 'guide-link-report') return 'link-report'
  if (op === 'share' || op === 'report-share' || op === 'guide-report-share') return 'share'
  const leaf = (req.url || '').split('?')[0]?.split('/').filter(Boolean).pop() || ''
  if (leaf.includes('link-report')) return 'link-report'
  if (leaf.includes('report-share') || leaf.endsWith('share')) return 'share'
  return op
}

export default defineOpRouter(
  resolveOp,
  {
    'link-report': guideLinkReport,
    share: guideReportShare,
  },
  'Operacion de informe Guía desconocida.'
)
