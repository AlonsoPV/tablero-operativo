export type AssistantModeId = 'agile_eos_scalingup' | 'logistics'

export const assistantModes = [
  {
    id: 'agile_eos_scalingup',
    title: 'Asesor Agile, Scaling Up y EOS',
    description:
      'Ideal para procesos, KPIs, OKRs, reuniones, accountability, seguimiento de acciones, scorecards y mejora de ejecucion.',
    welcome:
      'Hola, soy tu asesor en Agile, Scaling Up y EOS. Puedo ayudarte a ordenar procesos, definir KPIs, estructurar OKRs, mejorar reuniones, dar seguimiento a acciones y fortalecer la ejecucion del equipo. Que quieres diagnosticar o mejorar?',
    suggestions: [
      'Como puedo mejorar mi seguimiento de acciones?',
      'Como estructuro mis KPIs y OKRs?',
      'Como hago una reunion semanal mas efectiva?',
      'Como diagnostico la ejecucion de mi equipo?',
      'Como conecto acciones con gaps estrategicos?',
    ],
  },
  {
    id: 'logistics',
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
] as const
