/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** URL base de la app (ej. https://tu-app.vercel.app). Usada para el enlace de recuperación de contraseña. Si no se define, se usa window.location.origin. */
  readonly VITE_APP_URL?: string
  /** Primer día del mes 1 del programa O2C (ISO YYYY-MM-DD). Habilita mes de programa 1–18 y metas M3 en vista MD. */
  readonly VITE_O2C_PROGRAM_START?: string
  /**
   * Solo desarrollo/demo: instantánea fija de “ahora” (ISO 8601). Ej. `2026-04-10T16:58:00-06:00`.
   * Afecta mes O2C, “hoy” CDMX, filtros de historial y valores por defecto de mediciones. No usar en producción.
   */
  readonly VITE_DEV_FIXED_NOW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
