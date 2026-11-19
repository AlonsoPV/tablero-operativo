import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/constants'
import { canAccessRouteWithModules } from './moduleAccess'
import {
  canAccessAiAssistAndWhatsApp,
  canAccessOkrs,
  LEGACY_OKRS_AREA_GRANTS,
  resolveAccessCapabilities,
} from './permissions'

describe('resolveAccessCapabilities (R1 complemento)', () => {
  it('Super Admin: lectura y administración global', () => {
    const caps = resolveAccessCapabilities({ rol: 'super_admin' })
    expect(caps).toMatchObject({
      readAllOrganizationalData: true, readAllOkrs: true, readCrossAreaExecution: true,
      manageAll: true, adminAllOkrs: true, whatsappInbox: true, whatsappIdentityLink: true,
    })
    expect(resolveAccessCapabilities({ rol: 'Operativo', appRole: 'super_admin' }).manageAll).toBe(true)
  })

  it('Área OKRS: lectura transversal sin administración global ni lectura organizacional total', () => {
    const caps = resolveAccessCapabilities({ rol: 'Analista', area: 'Comercial', areas: ['Comercial', 'OKRS'], moduleKeys: [] })
    expect(caps).toMatchObject({
      okrsArea: true, readAllOkrs: true, readCrossAreaExecution: true,
      readAllOrganizationalData: false, manageAll: false,
    })
  })

  it('Dirección: lectura ejecutiva sin escritura, sin WhatsApp y sin poderes del área OKRS', () => {
    const caps = resolveAccessCapabilities({ rol: 'Direccion', area: 'Comercial', moduleKeys: [] })
    expect(caps).toMatchObject({
      direction: true, readAllOkrs: true, readCrossAreaExecution: true,
      okrsArea: false, manageAll: false, adminAllOkrs: false,
      whatsappAssistant: false, whatsappInbox: false, whatsappSettings: false, whatsappIdentityLink: false,
    })
  })

  it('Gerencia y Colaborador sin área OKRS no obtienen lectura transversal', () => {
    for (const rol of ['Gerente', 'Operativo', 'Analista', 'Lider']) {
      const caps = resolveAccessCapabilities({ rol, area: 'Ventas', moduleKeys: ['okrs', 'kanban'] })
      expect(caps.readAllOkrs).toBe(false)
      expect(caps.readCrossAreaExecution).toBe(false)
      expect(caps.adminAllOkrs).toBe(false)
    }
  })

  it('Inactivo: ninguna capacidad, aunque tenga rol, área o módulos', () => {
    const caps = resolveAccessCapabilities({ rol: 'super_admin', area: 'OKRS', moduleKeys: ['okrs_admin'], active: false })
    expect(Object.entries(caps).filter(([key, value]) => key !== 'legacyOkrsAreaGrants' && value === true)).toEqual([])
  })

  it('Concesión explícita por módulo de catálogo, separada por capacidad', () => {
    const caps = resolveAccessCapabilities({ rol: 'Operativo', area: 'Ventas', moduleKeys: ['whatsapp_inbox', 'okrs_admin'] })
    expect(caps).toMatchObject({
      whatsappInbox: true, adminAllOkrs: true,
      whatsappAssistant: false, whatsappSettings: false, whatsappIdentityLink: false,
      readAllOkrs: false,
    })
  })

  it('Transición: el área OKRS conserva administración y WhatsApp heredados mientras LEGACY_OKRS_AREA_GRANTS sea true', () => {
    expect(LEGACY_OKRS_AREA_GRANTS).toBe(true)
    const caps = resolveAccessCapabilities({ rol: 'Operativo', area: 'OKRS', moduleKeys: [] })
    expect(caps).toMatchObject({ adminAllOkrs: true, whatsappInbox: true, whatsappSettings: true, whatsappIdentityLink: true })
    expect(canAccessAiAssistAndWhatsApp('Operativo', null, 'OKRS')).toBe(true)
  })

  it('El área se identifica por catálogo normalizado, no por texto aproximado', () => {
    expect(canAccessOkrs('Operativo', null, 'okrs')).toBe(true)
    expect(canAccessOkrs('Operativo', null, 'OKRS Ventas')).toBe(false)
  })
})

describe('canAccessRouteWithModules · OKRs y WhatsApp', () => {
  it('Dirección entra a OKRs sin módulo okrs en su rol de catálogo', () => {
    expect(canAccessRouteWithModules('Direccion', ROUTES.OKRS, null, ['dashboard', 'kanban'], { area: 'Comercial' })).toBe(true)
  })

  it('Área OKRS entra a OKRs sin módulo; otros roles no, aunque tengan el módulo', () => {
    expect(canAccessRouteWithModules('Operativo', ROUTES.OKRS, null, ['kanban'], { area: 'OKRS' })).toBe(true)
    expect(canAccessRouteWithModules('Operativo', ROUTES.OKRS, null, ['okrs'], { area: 'Ventas' })).toBe(false)
  })

  it('WhatsApp separa bandeja y configuración por módulo', () => {
    const inboxOnly = ['whatsapp_inbox']
    expect(canAccessRouteWithModules('Operativo', ROUTES.AI_WHATSAPP_SEGUIMIENTO, null, inboxOnly, { area: 'Ventas' })).toBe(true)
    expect(canAccessRouteWithModules('Operativo', ROUTES.SETTINGS_WHATSAPP, null, inboxOnly, { area: 'Ventas' })).toBe(false)
    expect(canAccessRouteWithModules('Operativo', ROUTES.SETTINGS_WHATSAPP, null, ['whatsapp_identity_link'], { area: 'Ventas' })).toBe(true)
    expect(canAccessRouteWithModules('Direccion', ROUTES.AI_WHATSAPP_SEGUIMIENTO, null, [], { area: 'Comercial' })).toBe(false)
  })
})
