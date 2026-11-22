import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FORMAT_LABEL, RESPONSE_FORMATS } from '@/features/ai-support/responseFormat'
import { WorkIntentToggle } from './WorkIntentToggle'

const FORMAT_OPTIONS = RESPONSE_FORMATS.map((id) => ({
  id,
  label: id === 'auto' ? 'Auto' : FORMAT_LABEL[id],
}))

describe('WorkIntentToggle · selector de formato H-05', () => {
  it('monta Auto, Directo, Reporte y Análisis como radios', () => {
    const html = renderToStaticMarkup(
      <WorkIntentToggle
        value="auto"
        onChange={() => {}}
        options={FORMAT_OPTIONS}
        aria-label="Formato de respuesta"
      />
    )
    expect(html).toContain('aria-label="Formato de respuesta"')
    expect(html.match(/role="radio"/g)?.length).toBe(4)
    expect(html).toContain('Auto')
    expect(html).toContain('Directo')
    expect(html).toContain('Reporte')
    expect(html).toContain('Análisis')
  })
})
