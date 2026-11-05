import { describe, expect, it } from 'vitest'
import { COPILOT_FUNCTION_DECLARATIONS } from './catalog'
import { COPILOT_READ_TOOLS } from './types'

const BOARD_TOOLS = ['get_dashboard_summary', 'get_org_chart', 'get_module_data', 'search_board'] as const

describe('copilot board read coverage', () => {
  it('exposes dashboard-to-org-chart read tools', () => {
    expect(COPILOT_READ_TOOLS).toEqual(expect.arrayContaining([...BOARD_TOOLS]))
    const names = COPILOT_FUNCTION_DECLARATIONS.map((item) => item.name)
    expect(names).toEqual(expect.arrayContaining([...BOARD_TOOLS]))
  })

  it('lists the board modules the assistant can query', () => {
    const moduleTool = COPILOT_FUNCTION_DECLARATIONS.find((item) => item.name === 'get_module_data')
    expect(moduleTool?.parameters.properties?.module?.enum).toEqual(
      expect.arrayContaining([
        'dashboard',
        'kpis',
        'gaps',
        'impacto',
        'org_chart',
        'tickets',
        'team_kanban',
        'calendar',
        'challenges',
        'strategy',
        'disciplina',
        'academy',
      ])
    )
  })
})
