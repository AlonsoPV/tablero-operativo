/**
 * Servicio de autenticación (Supabase Auth).
 * Spec §5.1: Login email+contraseña, registro con nombre/rol/email, validación de email.
 */

import { supabase } from '@/lib/supabase/client'

/** Mapea errores de Supabase Auth a mensajes amigables. */
export function mapAuthError(error: { message?: string }): string {
  const msg = error?.message ?? ''
  if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'Email o contraseña incorrectos. Verifica e intenta de nuevo.'
  }
  if (msg.includes('Email not confirmed')) {
    return 'Confirma tu email antes de iniciar sesión.'
  }
  if (msg.includes('User not found')) {
    return 'No existe una cuenta con ese email.'
  }
  if (msg.includes('Too many requests')) {
    return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
  }
  return msg || 'Error al iniciar sesión. Intenta de nuevo.'
}

export const authService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) throw new Error(mapAuthError(error))
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

  /**
   * Envía un email para restablecer contraseña.
   * redirectTo: URL a la que Supabase redirige tras hacer clic en el enlace del correo.
   */
  async resetPasswordForEmail(email: string, redirectTo: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    })
    if (error) throw new Error(mapAuthError(error))
  },

  /**
   * Obtiene la sesión actual (usa caché de Supabase; el refresh de token es automático).
   * La app debe depender de este estado y de onAuthStateChange; no hay timeouts manuales.
   */
  getSession() {
    return supabase.auth.getSession()
  },

  /**
   * Cambia la contraseña del usuario autenticado.
   * Verifica la contraseña actual antes de aplicar la nueva.
   */
  async changePassword(currentPassword: string, newPassword: string) {
    const { data: sessionData } = await supabase.auth.getSession()
    const email = sessionData?.session?.user?.email
    if (!email) throw new Error('No hay sesión activa')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (signInError) throw new Error('Contraseña actual incorrecta')

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) throw updateError
  },

  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },
}
