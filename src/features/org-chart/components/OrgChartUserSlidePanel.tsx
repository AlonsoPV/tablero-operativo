import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { OrgChartUser, OrgChartUserActionStats } from '../types/orgChart.types'
import { OrgChartUserPanel } from './OrgChartUserPanel'

interface OrgChartUserSlidePanelProps {
  open: boolean
  user: OrgChartUser | null
  users: OrgChartUser[]
  actionStats: OrgChartUserActionStats | null
  canEditHierarchy: boolean
  canOpenUserAdmin?: boolean
  currentUserId?: string | null
  onClose: () => void
}

export function OrgChartUserSlidePanel({
  open,
  user,
  users,
  actionStats,
  canEditHierarchy,
  canOpenUserAdmin = false,
  currentUserId,
  onClose,
}: OrgChartUserSlidePanelProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || !user || !actionStats) return null

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar ficha de usuario"
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px] animate-in fade-in-0 lg:bg-black/10"
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border/70 bg-card shadow-2xl',
          'animate-in slide-in-from-right duration-200'
        )}
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${user.nombre}`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <OrgChartUserPanel
            user={user}
            users={users}
            actionStats={actionStats}
            canEditHierarchy={canEditHierarchy}
            canOpenUserAdmin={canOpenUserAdmin}
            currentUserId={currentUserId}
            onClose={onClose}
          />
        </div>
      </aside>
    </>
  )
}
