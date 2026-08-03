export const ACCION_CHECKLIST_MIN_LEN = 3
export const ACCION_CHECKLIST_MAX_LEN = 400

export const ACCION_CHECKLIST_SECTION_EYEBROW = 'Cumplimiento'
export const ACCION_CHECKLIST_SECTION_TITLE = 'Validaciones'

/** Creación: checklist local antes de guardar la acción. */
export const ACCION_CHECKLIST_CREATE_INFO_HINT =
  'Opcional. Define los puntos que deben cumplirse para cerrar la acción. Asigna un responsable a cada validación cuando haga falta. Lista vacía = sin bloqueo por validaciones.'

/** Edición: checklist persistido en servidor. */
export const ACCION_CHECKLIST_EDIT_INFO_HINT =
  'Marca cada validación al cumplirse. Deben completarse todas antes de marcar la acción como Hecha. Puedes asignar un responsable por punto cuando sea necesario. Las validadas no se editan ni eliminan (trazabilidad); reordena o elimina solo pendientes. Guarda el texto al salir del campo (mín. 3 caracteres).'
