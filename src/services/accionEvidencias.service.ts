/**
 * Evidencias adjuntas de una acción (tabla accion_evidencias + storage).
 * PDF, PNG, JPG.
 */

import { supabase } from '@/lib/supabase/client'

const BUCKET = 'evidencias'
const TABLE = 'accion_evidencias'

export interface AccionEvidencia {
  id: string
  accion_id: string
  storage_path: string
  file_name: string | null
  content_type: string | null
  uploaded_at: string
  uploaded_by: string | null
}

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
const MAX_SIZE_MB = 10

export function isAcceptedFile(file: File): boolean {
  const ok = ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_SIZE_MB * 1024 * 1024
  return ok
}

export function getAcceptedAccept(): string {
  return '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'
}

export const accionEvidenciasService = {
  async listByAccion(accionId: string): Promise<AccionEvidencia[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('accion_id', accionId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as AccionEvidencia[]
  },

  async upload(
    accionId: string,
    file: File,
    uploadedBy: string | null
  ): Promise<AccionEvidencia> {
    if (!isAcceptedFile(file)) {
      throw new Error('Solo se permiten PDF, PNG o JPG (máx. 10 MB)')
    }
    const ext = file.name.split('.').pop() ?? 'bin'
    const path = `acciones/${accionId}/${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        accion_id: accionId,
        storage_path: path,
        file_name: file.name,
        content_type: file.type,
        uploaded_by: uploadedBy,
      })
      .select()
      .single()
    if (error) throw error
    return row as AccionEvidencia
  },

  async getSignedUrl(storagePath: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresIn)
    if (error) throw error
    return data.signedUrl
  },

  async delete(id: string): Promise<void> {
    const { data: row } = await supabase
      .from(TABLE)
      .select('storage_path')
      .eq('id', id)
      .single()
    if (row?.storage_path) {
      await supabase.storage.from(BUCKET).remove([row.storage_path])
    }
    const { error } = await supabase.from(TABLE).delete().eq('id', id)
    if (error) throw error
  },
}
