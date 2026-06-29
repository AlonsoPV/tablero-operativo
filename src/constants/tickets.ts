/** Admin de tickets: recibe notificaciones y correos de la mesa de ayuda. */
export const TICKETS_ADMIN_EMAIL = (
  import.meta.env.VITE_TICKETS_ADMIN_EMAIL?.trim().toLowerCase() || 'alpeva96@gmail.com'
)
