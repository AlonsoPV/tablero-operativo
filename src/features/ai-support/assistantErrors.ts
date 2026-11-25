const GENERIC_ERROR = 'No pude completar la solicitud. Intenta de nuevo en unos segundos.'

const TECHNICAL_PATTERN =
  /\b(sql|select|insert|update|delete|relation|violates|constraint|syntax|pgrst\d*|postgres|supabase|stack|undefined|null|exception|typeerror|referenceerror)\b|[{}[\]<>]|\b[A-Z]{2,}\d{2,}\b|\bat \S+ \(/i

/** Traduce errores a lenguaje claro: nunca expone SQL, codigos internos ni JSON crudo. */
export function friendlyAssistantError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const text = raw.trim()
  if (!text) return GENERIC_ERROR
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(text)) {
    return 'No hay conexion con el asistente. Revisa tu red e intenta de nuevo.'
  }
  if (/no autorizado|unauthorized|forbidden|\b40[13]\b/i.test(text)) {
    return 'Tu sesion no tiene acceso al asistente en este momento. Vuelve a iniciar sesion e intenta de nuevo.'
  }
  if (/demasiadas consultas|too many|rate limit|\b429\b/i.test(text)) {
    return 'Hay demasiadas consultas en este momento. Espera un momento e intenta de nuevo.'
  }
  if (/endpoint|\/api\//i.test(text)) {
    return 'El servicio del asistente no esta disponible en este entorno. Intenta de nuevo mas tarde.'
  }
  if (text.length > 160 || TECHNICAL_PATTERN.test(text)) return GENERIC_ERROR
  return text
}
