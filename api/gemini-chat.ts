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

type GeminiContent = {
  role: 'user' | 'model'
  parts: Array<{ text: string }>
}

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
    finishReason?: string
  }>
  promptFeedback?: {
    blockReason?: string
  }
}

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
const DEFAULT_MAX_OUTPUT_TOKENS = 700
const DEFAULT_TEMPERATURE = 0.25
const DEFAULT_TIMEOUT_MS = 20000
const MAX_CONTEXT_MESSAGES = 8
const MAX_MESSAGE_CHARS = 3000

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
- Responde en maximo 220 palabras salvo que el usuario pida mas detalle.
- No uses formato Markdown.
- No uses simbolos # ni *.
- Usa texto limpio con etiquetas simples como Diagnostico:, Recomendacion: y Siguiente accion:.
- Si necesitas listar pasos, usa numeros: 1., 2., 3.
- Si la respuesta requiere mas detalle, cierra con: "Puedo continuar con un plan mas detallado si lo necesitas."
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
- Responde en maximo 220 palabras salvo que el usuario pida mas detalle.
- No uses formato Markdown.
- No uses simbolos # ni *.
- Usa texto limpio con etiquetas simples como Problema detectado:, Causa probable:, Recomendacion: y KPI sugerido:.
- Si necesitas listar pasos, usa numeros: 1., 2., 3.
- Si la respuesta requiere mas detalle, cierra con: "Puedo continuar con un plan mas detallado si lo necesitas."
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
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_CHARS),
    }))
}

function toGeminiContents(messages: ReturnType<typeof sanitizeMessages>): GeminiContent[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))
}

function getGeminiText(data: GeminiResponse) {
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => Boolean(text))
    .join('')
    .trim()
}

function cleanAssistantText(text: string) {
  return text
    .replace(/[#*]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeGeminiModel(model: string) {
  return model.trim().replace(/^models\//, '') || DEFAULT_GEMINI_MODEL
}

function readNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function readGeminiError(errorText: string) {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: {
        message?: string
        status?: string
      }
    }

    return [parsed.error?.status, parsed.error?.message].filter(Boolean).join(': ')
  } catch {
    return errorText.trim().slice(0, 220)
  }
}

export default async function handler(req: VercelRequestLike, serverRes: ServerResponse) {
  const res = asJsonResponse(serverRes)

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Metodo no permitido. Usa POST.' })
    }

    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return res.status(500).json({
        error: 'Falta configurar GEMINI_API_KEY en variables de entorno.',
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

    const model = normalizeGeminiModel(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL)
    const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), readNumberEnv('GEMINI_TIMEOUT_MS', DEFAULT_TIMEOUT_MS))

    let response: Response

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPTS[mode] }],
          },
          contents: toGeminiContents(cleanMessages),
          generationConfig: {
            maxOutputTokens: readNumberEnv('GEMINI_MAX_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS),
            temperature: readNumberEnv('GEMINI_TEMPERATURE', DEFAULT_TEMPERATURE),
          },
        }),
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const errorText = await response.text()
      const safeReason = readGeminiError(errorText)

      console.error('Gemini API Error:', {
        status: response.status,
        model,
        reason: safeReason,
      })

      if ([400, 401, 403, 404].includes(response.status)) {
        return res.status(502).json({
          error: `Gemini rechazo la solicitud (${response.status}). Revisa GEMINI_API_KEY, GEMINI_MODEL y permisos del proyecto.`,
        })
      }

      if (response.status === 429) {
        return res.status(503).json({
          error: 'Gemini esta limitando las solicitudes. Intenta nuevamente en unos minutos.',
        })
      }

      return res.status(502).json({
        error: 'No se pudo obtener respuesta del asistente. Intenta nuevamente.',
      })
    }

    const data = (await response.json()) as GeminiResponse

    if (data.promptFeedback?.blockReason) {
      return res.status(400).json({
        error: 'Gemini bloqueo la solicitud por politicas de seguridad.',
      })
    }

    const finishReason = data.candidates?.[0]?.finishReason
    const text = getGeminiText(data)

    if (!text) {
      console.error('Gemini empty response:', {
        model,
        finishReason,
        blockReason: data.promptFeedback?.blockReason,
      })

      return res.status(502).json({
        error: 'Gemini no regreso contenido util. Intenta con una pregunta mas corta o vuelve a intentar.',
      })
    }

    const rawContent =
      finishReason === 'MAX_TOKENS'
        ? `${text}\n\nNota: la respuesta se corto por limite de longitud. Puedes pedirme que continue.`
        : text
    const content = cleanAssistantText(rawContent)

    return res.status(200).json({ answer: content })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return res.status(504).json({
        error: 'Gemini tardo demasiado en responder. Intenta de nuevo con una pregunta mas concreta.',
      })
    }

    console.error('AI assistant error:', error)

    return res.status(500).json({
      error: 'Ocurrio un error inesperado al procesar la solicitud.',
    })
  }
}
