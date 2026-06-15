export const ACCION_CHECKLIST_MIN_LEN = 3
export const ACCION_CHECKLIST_MAX_LEN = 400

export const ACCION_CHECKLIST_SECTION_EYEBROW = 'Seguimiento'
export const ACCION_CHECKLIST_SECTION_TITLE = 'Puntos a validar'

/** Creación: checklist local antes de guardar la acción. */
export const ACCION_CHECKLIST_CREATE_INFO_HINT =
  'Opcional. Si agregas ítems, deben completarse antes de marcar la acción como Hecha. Lista vacía = sin bloqueo por checklist.'

/** Edición: checklist persistido en servidor. */
export const ACCION_CHECKLIST_EDIT_INFO_HINT =
  'Marca cada ítem al cumplirse. Deben completarse todos antes de marcar la acción como Hecha. Los validados no se editan ni eliminan (trazabilidad); reordena o elimina solo pendientes. Guarda el texto al salir del campo (mín. 3 caracteres).'
