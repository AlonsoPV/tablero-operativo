import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY deben estar definidos en .env'
  )
}

/** Cliente Supabase. Persiste sesión en localStorage por defecto; el refresh de token es automático. */
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')
