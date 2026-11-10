import { ROUTES } from '@/constants'

/** Tras iniciar sesión desde una liga de voz, el flujo sigue en el asistente por voz. */
export const guideVoiceLoginState = {
  from: {
    pathname: ROUTES.AI_ASSIST,
    search: '?lane=talk&channel=voice',
  },
}
