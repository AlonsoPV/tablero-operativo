/**
 * Mensajes y reglas de validación compartidos para catálogos.
 * Centraliza criterios para consistencia entre formularios y servicios.
 */

export const VALIDATION = {
  /** Nombre: requerido */
  nombreRequired: 'El nombre es obligatorio',
  /** Nombre: longitud mínima (sin contar espacios) */
  nombreMin: 'Mínimo 2 caracteres',
  /** Nombre: longitud máxima */
  nombreMax: 'Máximo 100 caracteres',
  /** Clave/Key: requerido */
  keyRequired: 'La clave es obligatoria',
  keyMax: 'Máximo 80 caracteres',
  /** Orden numérico */
  ordenMin: 'Orden debe ser ≥ 0',
  /** Descripción opcional (sin mensaje; se usa transform) */
} as const

/** Longitudes usadas en BD y schemas (spec) */
export const LIMITS = {
  nombreMinLength: 2,
  nombreMaxLength: 100,
  keyMaxLength: 80,
  ordenMin: 0,
} as const
