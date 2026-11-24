/* global URL */
/**
 * Playwright probe for Preview SSO authenticated browser checks.
 *
 * - Supports Vercel Protection Bypass header, Playwright storageState, or share token.
 * - Captures Network requests to `agent_memory` / `agent_documents` and Console errors
 *   (excluding the closed `vercel.live` feedback CSP non-blocker).
 * - Never disables SSO or logs credentials/tokens.
 */
import { buildPreviewRequest } from './r3DevGuard.mjs'

const CLOSED_VERCEL_LIVE_CSP_RE = /vercel\.live\/_next-live\/feedback/i

export async function runPlaywrightPreviewProbe({
  previewConfig,
  route = '/',
  supabaseSession = null,
  supabaseRef = null,
  timeoutMs = 25_000,
  playwrightModule = null,
}) {
  let pw = playwrightModule
  if (!pw) {
    try {
      pw = await import('playwright')
    } catch (error) {
      return {
        status: 'BLOCKED',
        reason: `Playwright no disponible: ${error instanceof Error ? error.message : String(error)}`,
        memoryRequests: [],
        consoleErrors: [],
        pageErrors: [],
      }
    }
  }

  let browser
  try {
    browser = await pw.chromium.launch({ headless: true })
  } catch (error) {
    return {
      status: 'BLOCKED',
      reason: `Binario Chromium de Playwright no disponible (${error instanceof Error ? error.message.slice(0, 180) : String(error)})`,
      memoryRequests: [],
      consoleErrors: [],
      pageErrors: [],
    }
  }

  const memoryRequests = []
  const consoleErrors = []
  const pageErrors = []

  try {
    const contextOptions = {}
    if (previewConfig.storageStatePath) {
      contextOptions.storageState = previewConfig.storageStatePath
    }
    if (previewConfig.bypassSecret) {
      contextOptions.extraHTTPHeaders = {
        'x-vercel-protection-bypass': previewConfig.bypassSecret,
        'x-vercel-set-bypass-cookie': 'true',
      }
    }

    const context = await browser.newContext(contextOptions)

    if (supabaseSession && supabaseRef) {
      const storageKey = `sb-${supabaseRef}-auth-token`
      const payload = JSON.stringify(supabaseSession)
      await context.addInitScript(
        ([k, v]) => {
          window.localStorage.setItem(k, v)
        },
        [storageKey, payload],
      )
    }

    const page = await context.newPage()

    page.on('request', (req) => {
      const u = req.url()
      if (/\/rest\/v1\/(agent_memory|agent_documents)\b/i.test(u)) {
        memoryRequests.push({ method: req.method(), path: new URL(u).pathname })
      }
    })

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const text = msg.text()
      if (CLOSED_VERCEL_LIVE_CSP_RE.test(text)) return
      consoleErrors.push(text.slice(0, 240))
    })

    page.on('pageerror', (err) => {
      pageErrors.push(String(err).slice(0, 240))
    })

    const reqTarget = buildPreviewRequest(previewConfig, route)
    const response = await page.goto(reqTarget.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    const finalUrl = page.url()
    const hitSsoWall = /vercel\.com\/(login|sso-api)/i.test(finalUrl)
    const httpStatus = response ? response.status() : null

    await page.waitForTimeout(800)
    await context.close()

    if (hitSsoWall) {
      return {
        status: 'BLOCKED',
        reason: 'Preview redirigió al muro SSO de Vercel (sin bypass/storageState/share válido)',
        httpStatus,
        finalHost: new URL(finalUrl).hostname,
        memoryRequests,
        consoleErrors,
        pageErrors,
      }
    }

    const ok = (httpStatus ?? 0) >= 200 && (httpStatus ?? 0) < 400 && pageErrors.length === 0
    return {
      status: ok ? 'PASS' : 'FAIL',
      httpStatus,
      finalPath: new URL(finalUrl).pathname,
      memoryRequests,
      consoleErrors,
      pageErrors,
    }
  } catch (error) {
    return {
      status: 'FAIL',
      reason: error instanceof Error ? error.message.slice(0, 240) : String(error),
      memoryRequests,
      consoleErrors,
      pageErrors,
    }
  } finally {
    await browser.close().catch(() => {})
  }
}
