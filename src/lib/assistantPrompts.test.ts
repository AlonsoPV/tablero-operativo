import { describe, expect, it } from 'vitest'
import {
  appendAssistantContexts,
  composeSystemPrompt,
  sanitizeActionContext,
  sanitizeOkrContext,
} from './assistantPrompts'

const actionContext = {
  id: 'act-1',
  titulo: 'Cerrar evidencia de ruta',
  descripcion: 'Adjuntar POD y confirmar entrega.',
  checklist: [{ texto: 'Subir evidencia', completado: false, obligatorio: true }],
  comentarios: [{ contenido: 'Falta el POD', created_at: '2026-10-01' }],
  estado: 'En_Ejecucion',
  prioridad: 'P1_Critica',
  fechaCompromiso: '2026-10-28',
  horaLimite: '18:00',
  evidenciaEsperada: 'POD firmado',
}

describe('composeSystemPrompt', () => {
  it('keeps action evaluation rules for an operational action without rewriting logistics/agile specialties', () => {
    const agile = composeSystemPrompt('agile_eos_scalingup', { hasActionContext: true })
    expect(agile).toContain('Agile, Scrum, Kanban y Scrumban')
    expect(agile).toContain('CONTEXTO DE ACCION')
    expect(agile).toContain('checklist de la accion')
    expect(agile).not.toContain('CALIDAD ORIENTATIVA')
  })

  it('adds OKR evaluation when the strategy mode is selected even without a selected OKR', () => {
    const prompt = composeSystemPrompt('okr_strategy')
    expect(prompt).toContain('especialista en OKRs')
    expect(prompt).toContain('CALIDAD ORIENTATIVA')
    expect(prompt).toContain('Diagnostico general:')
  })

  it('combines logistics specialty with OKR rules when an operational OKR is in context', () => {
    const prompt = composeSystemPrompt('logistics', { hasOkrContext: true })
    expect(prompt).toContain('KPIs logisticos')
    expect(prompt).toContain('EVALUACION DEL OBJETIVO')
    expect(prompt).toContain('No cuentes tarjetas como incidentes')
  })
})

describe('sanitizeActionContext', () => {
  it('keeps the current action payload fields for closing and evidence', () => {
    const text = sanitizeActionContext(actionContext)
    expect(text).toContain('Accion seleccionada por el usuario para recibir asesoria:')
    expect(text).toContain('Cerrar evidencia de ruta')
    expect(text).toContain('[pendiente, obligatorio] Subir evidencia')
    expect(text).toContain('POD firmado')
    expect(text).toContain('Falta el POD')
  })
})

describe('sanitizeOkrContext', () => {
  it('identifies KRs written as activities without inventing a baseline', () => {
    const text = sanitizeOkrContext({
      focus: 'objective',
      objective: { nombre: 'Mejorar contratacion de transporte' },
      keyResults: [
        {
          title: 'Realizar un benchmark de tarifas de 10 proveedores',
          completeness: { hasBaseline: false, hasTarget: false, hasCurrent: false },
        },
      ],
      initiatives: [],
    })
    expect(text).toContain('Realizar un benchmark de tarifas de 10 proveedores')
    expect(text).toContain('sin linea base (no inventar X)')
    expect(text).not.toMatch(/linea base: 0/)
  })

  it('distinguishes a closed kanban initiative from KR progress', () => {
    const text = sanitizeOkrContext({
      focus: 'initiative',
      objective: { nombre: 'Subir disponibilidad de unidades' },
      keyResults: [
        {
          title: 'Disponibilidad de flota',
          baseline: 80,
          target: 95,
          current: 80,
          completeness: { hasBaseline: true, hasTarget: true, hasCurrent: true },
          progress: 0,
        },
      ],
      initiatives: [
        {
          title: 'Publicar SOP de mantenimiento',
          keyResultTitle: 'Disponibilidad de flota',
          closed: true,
          kind: 'company',
          focused: true,
        },
      ],
    })
    expect(text).toContain('estado: cerrada')
    expect(text).toContain('avance: 0')
    expect(text).toContain('No las cuentes como incidentes operativos unicos')
  })

  it('does not treat many kanban cards as unique incidents', () => {
    const text = sanitizeOkrContext({
      focus: 'objective',
      objective: { nombre: 'Reducir incidencias' },
      keyResults: [
        {
          title: 'Bajar incidencias de 99 a 20',
          completeness: { hasBaseline: false, hasTarget: true, hasCurrent: false },
          target: 20,
        },
      ],
      initiatives: Array.from({ length: 5 }, (_, index) => ({
        title: `Tarjeta kanban ${index + 1}`,
        kind: 'company',
        closed: false,
      })),
    })
    expect(text).toContain('Iniciativas (5)')
    expect(text).toContain('accion de kanban')
    expect(text).not.toContain('99 incidencias confirmadas')
  })
})

describe('appendAssistantContexts', () => {
  it('keeps action context and prepends OKR context when both are selected', () => {
    const [message] = appendAssistantContexts(
      [{ role: 'user', content: 'Que sigue?' }],
      actionContext,
      {
        focus: 'objective',
        objective: { nombre: 'Disponibilidad de unidades' },
        keyResults: [],
        initiatives: [],
      }
    )
    expect(message.content).toContain('Disponibilidad de unidades')
    expect(message.content).toContain('Cerrar evidencia de ruta')
    expect(message.content).toContain('Pregunta del usuario:\nQue sigue?')
  })
})
