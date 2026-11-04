import { supabase } from '@/lib/supabase/client'

/**
 * Headers JSON + Bearer para APIs privadas del Asistente IA en Vercel.
 */
export async function getAssistantAuthHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sesion no disponible. Inicia sesion para usar el Asistente IA.')
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}
