/**
 * Subida de archivos al bucket evidencias (para comentarios u otros).
 * Devuelve el path para guardar en BD.
 */

import { supabase } from '@/lib/supabase/client'

const BUCKET = 'evidencias'
const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
const MAX_SIZE_MB = 10

export function isAcceptedEvidenciaFile(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_SIZE_MB * 1024 * 1024
}

export async function uploadEvidenciaFile(
  folder: string,
  file: File
): Promise<{ storage_path: string; file_name: string }> {
  if (!isAcceptedEvidenciaFile(file)) {
    throw new Error('Solo se permiten PDF, PNG o JPG (máx. 10 MB)')
  }
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return { storage_path: path, file_name: file.name }
}

export async function getSignedUrlEvidencia(storagePath: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn)
  if (error) throw error
  return data.signedUrl
}
