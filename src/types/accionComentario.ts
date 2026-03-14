export interface ComentarioAdjunto {
  storage_path: string
  file_name: string
}

export interface AccionComentario {
  id: string
  accion_id: string
  contenido: string
  created_by: string | null
  asignado: string | null
  etiquetas: string[]
  adjuntos: ComentarioAdjunto[]
  created_at: string
}

export interface CreateAccionComentarioInput {
  accion_id: string
  contenido: string
  created_by?: string | null
  asignado?: string | null
  etiquetas?: string[]
  adjuntos?: ComentarioAdjunto[]
}
