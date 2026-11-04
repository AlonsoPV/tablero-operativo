import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from './cors.ts'

/**
 * Exige can_use_ai_whatsapp() (área OKRS o Super Admin) usando el JWT del caller.
 * Fail closed si la RPC no existe o falla.
 */
export async function requireAiWhatsappAccess(token: string): Promise<Response | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('VITE_SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anon) {
    return jsonResponse({ error: 'Configuración de servidor incompleta' }, 500)
  }

  const userClient = createClient(supabaseUrl, anon, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data, error } = await userClient.rpc('can_use_ai_whatsapp')
  if (error) {
    console.error('can_use_ai_whatsapp rpc', error.message)
    return jsonResponse(
      {
        error:
          'No se pudo validar acceso al asistente. Aplica la migracion can_use_ai_whatsapp o contacta a soporte.',
      },
      403
    )
  }
  if (data !== true) {
    return jsonResponse(
      { error: 'El Asistente IA solo esta disponible para el area OKRS y Super Admin.' },
      403
    )
  }
  return null
}
