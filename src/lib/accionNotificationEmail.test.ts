import { describe, expect, it } from 'vitest'
import {
  ACCION_SHARE_EMAIL_TITLE,
  buildAccionEmailPayload,
} from './accionNotificationEmail'

describe('buildAccionEmailPayload', () => {
  it('builds the Kanban share payload shape', () => {
    const payload = buildAccionEmailPayload({
      accionId: 'accion-1',
      tituloAccion: 'Cerrar reporte',
      descripcionAccion: 'Como: entregar excel\n\nQuiero: avance',
      responsableId: 'user-2',
      responsableNombre: 'Ana',
      fecha: '2026-11-20',
      horaLimite: '14:30:00',
      creadorId: 'user-1',
      creadorNombre: 'Alonso',
      checklist: ['Revisar datos', '  Enviar  '],
      titulo: ACCION_SHARE_EMAIL_TITLE,
      asignadorId: 'user-1',
      asignadorNombre: 'Alonso',
    })

    expect(payload).toMatchObject({
      titulo: ACCION_SHARE_EMAIL_TITLE,
      titulo_accion: 'Cerrar reporte',
      responsable_id: 'user-2',
      responsable_nombre: 'Ana',
      fecha_compromiso: '2026-11-20 14:30',
      accion_id: 'accion-1',
      asignador_id: 'user-1',
      checklist: ['Revisar datos', 'Enviar'],
    })
    expect(String(payload.descripcion_accion || '')).toContain('entregar excel')
  })

  it('omits empty optional fields', () => {
    const payload = buildAccionEmailPayload({
      accionId: 'accion-2',
      tituloAccion: '  ',
      descripcionAccion: '',
      checklist: ['', '  '],
    })
    expect(payload.titulo_accion).toBeUndefined()
    expect(payload.descripcion_accion).toBeUndefined()
    expect(payload.checklist).toEqual([])
    expect(payload.titulo).toBe('Te asignaron como responsable')
  })
})
