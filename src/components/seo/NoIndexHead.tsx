import { useEffect } from 'react'
import { applyNoIndexDocumentMeta } from '@/lib/seo/documentMeta'

/** Impide indexación de rutas de app o autenticación (complementa robots.txt). */
export function NoIndexHead({ title }: { title?: string }) {
  useEffect(() => applyNoIndexDocumentMeta(title), [title])
  return null
}
