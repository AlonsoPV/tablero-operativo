import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark'

interface AppState {
  sidebarOpen: boolean
  theme: ThemeMode
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  /** Llamar en logout para limpiar estado UI (p. ej. filtros futuros). */
  resetOnLogout: () => void
}

const THEME_STORAGE_KEY = 'scrumban-theme'

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
}

const initialState = { sidebarOpen: true }

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  theme: getInitialTheme(),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
    set({ theme })
  },
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === 'dark' ? 'light' : 'dark'
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme)
      }
      return { theme }
    }),
  resetOnLogout: () => set(initialState),
}))
