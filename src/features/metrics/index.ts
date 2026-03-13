/**
 * Feature: Métricas (spec §4.2, §5.2 semáforo, §5.4 disciplina, §12)
 * Semáforo KPI, disciplina (por usuario/día).
 */

export { useKpiSemaforo, type KpiSemaforoItem } from './hooks/useKpiSemaforo'
export { KPISemaforoCard } from './components/KPISemaforoCard'
export { KPISemaforoGrid } from './components/KPISemaforoGrid'
export { getKpiLabel } from './constants/kpi-labels'
