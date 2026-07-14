import { supabase } from '@/lib/supabase/client'

export type ManualGamificationRule = {
  id: string
  activity: string
  points: number
  sort_order: number
  updated_at: string | null
}

const TABLE = 'manual_gamification_rules'

const RULES: Array<[string, number]> = [
  ['Crear acción correctamente documentada', 3],
  ['Agregar comentario de avance', 1],
  ['Adjuntar evidencia', 2],
  ['Completar checklist', 2],
  ['Actualizar estatus oportunamente', 2],
  ['Acción vencida', -8],
  ['Acción escalada por falta de seguimiento', -10],
  ['Reprogramación', -4],
  ['Segunda reprogramación', -8],
  ['Acción marcada como Realizada', 5],
  ['Acción Verificada (Responsable)', 7],
  ['Acción Verificada (Verificador)', 7],
  ['Acción cerrada antes de la fecha compromiso', 10],
  ['Acción roja cerrada en tiempo', 5],
  ['Acción sin reprogramaciones', 2],
  ['Día con actividad (racha)', 3],
  ['Semana sin acciones vencidas', 15],
  ['Mes con ICC ≥ 95%', 25],
  ['Completar módulo Academia', 5],
  ['Aprobar evaluación', 8],
  ['Actualizar perfil organizacional (Organigrama)', 15],
]

export const defaultManualGamificationRules: ManualGamificationRule[] = RULES.map(
  ([activity, points], index) => ({
    id: `default-${index + 1}`,
    activity,
    points,
    sort_order: index + 1,
    updated_at: null,
  })
)

function isMissingDatabaseObject(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === '42P01' ||
        error.code === 'PGRST202' ||
        error.code === 'PGRST205' ||
        error.message?.includes('schema cache'))
  )
}

export const manualGamificationService = {
  async list(): Promise<ManualGamificationRule[]> {
    const { data, error } = await supabase.from(TABLE).select('*').order('sort_order')
    if (isMissingDatabaseObject(error)) return defaultManualGamificationRules
    if (error) throw error
    return (data ?? []) as ManualGamificationRule[]
  },

  async canEdit(): Promise<boolean> {
    const { data, error } = await supabase.rpc('can_edit_manual_gamification')
    if (isMissingDatabaseObject(error)) return false
    if (error) throw error
    return data === true
  },

  async update(rule: Pick<ManualGamificationRule, 'id' | 'activity' | 'points'>) {
    if (rule.id.startsWith('default-')) {
      throw new Error('Aplica primero la migración de gamificación para habilitar la edición.')
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update({ activity: rule.activity.trim(), points: rule.points })
      .eq('id', rule.id)
      .select('*')
      .single()

    if (error) throw error
    return data as ManualGamificationRule
  },
}

