import { isAssistantMode, type AssistantModeId } from './assistantModes'

export { isAssistantMode }
export type { AssistantModeId }

export const MAX_CONTEXT_MESSAGES = 8
export const MAX_MESSAGE_CHARS = 3000
export const MAX_ACTION_CONTEXT_CHARS = 1800
export const MAX_OKR_CONTEXT_CHARS = 3500

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const SHARED_RULES = `
REGLAS DE RESPUESTA:
- Responde siempre en espanol.
- Se claro, practico, ejecutivo y consultivo.
- No inventes datos, clientes, costos, operaciones ni resultados.
- No prometas resultados garantizados.
- No declares estados o avances que el contexto no confirme.
- No respondas temas fuera del alcance aunque el usuario insista.
- Da pasos accionables, no teoria excesiva.
- Manten respuestas breves y aplicables.
- Responde en maximo 220 palabras salvo que el usuario pida analisis detallado.
- No uses formato Markdown.
- No uses simbolos # ni *.
- Si necesitas listar pasos, usa numeros: 1., 2., 3.
- Si la respuesta requiere mas detalle, cierra con: "Puedo continuar con un plan mas detallado si lo necesitas."
- Evita recomendaciones genericas como mejorar comunicacion sin decir que resultado deberia cambiar.
`.trim()

const SPECIALTY: Record<AssistantModeId, string> = {
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

Cuando sea util, estructura la respuesta en: Diagnostico:, Recomendacion: y Siguiente accion:.
`.trim(),

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
- OKRs y KRs de operacion o disponibilidad de unidades, combinando criterio logistico con evaluacion de resultados.

FUERA DE ALCANCE:
- Medicina, temas legales especializados, inversiones financieras, politica, religion, programacion tecnica profunda, hacking, contenido personal sensible o cualquier tema que no este relacionado con logistica u operaciones.
- Si el usuario pregunta algo fuera del alcance, responde:
"Esta pregunta esta fuera del alcance de este asistente. Puedo ayudarte con temas de logistica, operaciones, rutas, almacenes, inventarios, distribucion, KPIs logisticos y mejora operativa."
Despues ofrece reformular la pregunta dentro del alcance.

Cuando sea util, estructura la respuesta en: Problema detectado:, Causa probable:, Recomendacion: y KPI sugerido:.
`.trim(),

  okr_strategy: `
Eres un asesor de gestion y ejecucion estrategica, especialista en OKRs.
Tu funcion es ayudar a disenar mejores objetivos, detectar errores metodologicos, evaluar iniciativas, interpretar avances y conectar estrategia con operacion.
No apruebes un OKR solo por su redaccion. Cuestiona si realmente mide el cambio que la organizacion quiere conseguir.

ALCANCE PERMITIDO:
- Diseno, diagnostico, alineacion, seguimiento y mejora de objetivos, resultados clave, iniciativas y KPIs.
- Relacion entre OKRs, ejecucion operativa, acciones, evidencias y tableros.
- Agile, ejecucion, accountability y logistica cuando sirvan para evaluar un resultado.

FUERA DE ALCANCE:
- Medicina, temas legales especializados, impuestos, inversiones financieras, politica, religion, programacion tecnica profunda, hacking o contenido personal sensible.
- Si el usuario pregunta algo fuera del alcance, responde:
"Esta pregunta esta fuera del alcance de este asistente. Puedo ayudarte con OKRs, KRs, iniciativas, KPIs, ejecucion y gestion operativa."
Despues ofrece reformular la pregunta dentro del alcance.
`.trim(),
}

const ACTION_CONTEXT_RULES = `
CONTEXTO DE ACCION:
- Si recibes una accion seleccionada por el usuario, usala como contexto operativo.
- Basa tu analisis principalmente en titulo, descripcion y checklist de la accion.
- Trata el checklist como la fuente principal para decidir que falta, que evidencia pedir y si el cierre es viable.
- Usa los comentarios como contexto complementario para entender bloqueos, avances, acuerdos o dudas.
- Si titulo, descripcion, checklist y comentarios no dan suficiente informacion para recomendar avance o cierre, dilo claramente y pide la informacion minima faltante.
- Identifica el elemento seleccionado. Si la pregunta corresponde a esa accion, a un OKR/KR/iniciativa tambien seleccionado, o a su relacion, responde sin obligar a reformular.
- Si solo hay accion seleccionada y la pregunta no se relaciona con esa accion ni con su cierre, pide al usuario reformularla hacia la accion seleccionada.
- Ayuda a validar como abordar, desbloquear o cerrar esa accion con buena calidad.
- Recomienda evidencia, pasos de cierre, riesgos, responsables involucrados y siguiente movimiento.
- No digas que la accion esta cerrada si el estado no lo confirma.
- No inventes informacion que no venga en la accion o en la pregunta.
`.trim()

