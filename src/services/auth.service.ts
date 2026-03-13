/**
 * Servicio de autenticación (Supabase Auth).
 * Spec §5.1: Login email+contraseña, registro con nombre/rol/email, validación de email.
 */

import { supabase } from '@/lib/supabase/client'

export const authService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
    return data
  },

  async signUp(
    email: string,
    password: string,
    metadata: { nombre: string; rol?: string }
  ) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })
    if (error) throw error
    return data
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  getSession() {
    return supabase.auth.getSession()
  },

  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },
}
