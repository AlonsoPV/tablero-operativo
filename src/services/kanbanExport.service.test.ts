import { describe, expect, it } from 'vitest'
import { loadAllExportRows } from './kanbanExport.service'

describe('loadAllExportRows', () => {
  it('recupera todas las filas aunque la API devuelva menos que el rango solicitado', async () => {
    const source = Array.from({ length: 5 }, (_, index) => index + 1)
    const requestedOffsets: number[] = []

    const rows = await loadAllExportRows(async (from) => {
      requestedOffsets.push(from)
      return {
        data: source.slice(from, from + 2),
        error: null,
        count: source.length,
      }
    }, 3)

    expect(rows).toEqual(source)
    expect(requestedOffsets).toEqual([0, 2, 4])
  })

  it('termina por tamano de pagina cuando el conteo no esta disponible', async () => {
    const source = ['a', 'b', 'c', 'd']

    const rows = await loadAllExportRows(async (from, to) => ({
      data: source.slice(from, to + 1),
      error: null,
      count: null,
    }), 3)

    expect(rows).toEqual(source)
  })

  it('propaga errores de consulta', async () => {
    const failure = new Error('consulta fallida')

    await expect(loadAllExportRows(async () => ({
      data: null,
      error: failure,
      count: null,
    }))).rejects.toBe(failure)
  })
})
