import { supabase } from '@/lib/supabase/client'

/**
 * Headers JSON + Bearer para APIs privadas del Asistente IA en Vercel.
 */
export async function getAssistantAuthHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('refresh token') || message.includes('invalid jwt')) {
      throw new Error('Tu sesion expiro. Cierra sesion e inicia de nuevo.')
    }
    throw error
  }
  const token = data.session?.access_token
  if (!token) {
    throw new Error('Sesion no disponible. Inicia sesion para usar el Asistente IA.')
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}
