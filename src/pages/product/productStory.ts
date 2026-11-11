/**
 * Escenario único de demostración para la landing `/producto`.
 * Datos ficticios · no representan operación real · no persistir.
 */

export const PRODUCT_STORY_DEMO_LABEL = 'Ejemplo · demostración'

export const PRODUCT_STORY_RAIL = [
  { step: '01', verb: 'Conecta', object: 'Estrategia', href: '#inicio' },
  { step: '02', verb: 'Coordina', object: 'Áreas', href: '#coordinacion' },
  { step: '03', verb: 'Ejecuta', object: 'Compromisos', href: '#ejecucion' },
  { step: '04', verb: 'Ve', object: 'Riesgos', href: '#visibilidad' },
  { step: '05', verb: 'Sigue', object: 'Retrasos', href: '#seguimiento' },
  { step: '06', verb: 'Habla', object: 'Con contexto', href: '#colaboracion' },
  { step: '07', verb: 'Mejora', object: 'Decisiones', href: '#mejora' },
  { step: '08', verb: 'Consulta', object: 'Enviardián', href: '#enviardian' },
] as const

export const PRODUCT_STORY = {
  objective: {
    id: 'OBJ-07',
    title: 'Mejorar cumplimiento operativo del trimestre',
    progressLabel: '68% · en riesgo',
    gapLabel: 'Meta 92% · actual 89% ICO',
  },
  initiative: {
    id: 'INI-12',
    title: 'Acelerar validaciones Comercial ↔ Finanzas',
    status: 'En curso',
  },
  action: {
    id: 'AC-1042',
    title: 'Validar propuesta con Finanzas',
    description:
      'Revisar condiciones comerciales y obtener validación formal de Finanzas antes de enviar al cliente.',
    priority: 'Alta' as const,
    dueLabel: 'Hoy 18:00',
    dueShort: 'Hoy',
    evidenceExpected: 'Correo de validación',
    checklist: { total: 3, completed: 1 },
    ageLabel: 'Abierta hace 2 días',
    state: 'Bloqueado' as const,
    nextStep: 'Confirmar condiciones con Legal y cerrar validación hoy 18:00',
  },
  requester: {
    initials: 'LC',
    fullName: 'Laura Cruz',
    area: 'Comercial',
  },
  owner: {
    initials: 'AM',
    fullName: 'Ana Martínez',
    area: 'Finanzas',
  },
  blocker: {
    label: 'Dependencia con Legal',
    detail: 'Falta confirmación de cláusula de pago para completar la validación.',
    supportAsk: 'Solicitar apoyo a Legal para desbloquear cláusula de pago.',
  },
  lastUpdate: {
    at: 'Hoy 11:20',
    by: 'Ana Martínez',
    text: 'Esperando confirmación de cláusula. Checklist 1/3.',
  },
  coordination: {
    flow: [
      { step: 'Solicitud', detail: 'Comercial pide validación formal' },
      { step: 'Responsable', detail: 'Ana Martínez · Finanzas' },
      { step: 'Compromiso', detail: 'AC-1042 · Hoy 18:00' },
      { step: 'Estado', detail: 'Bloqueado · dependencia Legal' },
    ],
  },
  timeline: [
    {
      at: 'Lun 09:10',
      title: 'Solicitud creada',
      detail: 'Laura Cruz (Comercial) asigna a Finanzas con evidencia requerida.',
    },
    {
      at: 'Mar 16:40',
      title: 'En ejecución',
      detail: 'Ana revisa condiciones y marca el primer checkpoint.',
    },
    {
      at: 'Hoy 11:20',
      title: 'Bloqueo reportado',
      detail: 'Dependencia con Legal · solicitud de apoyo registrada en la acción.',
    },
    {
      at: 'Pendiente',
      title: 'Próxima acción',
      detail: 'Desbloquear cláusula y completar validación antes de las 18:00.',
    },
  ],
  collaboration: [
    {
      author: 'Laura Cruz',
      area: 'Comercial',
      at: 'Lun 09:12',
      text: 'Necesitamos validación formal antes de enviar la propuesta al cliente.',
    },
    {
      author: 'Ana Martínez',
      area: 'Finanzas',
      at: 'Mar 16:42',
      text: 'Revisé montos. Falta confirmación de cláusula de pago con Legal.',
    },
    {
      author: 'Ana Martínez',
      area: 'Finanzas',
      at: 'Hoy 11:20',
      text: 'Bloqueo: dependencia con Legal. Adjunto borrador de condiciones.',
      evidence: 'condiciones-propuesta.pdf',
    },
  ],
  attention: {
    weekLabel: 'Atención esta semana',
    items: [
      {
        kind: 'Objetivo en riesgo',
        title: 'Cumplimiento operativo del trimestre',
        detail: 'ICO 89% · meta 92% · validaciones Comercial-Finanzas retrasan el avance.',
        tone: 'yellow' as const,
      },
      {
        kind: 'Compromiso vencido',
        title: 'AC-1055 · Confirmar cierre con cliente',
        detail: 'Fecha superada · pendiente de evidencia de aceptación.',
        tone: 'red' as const,
      },
      {
        kind: 'Bloqueo',
        title: 'AC-1042 · Validar propuesta con Finanzas',
        detail: 'Dependencia con Legal · Ana Martínez solicita apoyo.',
        tone: 'red' as const,
      },
      {
        kind: 'Por verificar',
        title: 'AC-1055 · Confirmar cierre con cliente',
        detail: 'En Hecho · falta verificación autorizada.',
        tone: 'yellow' as const,
      },
    ],
  },
  improvement: {
    chain: [
      { label: 'Objetivo', value: 'Cumplimiento operativo · meta 92%' },
      { label: 'Ejecución', value: 'AC-1042 y validaciones entre áreas' },
      { label: 'Resultado', value: 'ICO ejemplo 89%' },
      { label: 'Brecha', value: '−3 pts · bloqueos en validación' },
      { label: 'Próxima prioridad', value: 'Desbloquear Legal y cerrar AC-1042' },
    ],
    capabilities: [
      'OKRs e iniciativas ligadas a acciones',
      'Indicadores y gaps de cumplimiento',
      'Reportes de avance por equipo',
      'Planes de acción y seguimiento',
    ],
  },
  enviardian: {
    prompts: [
      '¿Qué objetivos están en riesgo?',
      '¿Qué acciones de Ana están bloqueadas?',
      'Prepara una acción para desbloquear Legal',
    ],
    reply:
      'OBJ-07 está en riesgo por AC-1042 (Bloqueado · dependencia Legal). Ana Martínez es responsable. Puedo preparar una acción de apoyo a Legal; confírmala antes de crearla.',
  },
  supportingActions: [
    {
      id: 'AC-1048',
      title: 'Actualizar política de devoluciones',
      owner: 'Juan Reyes',
      initials: 'JR',
      state: 'Pendiente' as const,
      priority: 'Media' as const,
      due: '19 sep',
    },
    {
      id: 'AC-1051',
      title: 'Revisar evidencia de entrega',
      owner: 'Laura Cruz',
      initials: 'LC',
      state: 'En ejecución' as const,
      priority: 'Baja' as const,
      due: '20 sep',
    },
    {
      id: 'AC-1055',
      title: 'Confirmar cierre con cliente',
      owner: 'Mario Pérez',
      initials: 'MP',
      state: 'Hecho' as const,
      priority: 'Media' as const,
      due: '21 sep',
      note: 'Hecho · pendiente de verificación',
    },
    {
      id: 'AC-1031',
      title: 'Publicar reporte mensual',
      owner: 'Laura Cruz',
      initials: 'LC',
      state: 'Verificado' as const,
      priority: 'Baja' as const,
      due: '18 sep',
    },
    {
      id: 'AC-1060',
      title: 'Renovar contrato con proveedor',
      owner: 'Juan Reyes',
      initials: 'JR',
      state: 'Retraso' as const,
      priority: 'Alta' as const,
      due: 'Vencida',
    },
  ],
} as const

export type ProductStoryState =
  | 'Pendiente'
  | 'En ejecución'
  | 'Bloqueado'
  | 'Retraso'
  | 'Hecho'
  | 'Verificado'
