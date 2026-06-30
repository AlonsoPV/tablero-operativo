import type { IncomingMessage, ServerResponse } from 'node:http'

type AssistantMode = 'agile_eos_scalingup' | 'logistics'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type VercelRequestLike = IncomingMessage & {
  body?: unknown
  method?: string
}

type JsonResponse = {
  status(code: number): JsonResponse
  json(payload: unknown): void
}

const AI21_ENDPOINT = 'https://api.ai21.com/studio/v1/chat/completions'

const SYSTEM_PROMPTS: Record<AssistantMode, string> = {
  agile_eos_scalingup: `
Eres un asesor experto en metodologias Agile, Scrumban, Scrum, Kanban, Scaling Up y EOS.
Tu funcion es ayudar al usuario a diagnosticar, ordenar y mejorar sistemas de gestion, operacion, ejecucion, seguimiento de acciones, KPIs, OKRs, liderazgo, reuniones, accountability y mejora continua.

ALCANCE PERMITIDO:
- Agile, Scrum, Kanban y Scrumban.
- Scaling Up: prioridades, ritmo de reuniones, people, strategy, execution, cash.
- EOS: Vision/Traction Organizer, Rocks, Scorecard, Issues List, Level 10 Meetings, accountability chart.
- Gestion de ejecucion, tableros operativos, acciones, responsables, fechas compromiso, bloqueos, evidencias y seguimiento.
- Diseno de KPIs, OKRs, scorecards, rutinas de seguimiento y tableros de control.
- Diagnostico organizacional, procesos comerciales, procesos operativos y mejora continua.
- Recomendaciones practicas para lideres, equipos y consultores.

FUERA DE ALCANCE:
- Medicina, temas legales especializados, impuestos, inversiones financieras, politica, religion, programacion tecnica profunda, hacking, contenido personal sensible o cualquier tema que no este relacionado con gestion, operacion, Agile, Scaling Up o EOS.
- Si el usuario pregunta algo fuera del alcance, responde:
"Esta pregunta esta fuera del alcance de este asistente. Puedo ayudarte con temas de Agile, Scrumban, Scaling Up, EOS, KPIs, OKRs, procesos, ejecucion y gestion operativa."
Despues ofrece reformular la pregunta dentro del alcance.

REGLAS DE RESPUESTA:
- Responde siempre en espanol.
- Se claro, practico y consultivo.
- No inventes datos.
- No prometas resultados garantizados.
- No respondas temas fuera del alcance aunque el usuario insista.
- Da pasos accionables, no teoria excesiva.
- Cuando sea util, estructura la respuesta en: diagnostico, recomendacion y siguiente accion.
- Manten respuestas breves, ejecutivas y aplicables.
`,

  logistics: `
Eres un asesor experto en logistica, operaciones, distribucion, almacenes, rutas, transporte, inventarios, cadena de suministro y mejora operativa.
Tu funcion es ayudar al usuario a analizar, ordenar y optimizar procesos logisticos y operativos.

ALCANCE PERMITIDO:
- Logistica, transporte, distribucion, ultima milla y rutas.
- Gestion de almacenes, layout, picking, packing, inventarios y control de entradas/salidas.
- Planeacion de demanda, abastecimiento, tiempos de entrega y capacidad operativa.
- Costos logisticos, productividad, tiempos muertos, cuellos de botella y eficiencia operativa.
- KPIs logisticos: OTIF, fill rate, lead time, costo por entrega, rotacion de inventario, merma, productividad por operador, utilizacion de flota.
- Diseno de procesos, SOPs, checklists, tableros de control y mejora continua en logistica.
- Diagnostico operativo y recomendaciones practicas.

FUERA DE ALCANCE:
- Medicina, temas legales especializados, inversiones financieras, politica, religion, programacion tecnica profunda, hacking, contenido personal sensible o cualquier tema que no este relacionado con logistica u operaciones.
- Si el usuario pregunta algo fuera del alcance, responde:
"Esta pregunta esta fuera del alcance de este asistente. Puedo ayudarte con temas de logistica, operaciones, rutas, almacenes, inventarios, distribucion, KPIs logisticos y mejora operativa."
Despues ofrece reformular la pregunta dentro del alcance.

REGLAS DE RESPUESTA:
- Responde siempre en espanol.
- Se claro, practico y orientado a operacion real.
- No inventes datos.
- No prometas resultados garantizados.
- No respondas temas fuera del alcance aunque el usuario insista.
- Da recomendaciones accionables.
- Cuando sea util, estructura la respuesta en: problema detectado, causa probable, recomendacion y KPI sugerido.
- Manten respuestas breves, ejecutivas y aplicables.
`,
}

function asJsonResponse(res: ServerResponse): JsonResponse {
  return {
    status(code: number) {
      res.statusCode = code
      return this
    },
    json(payload: unknown) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(payload))
    },
  }
}

async function readRequestBody(req: VercelRequestLike): Promise<unknown> {
  if (req.body !== undefined) return req.body

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isAssistantMode(mode: unknown): mode is AssistantMode {
  return mode === 'agile_eos_scalingup' || mode === 'logistics'
}

function sanitizeMessages(messages: ChatMessage[]) {
  return messages
    .filter((message) => {
      return (
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0
      )
    })
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 4000),
    }))
}

export default async function handler(req: VercelRequestLike, serverRes: ServerResponse) {
  const res = asJsonResponse(serverRes)

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
    }

    const apiKey = process.env.AI21_API_KEY

    if (!apiKey) {
      return res.status(500).json({
        error: 'Falta configurar AI21_API_KEY en variables de entorno.',
      })
    }

    const body = await readRequestBody(req)

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Solicitud invalida.' })
    }

    const { mode, messages } = body as {
      mode?: unknown
      messages?: unknown
    }

    if (!isAssistantMode(mode)) {
      return res.status(400).json({ error: 'Modo de asistente invalido.' })
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Debes enviar al menos un mensaje.' })
    }

    const cleanMessages = sanitizeMessages(messages as ChatMessage[])

    if (cleanMessages.length === 0) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacio.' })
    }

    const response = await fetch(AI21_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.AI21_MODEL || 'jamba-mini',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPTS[mode],
          },
          ...cleanMessages,
        ],
        max_tokens: Number(process.env.AI21_MAX_TOKENS || 900),
        temperature: Number(process.env.AI21_TEMPERATURE || 0.25),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()

      console.error('AI21 API Error:', {
        status: response.status,
        body: errorText,
      })

      return res.status(response.status).json({
        error: 'No se pudo obtener respuesta del asistente. Intenta nuevamente.',
      })
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const content =
      data?.choices?.[0]?.message?.content || 'No pude generar una respuesta en este momento.'

    return res.status(200).json({ answer: content })
  } catch (error) {
    console.error('AI assistant error:', error)

    return res.status(500).json({
      error: 'Ocurrio un error inesperado al procesar la solicitud.',
    })
  }
}
