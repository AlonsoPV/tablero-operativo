/**
 * Carga .env en process.env (solo para scripts Node, sin dependencia dotenv).
 * Busca: raíz del repo (padre de scripts/) y, por si acaso, process.cwd().
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

export function loadDotenv(scriptImportMetaUrl) {
  const scriptDir = dirname(fileURLToPath(scriptImportMetaUrl))
  const candidates = [
    resolve(scriptDir, '..', '.env'),
    resolve(process.cwd(), '.env'),
  ]
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue
    let text = readFileSync(envPath, 'utf8')
    if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1)
    }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq <= 0) continue
      const key = line.slice(0, eq).trim()
      let val = line.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (key) process.env[key] = val
    }
    return envPath
  }
  return null
}
