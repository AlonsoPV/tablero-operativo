import type { R4PortRunner } from './sessionTypes.js'

export type ResilienceOptions = {
  timeoutMs?: number
  /** Reintentos adicionales. Tope estricto: 2. */
  maxRetries?: number
  backoffMs?: number
  sleep?: (ms: number) => Promise<void>
  retryOn?: (error: unknown) => boolean
}

const RETRYABLE = /timeout|provider|reconnect/i

export class R4TimeoutError extends Error {
  readonly code = 'timeout' as const
  constructor(label: string, timeoutMs: number) {
    super(`${label} excedio ${timeoutMs}ms.`)
    this.name = 'R4TimeoutError'
  }
}

export function isRetryablePortError(error: unknown): boolean {
  if (error instanceof R4TimeoutError) return true
  if (error && typeof error === 'object' && 'code' in error) {
    return RETRYABLE.test(String((error as { code: unknown }).code))
  }
  if (error instanceof Error) return RETRYABLE.test(error.message)
  return false
}

export function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  if (timeoutMs <= 0) return fn()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new R4TimeoutError(label, timeoutMs)), timeoutMs)
    fn()
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error: unknown) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export async function withBoundedRetry<T>(
  fn: () => Promise<T>,
  options: ResilienceOptions = {}
): Promise<T> {
  const maxRetries = Math.min(2, Math.max(0, options.maxRetries ?? 2))
  const backoffMs = options.backoffMs ?? 25
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const retryOn = options.retryOn ?? isRetryablePortError
  let attempt = 0
  let lastError: unknown
  while (attempt <= maxRetries) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt === maxRetries || !retryOn(error)) throw error
      await sleep(backoffMs)
      attempt += 1
    }
  }
  throw lastError
}

export function createResilientPortRunner(options: ResilienceOptions = {}): R4PortRunner {
  const timeoutMs = options.timeoutMs ?? 1_500
  return async (label, fn) =>
    withBoundedRetry(
      async () => {
        const result = await withTimeout(fn, timeoutMs, label)
        if (result && typeof result === 'object' && 'ok' in result && (result as { ok: boolean }).ok === false) {
          const failed = result as { ok: false; code?: string; error?: string }
          if (failed.code && RETRYABLE.test(failed.code)) {
            throw Object.assign(new Error(failed.error ?? `${label} fallo`), {
              code: failed.code,
              result,
            })
          }
        }
        return result
      },
      {
        ...options,
        maxRetries: Math.min(2, options.maxRetries ?? 2),
      }
    )
}

/** Interpreta un resultado de puerto `{ ok: false, code }` como error reintentable. */
export function throwIfPortFailed<T extends { ok: boolean; code?: string; error?: string }>(
  result: T,
  label: string
): T {
  if (result.ok) return result
  const error = Object.assign(new Error(result.error ?? `${label} fallo`), {
    code: result.code ?? 'provider',
  })
  throw error
}
