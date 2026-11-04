import { describe, expect, it } from 'vitest'
import { looksLikeCreateWork, looksLikeDraftCorrection, resolveWriteIntent } from './writeIntent'

describe('writeIntent', () => {
  it('detecta pedidos de crear accion o iniciativa', () => {
    expect(looksLikeCreateWork('Crea una accion para cerrar evidencias')).toBe(true)
    expect(looksLikeCreateWork('Generame una iniciativa de OTIF')).toBe(true)
    expect(looksLikeCreateWork('Crea un KR de OTIF')).toBe(true)
    expect(looksLikeCreateWork('Generame un objetivo de ventas')).toBe(true)
    expect(looksLikeCreateWork('Registra una medicion de scrap')).toBe(true)
    expect(looksLikeCreateWork('Que conviene priorizar hoy?')).toBe(false)
  })

  it('respeta Crear aunque el texto no lo pida', () => {
    expect(resolveWriteIntent('revisa el tablero', 'create')).toBe('create')
    expect(resolveWriteIntent('revisa el tablero', 'consult')).toBe('consult')
  })

  it('detecta correccion de fecha sobre un borrador', () => {
    expect(looksLikeDraftCorrection('no, es el 7 de noviembre')).toBe(true)
    expect(looksLikeDraftCorrection('el viernes')).toBe(true)
    expect(looksLikeDraftCorrection('Crea una accion para comprar insumos')).toBe(false)
  })
})
