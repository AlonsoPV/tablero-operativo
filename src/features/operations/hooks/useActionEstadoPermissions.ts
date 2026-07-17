import { useMemo } from 'react'
import { canManageActionsByRole, isAnalystByRole } from '@/features/auth/lib/permissions'
import type { AccionDiaria } from '@/types'
import type { ActionStatus } from '@/types'
import {
  canChangeAccionEstado,
  getAccionEstadoChangeDenialMessage,
} from '../utils/actionPermissions'

type EstadoPermissionUser = { id: string; rol: string } | null | undefined

export function getActionEstadoPermission(
  currentUser: EstadoPermissionUser,
  accion: AccionDiaria,
  target: ActionStatus
) {
  const bypassEstadoRoles = currentUser ? canManageActionsByRole(currentUser.rol) : false
  const readOnly = currentUser ? isAnalystByRole(currentUser.rol) : false
  const uid = currentUser?.id

  if (readOnly && target !== 'Hecho') {
    return {
      canChange: false,
      denialMessage: 'El rol Analista solo puede visualizar sus acciones.',
    }
  }

  const denialMessage = getAccionEstadoChangeDenialMessage(accion, uid, target, { bypassEstadoRoles })

  return {
    canChange: !denialMessage && canChangeAccionEstado(accion, uid, target, { bypassEstadoRoles }),
    denialMessage,
  }
}

/**
 * Permisos de cambio de estado Hecho/Verificado para el usuario actual (usuarios.id).
 * DG/Sistemas omiten la regla creador/responsable en UI (alineado con accionEstadoValidation.service).
 */
export function useActionEstadoPermissions(
  currentUser: EstadoPermissionUser
) {
  return useMemo(
    () => ({
      canChangeTo: (accion: AccionDiaria, target: ActionStatus) =>
        getActionEstadoPermission(currentUser, accion, target).canChange,
      denialMessage: (accion: AccionDiaria, target: ActionStatus) =>
        getActionEstadoPermission(currentUser, accion, target).denialMessage,
    }),
    [currentUser]
  )
}
