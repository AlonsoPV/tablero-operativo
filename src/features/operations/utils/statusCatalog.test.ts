import { describe, expect, it } from 'vitest'
import type { Status } from '@/features/catalogs/types/catalogs.types'
import { ACTION_STATUS } from '@/types'
import {
  activeEstadoFilterOptions,
  getStatusCatalogKey,
  inferStatusCatalogKeyFromNombre,
  isActionStatusActiveInCatalog,
  orderedActionStatuses,
  statusCatalogByKey,
  statusCatalogLabel,
} from './statusCatalog'

function status(partial: Partial<Status> & Pick<Status, 'nombre'>): Status {
  return {
    id: partial.id ?? crypto.randomUUID(),
    nombre: partial.nombre,
    descripcion: partial.descripcion ?? null,
    color: partial.color ?? null,
    orden: partial.orden ?? 0,
    es_cierre: partial.es_cierre ?? false,
    activo: partial.activo ?? true,
    estado_key: partial.estado_key ?? null,
    created_at: partial.created_at ?? '',
    updated_at: partial.updated_at ?? '',
  }
}

describe('getStatusCatalogKey', () => {
  it('maps renamed labels via estado_key', () => {
    const row = status({ nombre: 'Backlog operativo', estado_key: 'Pendiente', orden: 10 })
    expect(getStatusCatalogKey(row)).toBe('Pendiente')
    expect(statusCatalogLabel('Pendiente', { Pendiente: row })).toBe('Backlog operativo')
  })

  it('infers keys from common Spanish aliases', () => {
    expect(inferStatusCatalogKeyFromNombre('En ejecución')).toBe('En_Ejecucion')
    expect(inferStatusCatalogKeyFromNombre('Validación')).toBe('Verificado')
    expect(inferStatusCatalogKeyFromNombre('Asignado')).toBe('Pendiente')
    expect(inferStatusCatalogKeyFromNombre('Por verificar')).toBe('Hecho')
    expect(getStatusCatalogKey(status({ nombre: 'En proceso', orden: 30 }))).toBe('En_Ejecucion')
  })
})

describe('statusCatalogByKey', () => {
  it('prefers active rows when duplicates map to the same key', () => {
    const map = statusCatalogByKey([
      status({
        id: 'old',
        nombre: 'Pendiente legacy',
        estado_key: 'Pendiente',
        activo: false,
        updated_at: '2026-01-02',
      }),
      status({
        id: 'new',
        nombre: 'Por hacer',
        estado_key: 'Pendiente',
        activo: true,
        updated_at: '2026-01-01',
      }),
    ])
    expect(map.Pendiente?.nombre).toBe('Por hacer')
  })
})

describe('isActionStatusActiveInCatalog', () => {
  it('hides blocked metric when Bloqueado is inactive', () => {
    const catalog = [
      status({ nombre: 'Bloqueado', estado_key: 'Bloqueado', activo: false, orden: 40 }),
    ]
    expect(isActionStatusActiveInCatalog(catalog, 'Bloqueado')).toBe(false)
  })
})

describe('orderedActionStatuses', () => {
  it('excludes deactivated catalog statuses from columns and filters', () => {
    const catalog = [
      status({ nombre: 'Pendiente', estado_key: 'Pendiente', orden: 10, activo: true }),
      status({ nombre: 'Verificado', estado_key: 'Verificado', orden: 70, activo: false }),
      status({ nombre: 'Hoy', estado_key: 'Hoy', orden: 20, activo: false }),
    ]

    const ordered = orderedActionStatuses(catalog, [...ACTION_STATUS])
    expect(ordered).toContain('Pendiente')
    expect(ordered).not.toContain('Verificado')
    expect(ordered).not.toContain('Hoy')
  })

  it('keeps fallback statuses only when missing from catalog', () => {
    const catalog = [
      status({ nombre: 'Pendiente', estado_key: 'Pendiente', orden: 10, activo: true }),
      status({ nombre: 'Verificado', estado_key: 'Verificado', orden: 70, activo: false }),
    ]

    const ordered = orderedActionStatuses(catalog, [...ACTION_STATUS])
    expect(ordered[0]).toBe('Pendiente')
    expect(ordered).not.toContain('Verificado')
    expect(ordered).toContain('Hoy')
  })
})

describe('activeEstadoFilterOptions', () => {
  it('builds filter options from active statuses only', () => {
    const catalog = [
      status({ nombre: 'Pendiente', estado_key: 'Pendiente', orden: 10, activo: true }),
      status({ nombre: 'Verificado', estado_key: 'Verificado', orden: 70, activo: false }),
    ]

    const options = activeEstadoFilterOptions(catalog, [...ACTION_STATUS])
    expect(options[0]).toEqual({ value: 'all', label: 'Todos los estados' })
    expect(options.some((o) => o.value === 'Verificado')).toBe(false)
    expect(options.some((o) => o.value === 'Pendiente')).toBe(true)
  })
})
