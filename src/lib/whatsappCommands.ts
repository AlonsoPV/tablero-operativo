/** Deterministic commands are resolved before evidence capture or an LLM. */
export function whatsappCommand(
  text: string | null | undefined
): 'help' | 'mine' | 'overdue' | 'assigned' | 'update' | 'cancel' | null {
  const value = (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\//, '')
    .replace(/[¿?¡!]/g, '')
    .replace(/[_-]+/g, ' ')
  if (/^(hola|ayuda|help|menu|buenos dias|buenas tardes)$/.test(value))
    return 'help'
  if (
    /^(mis acciones|pendientes|mis pendientes|consultar acciones|ver actividades|wa:mine)$/.test(
      value
    )
  )
    return 'mine'
  if (
    /^(vencidas|acciones vencidas|mis acciones vencidas|wa:overdue)$/.test(
      value
    )
  )
    return 'overdue'
  if (/^(acciones que asigne|asignadas por mi|wa:assigned)$/.test(value))
    return 'assigned'
  if (
    /^(actualizar acciones|actualizar mis acciones|reportar avance|wa:update)$/.test(
      value
    )
  )
    return 'update'
  if (/^(cancelar|cancela|cancel|salir)$/.test(value)) return 'cancel'
  return null
}
