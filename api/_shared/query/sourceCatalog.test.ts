/**
 * FV-01: cada fuente del catálogo declara dueño, campos y herramientas existentes.
 * No consulta datos remotos; evita fuentes huérfanas en el contrato del agente.
 */
import { describe, expect, it } from 'vitest'
import { COPILOT_READ_TOOLS } from '../../../src/features/ai-support/copilot/types.js'
import { AGENT_SOURCES, sourcesFor, UNAVAILABLE_DOMAINS } from './sourceCatalog.js'

const KNOWN_READ_TOOLS = new Set<string>(COPILOT_READ_TOOLS)

describe('FV-01 sourceCatalog', () => {
  it('lists unique sources with owner, fields and authorization', () => {
    const ids = AGENT_SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const source of AGENT_SOURCES) {
      expect(source.ownerModule.trim().length).toBeGreaterThan(0)
      expect(source.fields.length).toBeGreaterThan(0)
      expect(source.authorization.trim().length).toBeGreaterThan(0)
      expect(['table', 'rpc', 'view']).toContain(source.kind)
    }
  })

  it('maps every readVia tool to a known copilot read tool (or empty for audit-only)', () => {
    for (const source of AGENT_SOURCES) {
      for (const tool of source.readVia) {
        expect(KNOWN_READ_TOOLS.has(tool), `${source.id} → ${tool}`).toBe(true)
      }
    }
    const audit = AGENT_SOURCES.find((s) => s.id === 'assistant_op_log')
    expect(audit?.readVia).toEqual([])
  })

  it('exposes sourcesFor entities used by the query layer', () => {
    expect(sourcesFor('actions').map((s) => s.id)).toEqual(
      expect.arrayContaining(['acciones_diarias', 'priorities'])
    )
    expect(sourcesFor('okrs').map((s) => s.id)).toEqual(
      expect.arrayContaining(['okr_dashboard', 'okr_key_results'])
    )
    expect(sourcesFor('combined').length).toBeGreaterThanOrEqual(3)
  })

  it('declares unavailable domains without inventing finance/payroll', () => {
    expect(UNAVAILABLE_DOMAINS.map((d) => d.id).sort()).toEqual(['finance', 'payroll'])
  })
})
