export type AssistantModeId = 'agile_eos_scalingup' | 'logistics' | 'okr_strategy'

export function isAssistantMode(mode: unknown): mode is AssistantModeId {
  return mode === 'agile_eos_scalingup' || mode === 'logistics' || mode === 'okr_strategy'
}

export const assistantModes = [
  {
    id: 'agile_eos_scalingup',
    shortTitle: 'Ejecucion',
    title: 'Asesor Agile, Scaling Up y EOS',
    description:
      'Ideal para procesos, KPIs, OKRs, reuniones, accountability, seguimiento de acciones, scorecards y mejora de ejecucion.',
    welcome:
      'Hola, soy tu asesor en Agile, Scaling Up y EOS. Puedo ayudarte a ordenar procesos, definir KPIs, estructurar OKRs, mejorar reuniones, dar seguimiento a acciones y fortalecer la ejecucion del equipo. Que quieres diagnosticar o mejorar?',
    suggestions: [
      'Analiza mis acciones abiertas y OKRs. Que conviene optimizar primero?',
      'Como puedo mejorar mi seguimiento de acciones?',
      'Como estructuro mis KPIs y OKRs?',
      'Como diagnostico la ejecucion de mi equipo?',
    ],
  },
  {
    id: 'logistics',
    shortTitle: 'Logistica',
    title: 'Asesor en Logistica y Operaciones',
    description:
      'Ideal para rutas, almacenes, inventarios, distribucion, productividad, costos logisticos y mejora operativa.',
    welcome:
      'Hola, soy tu asesor en logistica y operaciones. Puedo ayudarte con rutas, almacenes, inventarios, tiempos de entrega, capacidad operativa, costos logisticos y KPIs de desempeno. Que proceso quieres revisar?',
    suggestions: [
      'Como reduzco tiempos de entrega?',
      'Que KPIs debo medir en almacen?',
      'Como detecto cuellos de botella en rutas?',
      'Como mejoro el control de inventario?',
      'Como estructuro un SOP logistico?',
    ],
  },
  {
    id: 'okr_strategy',
    shortTitle: 'OKRs',
    title: 'Asesor de Estrategia y OKRs',
    description:
      'Diagnostica objetivos, resultados clave, iniciativas y la conexion entre estrategia y ejecucion.',
    welcome:
      'Hola, soy tu asesor de estrategia y OKRs. Puedo evaluar si un objetivo describe un cambio real, si los KRs miden resultado y no actividad, y si las iniciativas mueven el indicador. Que OKR o KR quieres diagnosticar?',
    suggestions: [
      'Este objetivo mide un cambio estrategico o solo describe trabajo?',
      'Que KRs estan redactados como tareas y como los convertiria en resultado?',
      'Las iniciativas actuales mueven el KR o solo documentan actividad?',
      'Que informacion falta para validar linea base y meta?',
      'El conjunto de KRs demuestra que el objetivo se consiguio?',
    ],
  },
] as const
