/**
 * Grid de tarjetas KPI del dashboard (spec §4.1).
 */

import {
  ListTodo,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react'
import type { MetricasAcciones } from '@/features/operations'
import { DashboardKpiCard } from './DashboardKpiCard'

export interface DashboardKpiCardsProps {
  metricas: MetricasAcciones
  isLoading?: boolean
}

export function DashboardKpiCards({ metricas, isLoading }: DashboardKpiCardsProps) {
  return (
    <div
      id="dashboard-kpi-cards"
      className="dashboard-kpi-cards grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-5 lg:gap-4"
    >
      <DashboardKpiCard
        id="dashboard-kpi-card-total"
        className="dashboard-kpi-card dashboard-kpi-card-total"
        title="Total"
        value={metricas.total}
        description="Acciones con la fecha del filtro"
        icon={ListTodo}
        accent="slate"
        isLoading={isLoading}
      />
      <DashboardKpiCard
        id="dashboard-kpi-card-completadas"
        className="dashboard-kpi-card dashboard-kpi-card-completadas"
        title="Completadas"
        value={metricas.completadas}
        description="Hecho o verificado"
        icon={CheckCircle2}
        accent="emerald"
        isLoading={isLoading}
      />
      <DashboardKpiCard
        id="dashboard-kpi-card-bloqueadas"
        className="dashboard-kpi-card dashboard-kpi-card-bloqueadas"
        title="Bloqueadas"
        value={metricas.bloqueadas}
        description="Estado bloqueado"
        icon={AlertCircle}
        accent="red"
        isLoading={isLoading}
      />
      <DashboardKpiCard
        id="dashboard-kpi-card-retraso"
        className="dashboard-kpi-card dashboard-kpi-card-retraso"
        title="Retraso"
        value={metricas.retraso}
        description="Fecha límite vencida sin cerrar"
        icon={AlertTriangle}
        accent="orange"
        isLoading={isLoading}
      />
      <DashboardKpiCard
        id="dashboard-kpi-card-eficiencia"
        className="dashboard-kpi-card dashboard-kpi-card-eficiencia col-span-2 lg:col-span-1"
        title="Eficiencia"
        value={`${metricas.eficienciaPorcentaje}%`}
        description="Completadas ÷ total"
        icon={TrendingUp}
        accent="blue"
        isLoading={isLoading}
      />
    </div>
  )
}
