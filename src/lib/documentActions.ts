import { getFileExtension } from './evidenciaFileTypes'

const PREVIEWABLE_MIME_PREFIXES = ['image/']
const PREVIEWABLE_MIME_TYPES = new Set(['application/pdf'])
const PREVIEWABLE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg'])

export function isPreviewableDocument(input: {
  fileName?: string | null
  contentType?: string | null
}): boolean {
  const contentType = input.contentType?.toLowerCase() ?? ''
  if (PREVIEWABLE_MIME_TYPES.has(contentType)) return true
  if (PREVIEWABLE_MIME_PREFIXES.some((prefix) => contentType.startsWith(prefix))) return true

  const ext = input.fileName ? getFileExtension(input.fileName) : null
  return !!ext && PREVIEWABLE_EXTENSIONS.has(ext)
}

export function openDocumentInNewTab(url: string): void {
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (win) win.opener = null
}

export async function downloadDocumentFromUrl(url: string, fileName: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('No se pudo descargar el archivo.')

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName || 'documento'
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export function downloadLocalFile(file: File): void {
  const objectUrl = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = file.name
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

export function openLocalFile(file: File): void {
  const objectUrl = URL.createObjectURL(file)
  openDocumentInNewTab(objectUrl)
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}
