import { describe, expect, it } from 'vitest'
import {
  canAccessRouteWithModules,
  getDefaultRouteWithModules,
  moduleKeyForPath,
} from './moduleAccess'

describe('module access', () => {
  it('resuelve rutas principales y rutas hijas', () => {
    expect(moduleKeyForPath('/dashboard')).toBe('dashboard')
    expect(moduleKeyForPath('/settings/users/abc')).toBe('settings_users')
    expect(moduleKeyForPath('/settings/catalogs/roles')).toBe('settings_catalogs')
  })

  it('usa las secciones configuradas cuando existen', () => {
    expect(canAccessRouteWithModules('Operativo', '/tickets', null, ['tickets'])).toBe(true)
    expect(canAccessRouteWithModules('Operativo', '/dashboard', null, ['tickets'])).toBe(false)
  })

  it('mantiene Analista solo en Kanban por Equipos, Disciplina y Calendario', () => {
    expect(canAccessRouteWithModules('Lider', '/kanban-equipos', null, [])).toBe(false)
    expect(canAccessRouteWithModules('Lider', '/kanban-equipos', null, ['team_kanban'])).toBe(true)
    expect(canAccessRouteWithModules('Analista', '/kanban-equipos', null, ['team_kanban'])).toBe(true)
    expect(canAccessRouteWithModules('Analista', '/kanban', null, ['kanban'])).toBe(false)
    expect(canAccessRouteWithModules('Analista', '/calendario', null, ['calendar'])).toBe(true)
    expect(canAccessRouteWithModules('Analista', '/disciplina', null, ['discipline'])).toBe(true)
    expect(canAccessRouteWithModules('Operativo', '/kanban-equipos', null, ['team_kanban'])).toBe(true)
    expect(canAccessRouteWithModules('Direccion', '/kanban-equipos', null, [])).toBe(true)
    expect(canAccessRouteWithModules('Operativo', '/kanban-equipos', 'super_admin', [])).toBe(true)
  })

  it('mantiene compatibilidad mientras la migracion aun no responde', () => {
    expect(canAccessRouteWithModules('Operativo', '/kanban', null, null)).toBe(true)
  })

  it('redirige a una seccion realmente habilitada y evita ciclos', () => {
    expect(getDefaultRouteWithModules('Direccion', null, ['tickets'])).toBe('/tickets')
    expect(getDefaultRouteWithModules('Direccion', null, [])).toBeNull()
  })
})
