/**
 * Métricas de disciplina por usuario y fecha.
 * Usa medicion_disciplina si existe; si no, calcula desde acciones (TODO: cálculo automático en BD).
 */

import { useQuery } from '@tanstack/react-query'
import { disciplinaService } from '@/services/disciplina.service'
import { accionesService } from '@/services/acciones.service'
import type { MedicionDisciplina } from '@/types'

export interface DisciplinaMetrics extends MedicionDisciplina {
  /** true si se calculó desde acciones por no haber fila en medicion_disciplina */
  fromFallback?: boolean
}

function computeFromAcciones(
  acciones: { estado: string; evidencia_cargada: boolean }[],
  usuarioId: string,
  fecha: string
): DisciplinaMetrics {
  const asignadas = acciones.length
  const cerradasConEvidencia = acciones.filter(
    (a) =>
      (a.estado === 'Hecho' || a.estado === 'Verificado') && a.evidencia_cargada
  ).length
  const sinEvidencia = acciones.filter(
    (a) =>
      (a.estado === 'Hecho' || a.estado === 'Verificado') && !a.evidencia_cargada
  ).length
  const porcentaje =
    asignadas > 0 ? Math.round((cerradasConEvidencia / asignadas) * 1000) / 10 : 0

  return {
    id: '',
    usuario_id: usuarioId,
    fecha,
    acciones_asignadas: asignadas,
    acciones_cerradas_en_tiempo: cerradasConEvidencia,
    porcentaje_cumplimiento: porcentaje,
    acciones_sin_evidencia: sinEvidencia,
    reincidencias: 0,
    dias_consecutivos_en_verde: 0,
    fromFallback: true,
  }
}

const KEY = ['disciplina'] as const

export function useDisciplinaMetrics(usuarioId: string | undefined, fecha: string) {
  return useQuery({
    queryKey: [...KEY, usuarioId, fecha],
    queryFn: async (): Promise<DisciplinaMetrics> => {
      if (!usuarioId || !fecha) {
        return computeFromAcciones([], usuarioId ?? '', fecha)
      }
      const medicion = await disciplinaService.getByUsuarioAndFecha(usuarioId, fecha)
      if (medicion) {
        return { ...medicion, fromFallback: false }
      }
      const acciones = await accionesService.list({
        fecha_creacion: fecha,
        responsable: usuarioId,
      })
      return computeFromAcciones(acciones, usuarioId, fecha)
    },
    enabled: !!usuarioId && !!fecha,
  })
}
