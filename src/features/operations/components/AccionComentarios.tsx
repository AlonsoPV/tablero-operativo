/**
 * Comentarios de una acción: ver, crear, asignar responsable, etiquetar.
 * Fecha de creación automática.
 */

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAccionComentarios, useCreateAccionComentario } from '../hooks/useAccionComentarios'
import { notificacionesService } from '@/services/notificaciones.service'
import { useUsers } from '@/features/users/hooks/useUsers'
import { useCurrentUser } from '@/features/users/hooks/useCurrentUser'
import {
  uploadEvidenciaFile,
  getSignedUrlEvidencia,
  isAcceptedEvidenciaFile,
} from '@/services/evidenciaStorage.service'
import type { AccionComentario, ComentarioAdjunto } from '@/types/accionComentario'
import { formatDateTimeCDMX } from '@/lib/dateUtils'
import { MessageSquare, User, Tag, Paperclip, FileText, X } from 'lucide-react'
import { toast } from 'sonner'

export interface AccionComentariosProps {
  accionId: string
  /** ID del responsable de la acción (para notificarle de nuevos comentarios) */
  responsableId?: string | null
  responsableNames?: Record<string, string>
}

export function AccionComentarios({ accionId, responsableId, responsableNames = {} }: AccionComentariosProps) {
  const { data: comments = [], isLoading, isError } = useAccionComentarios(accionId)
  const { data: users = [] } = useUsers({ activo: true })
  const { data: currentUser } = useCurrentUser()
  const createComment = useCreateAccionComentario(accionId)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [contenido, setContenido] = useState('')
  const [asignado, setAsignado] = useState<string>('')
  const [etiquetasStr, setEtiquetasStr] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const contenidoTrim = contenido.trim()
    if (!contenidoTrim) {
      toast.error('Escribe un comentario')
      return
    }
    const etiquetas = etiquetasStr
      .split(/[,;]\s*/)
      .map((t) => t.trim())
      .filter(Boolean)
    const asignadoId = asignado || null
    const currentUserId = currentUser?.id ?? null
    let adjuntos: ComentarioAdjunto[] = []
    if (pendingFiles.length > 0) {
      try {
        adjuntos = await Promise.all(
          pendingFiles.map((file) =>
            uploadEvidenciaFile(`comentarios/${accionId}`, file)
          )
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Error al subir archivos')
        return
      }
    }
    createComment.mutate(
      {
        accion_id: accionId,
        contenido: contenidoTrim,
        created_by: currentUserId,
        asignado: asignadoId,
        etiquetas: etiquetas.length ? etiquetas : undefined,
        adjuntos: adjuntos.length ? adjuntos : undefined,
      },
      {
        onSuccess: async () => {
          setContenido('')
          setAsignado('')
          setEtiquetasStr('')
          setPendingFiles([])
          toast.success('Comentario agregado')
          // Crear notificaciones: asignado y responsable
          const toNotify = new Set<string>()
          if (asignadoId) toNotify.add(asignadoId)
          if (responsableId) toNotify.add(responsableId)
          for (const uid of toNotify) {
            const tipo = uid === asignadoId ? 'comentario_asignado' : 'comentario'
            const titulo = tipo === 'comentario_asignado'
              ? 'Te asignaron en un comentario'
              : 'Nuevo comentario en una acción de la que eres responsable'
            try {
              await notificacionesService.create({
                usuario_id: uid,
                tipo,
                payload: { titulo, mensaje: contenidoTrim.slice(0, 200), accion_id: accionId },
              })
            } catch {
              // Ignorar errores al crear notificación (no bloquear UX)
            }
          }
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : 'Error al agregar comentario'),
      }
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border/60 pb-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Comentarios</h4>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="comentario-contenido">Nuevo comentario</Label>
          <textarea
            id="comentario-contenido"
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            placeholder="Escribe un comentario..."
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs flex items-center gap-1">
            <Paperclip className="h-3 w-3" /> Adjuntos (PDF, PNG, JPG)
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="hidden"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                const valid = files.filter(isAcceptedEvidenciaFile)
                if (valid.length < files.length) toast.error('Solo PDF, PNG o JPG (máx. 10 MB)')
                setPendingFiles((prev) => [...prev, ...valid].slice(0, 5))
                e.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="mr-1.5 h-3.5 w-3.5" />
              Añadir archivo
            </Button>
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {pendingFiles.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                  >
                    {f.name}
                    <button
                      type="button"
                      onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                      className="rounded p-0.5 hover:bg-muted-foreground/20"
                      aria-label="Quitar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[140px] space-y-1.5">
            <Label htmlFor="comentario-asignado" className="text-xs flex items-center gap-1">
              <User className="h-3 w-3" /> Responsable
            </Label>
            <Select value={asignado || '__none__'} onValueChange={(v) => setAsignado(v === '__none__' ? '' : v)}>
              <SelectTrigger id="comentario-asignado" className="h-8 text-sm">
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[120px] space-y-1.5">
            <Label htmlFor="comentario-etiquetas" className="text-xs flex items-center gap-1">
              <Tag className="h-3 w-3" /> Etiquetas
            </Label>
            <Input
              id="comentario-etiquetas"
              value={etiquetasStr}
              onChange={(e) => setEtiquetasStr(e.target.value)}
              placeholder="Separadas por coma (ej: urgente, revisar)"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={createComment.isPending}>
          {createComment.isPending ? 'Agregando…' : 'Agregar comentario'}
        </Button>
      </form>
      <div className="space-y-3">
        {isError ? (
          <p className="text-sm text-amber-600">No se pudieron cargar los comentarios. Verifica que la migración accion_comentarios esté aplicada.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando comentarios…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin comentarios aún</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <ComentarioItem
                key={c.id}
                comment={c}
                responsableNames={responsableNames}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function AdjuntoLink({ storage_path, file_name }: ComentarioAdjunto) {
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    getSignedUrlEvidencia(storage_path)
      .then(setUrl)
      .catch(() => setErr(true))
  }, [storage_path])
  if (err) return <span className="text-muted-foreground text-xs">{file_name}</span>
  if (!url) return <span className="text-muted-foreground text-xs animate-pulse">{file_name}…</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-1 text-xs text-primary hover:underline"
    >
      <FileText className="h-3 w-3 shrink-0" />
      {file_name}
    </a>
  )
}

function ComentarioItem({
  comment,
  responsableNames,
}: {
  comment: AccionComentario
  responsableNames: Record<string, string>
}) {
  const adjuntos = comment.adjuntos ?? []
  return (
    <li className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
      <p className="whitespace-pre-wrap">{comment.contenido}</p>
      {adjuntos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {adjuntos.map((a, i) => (
            <AdjuntoLink key={`${a.storage_path}-${i}`} storage_path={a.storage_path} file_name={a.file_name} />
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span title={comment.created_at}>
          {formatDateTimeCDMX(comment.created_at)}
        </span>
        {comment.created_by && (
          <span>
            por {responsableNames[comment.created_by] ?? comment.created_by}
          </span>
        )}
        {comment.asignado && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3 w-3" />
            {responsableNames[comment.asignado] ?? comment.asignado}
          </span>
        )}
        {(comment.etiquetas ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(comment.etiquetas ?? []).map((t) => (
              <Badge key={t} variant="secondary" className="text-xs font-normal">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}
