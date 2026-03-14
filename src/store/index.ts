import { create } from 'zustand'

interface AppState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  /** Llamar en logout para limpiar estado UI (p. ej. filtros futuros). */
  resetOnLogout: () => void
}

const initialState = { sidebarOpen: true }

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  resetOnLogout: () => set(initialState),
}))
