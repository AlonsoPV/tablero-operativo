import { describe, expect, it } from 'vitest'
import type { Cell } from 'write-excel-file/browser'
import writeExcelFile from 'write-excel-file/node'
import { unzipSync } from 'fflate'
import type { AccionDiaria } from '@/types'
import { buildKanbanWorkbookSheets } from './exportKanbanExcel'

function valueOf(cell: Cell): unknown {
  return cell && typeof cell === 'object' && !(cell instanceof Date) && 'value' in cell
    ? cell.value
    : cell
}

const action: AccionDiaria = {
  id: 'accion-1',
  fecha: '2026-08-05',
  titulo_accion: 'Cerrar conciliación',
  descripcion_accion: 'Validar diferencias y documentar el cierre.',
  responsable: 'user-1',
  created_by: 'user-2',
  updated_by: 'user-2',
  hora_limite: '17:00',
  evidencia_esperada: 'Reporte firmado',
  evidencia_cargada: true,
  evidencia_adjunta: null,
  estado: 'En_Ejecucion',
  kpi_afectado: null,
  gap_id: null,
  tipo_accion: 'operativa',
  story_points: 3,
  catalog_kpi_id: null,
  okr_impactado: null,
  proceso: 'Finanzas',
  area: 'Administración',
  cliente_id: null,
  prioridad: 'Alta',
  prioridad_id: 'priority-1',
  causa_raiz: null,
  responsable_bloqueo: null,
  escalado: false,
  fecha_escalamiento: null,
  notas_escalamiento: null,
  repeticion: false,
  verificador_dato: null,
  verificador_gobierno: null,
  completed_at: null,
  completed_by: null,
  verified_at: null,
  verified_by: null,
  created_at: '2026-08-01T12:00:00.000Z',
  updated_at: '2026-08-02T12:00:00.000Z',
  sprint_id: null,
}

describe('buildKanbanWorkbookSheets', () => {
  it('crea un xlsx completo y conserva nombres e identificadores', async () => {
    const sheets = buildKanbanWorkbookSheets({
      acciones: [action],
      users: [
        { id: 'user-1', nombre: 'Responsable Uno' },
        { id: 'user-2', nombre: 'Creador Dos' },
      ],
      priorities: [
        {
          id: 'priority-1',
          nombre: 'Alta',
          descripcion: null,
          color: '#ef4444',
          orden: 1,
          activo: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      statuses: [
        {
          id: 'status-1',
          estado_key: 'En_Ejecucion',
          nombre: 'Trabajando',
          descripcion: null,
          color: '#0ea5e9',
          orden: 1,
          es_cierre: false,
          activo: true,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      exportedByName: 'Dirección',
      generatedAt: new Date('2026-08-03T12:00:00Z'),
      details: {
        comentarios: [],
        checkpoints: [],
        evidencias: [],
        cambiosFecha: [],
      },
    })

    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      'Resumen',
      'Acciones',
      'Comentarios',
      'Checklist',
      'Evidencias',
      'Cambios de fecha',
    ])

    const actionSheet = sheets.find((sheet) => sheet.sheet === 'Acciones')!
    const headers = actionSheet.data[0].map(valueOf)
    const row = actionSheet.data[1]

    expect(row).toHaveLength(headers.length)
    expect(valueOf(row[headers.indexOf('Responsable')])).toBe('Responsable Uno')
    expect(valueOf(row[headers.indexOf('Responsable ID')])).toBe('user-1')
    expect(valueOf(row[headers.indexOf('Estado visible')])).toBe('Trabajando')
    expect(String(valueOf(row[headers.indexOf('JSON completo')]))).toContain('accion-1')

    for (const sheet of sheets.slice(1)) {
      const width = sheet.data[0].length
      expect(sheet.data.every((sheetRow) => sheetRow.length === width)).toBe(true)
    }

    const buffer = await writeExcelFile(
      sheets as unknown as Parameters<typeof writeExcelFile>[0],
      { fontFamily: 'Aptos', fontSize: 10 }
    ).toBuffer()
    const files = unzipSync(new Uint8Array(buffer))
    const workbookXml = new TextDecoder().decode(files['xl/workbook.xml'])

    expect(files['[Content_Types].xml']).toBeDefined()
    expect(workbookXml).toContain('name="Acciones"')
    expect(workbookXml).toContain('name="Cambios de fecha"')
    expect(Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))).toHaveLength(6)
  })
})
