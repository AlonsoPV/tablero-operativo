import { describe, expect, it } from 'vitest'
import type { Priority } from '@/features/catalogs/types/catalogs.types'
import { findCatalogPriority, isActiveCatalogPriority } from './priorityCatalog'

const priorities = [
  { id: 'red', nombre: 'Rojo', activo: true },
  { id: 'legacy', nombre: 'P2_Media', activo: false },
] as Priority[]

describe('priorityCatalog', () => {
  it('resuelve el nombre sin depender de espacios o mayusculas', () => {
    expect(findCatalogPriority(priorities, ' rojo ')?.id).toBe('red')
  })

  it('no acepta una prioridad heredada inactiva como seleccion vigente', () => {
    expect(isActiveCatalogPriority(priorities, 'P2_Media')).toBe(false)
    expect(isActiveCatalogPriority(priorities, 'ROJO')).toBe(true)
  })
})
