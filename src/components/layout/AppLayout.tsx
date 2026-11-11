import { Outlet } from 'react-router-dom'
import { AiAssistFloatingButton } from '@/features/ai-support/components/AiAssistFloatingButton'
import { NoIndexHead } from '@/components/seo/NoIndexHead'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <NoIndexHead />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="min-w-0 flex-1 overflow-auto p-4 [scrollbar-gutter:stable]">
          <Outlet />
        </main>
      </div>
      <AiAssistFloatingButton />
    </div>
  )
}
