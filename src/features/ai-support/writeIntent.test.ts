import { describe, expect, it } from 'vitest'
import {
  classifyCreateKind,
  looksLikeCommsPrepare,
  looksLikeCreateWork,
  looksLikeDraftCorrection,
  resolveWriteIntent,
} from './writeIntent'

describe('writeIntent', () => {
  it('detecta pedidos de crear accion o iniciativa', () => {
    expect(looksLikeCreateWork('Crea una accion para cerrar evidencias')).toBe(true)
    expect(looksLikeCreateWork('Generame una iniciativa de OTIF')).toBe(true)
    expect(looksLikeCreateWork('Crea un KR de OTIF')).toBe(true)
    expect(looksLikeCreateWork('Generame un objetivo de ventas')).toBe(true)
    expect(looksLikeCreateWork('Registra una medicion de scrap')).toBe(true)
    expect(looksLikeCreateWork('Que conviene priorizar hoy?')).toBe(false)
  })

  it('clasifica Kanban vs iniciativa vía diccionario', () => {
    expect(classifyCreateKind('Crea una tarea para cerrar OTIF')).toBe('kanban')
    expect(classifyCreateKind('Registra una iniciativa de OTIF')).toBe('initiative')
    expect(classifyCreateKind('Genera una accion para el objetivo de ventas')).toBe('clarify')
  })

  it('respeta Crear aunque el texto no lo pida', () => {
    expect(resolveWriteIntent('revisa el tablero', 'create')).toBe('create')
    expect(resolveWriteIntent('revisa el tablero', 'consult')).toBe('consult')
  })

  it('prioriza WhatsApp/correo sobre el toggle Crear', () => {
    expect(looksLikeCommsPrepare('Prepara un WhatsApp para Jorge con el resumen')).toBe(true)
    expect(looksLikeCommsPrepare('Mandale eso a Carlos por WhatsApp')).toBe(true)
    expect(looksLikeCommsPrepare('Enviale un correo a Lucia')).toBe(true)
    expect(looksLikeCommsPrepare('Tenemos que mejorar la comunicacion por WhatsApp')).toBe(false)
    expect(looksLikeCreateWork('Generame un WhatsApp para Ana')).toBe(false)
    expect(resolveWriteIntent('Prepara un WhatsApp para Jorge', 'create')).toBe('consult')
    expect(resolveWriteIntent('Mandale el resumen a Jorge por WhatsApp', 'create')).toBe('consult')
    // Accion + aviso WhatsApp sigue siendo create
    expect(resolveWriteIntent('Crea una accion y avisale por WhatsApp', 'consult')).toBe('create')
  })

  it('detecta la intencion sin selector manual', () => {
    const detect = (text: string) => resolveWriteIntent(text, 'consult')
    expect(detect('crea una tarea para Jorge')).toBe('create')
    expect(detect('Crea una accion para revisar inventario el viernes')).toBe('create')
    expect(detect('Agenda una accion para Jorge el lunes')).toBe('create')
    expect(detect('Asigna una tarea a Lucia para revisar el inventario')).toBe('create')
    expect(detect('Cuales he asignado yo?')).toBe('consult')
    expect(detect('¿qué acciones tiene Jorge?')).toBe('consult')
    expect(detect('Cuales tengo vencidas?')).toBe('consult')
    expect(detect('Que deberia priorizar hoy?')).toBe('consult')
    expect(detect('Cuales tengo por vencer?')).toBe('consult')
  })

  it('detecta correccion de fecha sobre un borrador', () => {
    expect(looksLikeDraftCorrection('no, es el 7 de noviembre')).toBe(true)
    expect(looksLikeDraftCorrection('el viernes')).toBe(true)
    expect(looksLikeDraftCorrection('Crea una accion para comprar insumos')).toBe(false)
  })
})