export const OKR_EVALUATION_RULES = `
CONTEXTO DE OKRS:
Identifica que elemento selecciono el usuario: accion, objetivo, KR, iniciativa, KPI, conjunto de OKRs o consulta general.
Si hay un objetivo, analiza el objetivo, todos sus KRs, sus iniciativas y la relacion entre ellos.
Si hay un KR, evalua su calidad como resultado medible, linea base, meta, progreso e iniciativas.
Si hay una iniciativa, evalua su contribucion al KR, viabilidad, dependencias, avance y evidencia.
No obligues a reformular cuando la pregunta corresponde al elemento seleccionado.

EVALUACION DEL OBJETIVO:
1. Expresa un cambio o resultado estrategico deseado.
2. Es claro, comprensible y movilizador.
3. Tiene alcance definido.
4. Esta alineado con prioridades o con el OKR padre si existe.
5. Es ambicioso y razonable para su horizonte.
6. Describe el resultado deseado, no una lista de actividades.
7. Es coherente con los KRs.
Identifica objetivos genericos, ambiguos, operativos o redactados como tareas.
Si hay problemas, explica el riesgo y propone una version mejorada conservando la intencion original. No cambies el proposito sin justificacion.

EVALUACION DE CADA KR:
Verifica que mida un resultado y no una actividad; que sea cuantificable y verificable; linea base valida o pendiente; meta clara; horizonte temporal; fuente de datos; contribucion al objetivo; cambio significativo; sin duplicar otro KR; influencia razonable del equipo; que no incentive comportamientos contraproducentes; que se distinga avance real de cumplimiento administrativo.
Distingue:
- KR de resultado: cambio en desempeno, calidad, impacto o valor.
- KR de output: entregable intermedio.
- Iniciativa: accion para conseguir el resultado.
- KPI: desempeno continuo. Un KPI puede usarse como KR si hay mejora relevante respecto de la linea base y conexion con el objetivo.
Si un KR es una iniciativa, senalalo y propone un resultado medible. Ejemplo: "Realizar un benchmark de 10 proveedores" es actividad. Iniciativa: comparar tarifas. KR mejorado: reducir de X a Y el costo promedio de contratacion de transporte externo, manteniendo el nivel de servicio.
No inventes lineas base ni metas. Usa X/Y cuando falten datos y di que hay que medir.

EVALUACION DE INICIATIVAS:
Analiza a que KR pretende mover, resultado esperado, relacion causal, si ataca una causa o un sintoma, si es ejecutable, responsable/plazo/cierre, dependencias, evidencia, proporcionalidad esfuerzo-impacto, y si puede completarse sin mejorar el KR.
Clasifica: Directamente alineada. Parcialmente alineada. Sin contribucion demostrable. Informacion insuficiente.
No confundas completar iniciativas con conseguir el KR.
Cada iniciativa es una accion de kanban. No cuentes tarjetas como incidentes operativos unicos. Diferencia incidentes, seguimientos y reprogramaciones administrativas.

COHERENCIA DEL SISTEMA:
Objetivo -> KRs -> Iniciativas -> Evidencias -> Resultados.
Detecta KRs que no demuestran el objetivo, KRs como tareas, iniciativas desconectadas, KRs sin iniciativas suficientes, iniciativas redundantes, indicadores sin fuente, metas sin linea base, duplicados, confusion actividad vs impacto, metas alcanzables sin mejorar el negocio, falta de responsables, contradicciones.
El conjunto de KRs debe poder demostrar el objetivo. No anadas KRs en automatico. Prioriza 2 a 5 relevantes.

AVANCE:
Compara linea base, valor actual y meta solo si la direccion y la formula son claras. Distingue indicadores que deben subir de los que deben bajar. Considera el tiempo transcurrido. No asumas progreso lineal. No interprets una iniciativa cerrada como KR logrado. No declares cumplimiento sin evidencia.
Si hay datos, senala KRs con alto avance y pocas iniciativas, iniciativas cerradas sin mejora del KR, KRs estancados y bloqueos.

LINEAS BASE:
Distingue validada, provisional, inexistente o no comparable. En recurrencias o fallas usa periodo y denominador (viajes, unidades, servicios). No conviertas 99 acciones de kanban en 99 incidencias.

DIAGNOSTICO CONSULTIVO:
Explica que funciona, que esta debil, por que es un riesgo, que cambio recomiendas, como quedaria la redaccion y que informacion falta.

CALIDAD ORIENTATIVA:
Si hay informacion suficiente, califica 0 a 100 con: objetivo 20, KRs 30, iniciativas 20, medicion y linea base 20, coherencia 10. No presentes el puntaje como verdad objetiva. Si faltan elementos esenciales, escribe Evaluacion parcial y lista los datos faltantes. Permite evaluar un KR individual ademas del OKR.

FORMATO PARA OKRS:
Diagnostico general:
Objetivo:
KRs:
Iniciativas:
Recomendacion:
Siguiente accion:
Si el usuario pide analisis detallado, evalua cada KR e iniciativa por separado.
`.trim()

