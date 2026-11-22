import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from '@/lib/fetchWithTimeout'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const MISSING_SUPABASE_ENV =
  'Supabase: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY deben estar definidos. En Vercel: Settings → Environment Variables (Production) y nuevo deploy.'

if (!supabaseUrl || !supabaseAnonKey) {
  if (import.meta.env.PROD) {
    console.error(MISSING_SUPABASE_ENV)
  } else {
    console.warn(MISSING_SUPABASE_ENV)
  }
}

/** URL del proyecto Supabase (misma que usa auth). Úsala para Edge Functions. */
export const SUPABASE_URL = supabaseUrl ?? ''
export const SUPABASE_ANON_KEY = supabaseAnonKey ?? ''

const clientOptions = {
  global: {
    fetch: fetchWithTimeout,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
} as const

function createBrowserClient(): SupabaseClient {
  // supabase-js rechaza URL vacía: no instanciar en el import (rompe tests unitarios).
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(MISSING_SUPABASE_ENV)
  }
  return createClient(supabaseUrl, supabaseAnonKey, clientOptions)
}

let browserClient: SupabaseClient | undefined

/**
 * Cliente browser: sesión en localStorage, refresh automático.
 * `detectSessionInUrl` procesa enlaces mágicos / recovery en la URL.
 * Lazy: importar este módulo no exige credenciales; el primer uso sí.
 * No forzar `flowType: 'pkce'`: en algunos entornos provoca que `getSession()` no termine en el bootstrap.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    browserClient ??= createBrowserClient()
    const value = Reflect.get(browserClient, prop, receiver)
    return typeof value === 'function' ? value.bind(browserClient) : value
  },
})
