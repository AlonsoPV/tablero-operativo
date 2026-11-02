import tls from 'node:tls'

let applied = false

/**
 * En Windows con antivirus/proxy, Node no usa el almacén del sistema por defecto.
 * Equivale a arrancar con `--use-system-ca` (Node 22.14+ / 24).
 */
export function enableSystemCaCertificates(): void {
  if (applied) return
  applied = true

  const getCA = (tls as typeof tls & {
    getCACertificates?: (type?: string) => string[]
  }).getCACertificates
  const setCA = (tls as typeof tls & {
    setDefaultCACertificates?: (certs: readonly string[]) => void
  }).setDefaultCACertificates

  if (typeof getCA !== 'function' || typeof setCA !== 'function') return

  try {
    const bundled = getCA('default')
    const system = getCA('system')
    const extra = getCA('extra')
    setCA([...new Set([...bundled, ...system, ...extra])])
  } catch (error) {
    console.warn('[tls] No se pudieron cargar certificados del sistema:', error)
  }
}
