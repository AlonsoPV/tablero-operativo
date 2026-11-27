import { describe, expect, it } from 'vitest'
import { parseAdvisoryPlanItems } from './advisoryPlan.js'

const TODAY = '2026-11-27'

describe('parseAdvisoryPlanItems', () => {
  it('extracts numbered plan items with owner and date', () => {
    const plan = `Para ejecutar el plan de auditoría de inventarios:

1.  Auditoría y diagnóstico de inventario QA P0
       Responsable: Antonio
       Fecha límite: 2026-11-27

2.  Auditoría y diagnóstico de inventario QA R2
       Responsable: Antonio
       Fecha límite: 2026-11-27

¿Estás de acuerdo con esta asignación?`

    const items = parseAdvisoryPlanItems(plan, TODAY)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      titulo: 'Auditoría y diagnóstico de inventario QA P0',
      responsableHint: 'Antonio',
      fecha: '2026-11-27',
    })
    expect(items[1]?.titulo).toMatch(/QA R2/)
  })

  it('falls back to today when a bullet has no date', () => {
    const items = parseAdvisoryPlanItems(
      '- Contar ítems críticos de inventario\n- Comparar físico vs sistema',
      TODAY
    )
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(items[0]?.fecha).toBe(TODAY)
    expect(items[0]?.titulo).toMatch(/ítems críticos/i)
  })
})