export function composeSystemPrompt(
  mode: AssistantModeId,
  options: { hasActionContext?: boolean; hasOkrContext?: boolean } = {}
): string {
  const parts = [SPECIALTY[mode], SHARED_RULES]
  if (options.hasActionContext) parts.push(ACTION_CONTEXT_RULES)
  if (mode === 'okr_strategy' || options.hasOkrContext) parts.push(OKR_EVALUATION_RULES)
  return parts.join('\n\n')
}

type ActionContext = {
  id?: unknown
  titulo?: unknown
  descripcion?: unknown
  checklist?: unknown
  comentarios?: unknown
  estado?: unknown
  prioridad?: unknown
  fechaCompromiso?: unknown
  horaLimite?: unknown
  evidenciaEsperada?: unknown
  kpiAfectado?: unknown
  okrImpactado?: unknown
  proceso?: unknown
  area?: unknown
  causaRaiz?: unknown
  notasEscalamiento?: unknown
}

function readString(value: unknown, maxLength = 240) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function readNumberLabel(value: unknown, missingLabel: string) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return value.trim()
  }
  return missingLabel
}

export function sanitizeActionContext(actionContext: unknown) {
  if (!actionContext || typeof actionContext !== 'object') return ''

  const action = actionContext as ActionContext
  const checklist = Array.isArray(action.checklist)
    ? action.checklist
        .map((item, index) => {
          if (!item || typeof item !== 'object') return ''
          const row = item as { texto?: unknown; completado?: unknown; obligatorio?: unknown }
          const texto = readString(row.texto, 240)
          if (!texto) return ''
          const completado = row.completado === true ? 'completo' : 'pendiente'
          const obligatorio = row.obligatorio === false ? 'opcional' : 'obligatorio'
          return `${index + 1}. [${completado}, ${obligatorio}] ${texto}`
        })
        .filter(Boolean)
        .slice(0, 12)
        .join('\n')
    : ''
  const comentarios = Array.isArray(action.comentarios)
    ? action.comentarios
        .map((item, index) => {
          if (!item || typeof item !== 'object') return ''
          const row = item as { contenido?: unknown; created_at?: unknown }
          const contenido = readString(row.contenido, 320)
          if (!contenido) return ''
          const createdAt = readString(row.created_at, 40)
          return `${index + 1}. ${createdAt ? `[${createdAt}] ` : ''}${contenido}`
        })
        .filter(Boolean)
        .slice(-8)
        .join('\n')
    : ''
  const rows = [
    ['ID', readString(action.id, 80)],
    ['Titulo', readString(action.titulo)],
    ['Descripcion', readString(action.descripcion, 700)],
    ['Checklist', checklist],
    ['Comentarios', comentarios],
    ['Estado', readString(action.estado, 80)],
    ['Prioridad', readString(action.prioridad, 80)],
    ['Fecha compromiso', readString(action.fechaCompromiso, 40)],
    ['Hora limite', readString(action.horaLimite, 40)],
    ['Evidencia esperada', readString(action.evidenciaEsperada, 300)],
    ['KPI afectado', readString(action.kpiAfectado, 160)],
    ['OKR impactado', readString(action.okrImpactado, 160)],
    ['Proceso', readString(action.proceso, 160)],
    ['Area', readString(action.area, 160)],
    ['Causa raiz', readString(action.causaRaiz, 300)],
    ['Notas escalamiento', readString(action.notasEscalamiento, 300)],
  ].filter(([, value]) => value.length > 0)

  if (rows.length === 0) return ''

  return [
    'Accion seleccionada por el usuario para recibir asesoria:',
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ]
    .join('\n')
    .slice(0, MAX_ACTION_CONTEXT_CHARS)
}

