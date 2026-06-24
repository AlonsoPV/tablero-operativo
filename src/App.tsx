import { Suspense, useLayoutEffect } from 'react'
import { Toaster } from 'sonner'
import 'sonner/dist/styles.css'
import { AppErrorBoundary } from '@/components/AppErrorBoundary'
import { PageLoadingFallback } from '@/components/PageLoadingFallback'
import { AppProviders } from '@/providers'
import { Routes } from '@/routes'
import { useAppStore } from '@/store'

export function App() {
  const theme = useAppStore((s) => s.theme)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <AppProviders>
      <AppErrorBoundary>
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes />
        </Suspense>
      </AppErrorBoundary>
      <Toaster
        richColors
        theme={theme}
        position="top-right"
        closeButton
        toastOptions={{
          closeButton: true,
        }}
      />
    </AppProviders>
  )
}
