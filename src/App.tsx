import { Toaster } from 'sonner'
import { AppProviders } from '@/providers'
import { Routes } from '@/routes'

export function App() {
  return (
    <AppProviders>
      <Routes />
      <Toaster richColors position="top-right" />
    </AppProviders>
  )
}