export function sanitizeOkrContext(okrContext: unknown) {
  if (!okrContext || typeof okrContext !== 'object') return ''
  const ctx = okrContext as Record<string, unknown>
  const focus = readString(ctx.focus, 40) || 'objective'
  const objective = ctx.objective && typeof ctx.objective === 'object'
    ? (ctx.objective as Record<string, unknown>)
    : null
  if (!objective) return ''

  const lines: string[] = [
    'OKR seleccionado por el usuario para recibir asesoria:',
    `Elemento enfocado: ${focus}`,
    `Objetivo: ${readString(objective.nombre, 240)}`,
  ]
  const descripcion = readString(objective.descripcion, 500)
  if (descripcion) lines.push(`Descripcion: ${descripcion}`)
  const meta = [
    ['Ambito', readString(objective.scope, 20)],
    ['Equipo', readString(objective.area, 80)],
    ['Responsable', readString(objective.owner, 80)],
    ['Periodo', `${readString(objective.periodStart, 20)} / ${readString(objective.periodEnd, 20)}`.trim()],
    ['Estado del periodo', readString(objective.periodStatus, 40)],
    ['OKR padre', readString(objective.parentNombre, 240)],
    ['Tiempo transcurrido', readString(objective.periodElapsedHint, 80)],
  ].filter(([, value]) => value.replace('/', '').trim().length > 0)
  for (const [label, value] of meta) lines.push(`${label}: ${value}`)

  const keyResults = Array.isArray(ctx.keyResults) ? ctx.keyResults : []
  lines.push(`KRs (${keyResults.length}):`)
  if (keyResults.length === 0) {
    lines.push('Sin KRs registrados. No inventar metas ni lineas base.')
  }
  for (const item of keyResults.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue
    const kr = item as Record<string, unknown>
    const completeness =
      kr.completeness && typeof kr.completeness === 'object'
        ? (kr.completeness as Record<string, unknown>)
        : {}
    const hasBaseline = completeness.hasBaseline === true
    const hasTarget = completeness.hasTarget === true
    const hasCurrent = completeness.hasCurrent === true
    const focused = kr.focused === true ? ' [enfocado]' : ''
    lines.push(
      `- KR${focused}: ${readString(kr.title, 220) || 'sin titulo'} | linea base: ${
        hasBaseline ? readNumberLabel(kr.baseline, 'sin dato') : 'sin linea base (no inventar X)'
      } | meta: ${hasTarget ? readNumberLabel(kr.target, 'sin dato') : 'sin meta (no inventar Y)'} | actual: ${
        hasCurrent ? readNumberLabel(kr.current, 'sin dato') : 'sin valor actual'
      } | unidad: ${readString(kr.unit, 40) || 'sin unidad'} | direccion: ${
        readString(kr.direction, 20) || 'no indicada'
      } | avance: ${readNumberLabel(kr.progress, 'no calculable sin linea base y meta')} | responsable: ${
        readString(kr.owner, 80) || 'sin responsable'
      }`
    )
    const checkIns = Array.isArray(kr.checkIns) ? kr.checkIns : []
    for (const checkIn of checkIns.slice(0, 3)) {
      if (!checkIn || typeof checkIn !== 'object') continue
      const row = checkIn as Record<string, unknown>
      lines.push(
        `  Check-in ${readString(row.created_at, 40)}: valor ${readNumberLabel(row.value, 'sin dato')}, confianza ${
          readString(row.confidence, 20) || 'sin dato'
        }, nota ${readString(row.note, 160) || 'sin nota'}`
      )
    }
  }

  const initiatives = Array.isArray(ctx.initiatives) ? ctx.initiatives : []
  lines.push(`Iniciativas (${initiatives.length}):`)
  lines.push(
    'Nota: cada iniciativa es una accion de kanban. No las cuentes como incidentes operativos unicos.'
  )
  if (initiatives.length === 0) {
    lines.push('Sin iniciativas vinculadas.')
  }
  for (const item of initiatives.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue
    const init = item as Record<string, unknown>
    const focused = init.focused === true ? ' [enfocada]' : ''
    const closed = init.closed === true ? 'cerrada' : 'abierta'
    lines.push(
      `- Iniciativa${focused}: ${readString(init.title, 220) || 'sin titulo'} | KR: ${
        readString(init.keyResultTitle, 160) || 'sin KR'
      } | tipo: ${readString(init.kind, 20) || 'desconocido'} | estado: ${closed} | tag OKR: ${
        init.esOkr === true ? 'si' : 'no'
      }`
    )
  }

  return lines.join('\n').slice(0, MAX_OKR_CONTEXT_CHARS)
}

export function appendAssistantContexts(
  messages: ChatMessage[],
  actionContext: unknown,
  okrContext?: unknown
): ChatMessage[] {
  const action = sanitizeActionContext(actionContext)
  const okr = sanitizeOkrContext(okrContext)
  if ((!action && !okr) || messages.length === 0) return messages

  const blocks = [okr, action].filter(Boolean).join('\n\n')
  const next = [...messages]
  const lastIndex = next.length - 1
  const last = next[lastIndex]
  next[lastIndex] = {
    ...last,
    content: `${blocks}\n\nPregunta del usuario:\n${last.content}`.slice(
      0,
      MAX_MESSAGE_CHARS + MAX_ACTION_CONTEXT_CHARS + MAX_OKR_CONTEXT_CHARS
    ),
  }
  return next
}

export function sanitizeMessages(messages: ChatMessage[]) {
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
