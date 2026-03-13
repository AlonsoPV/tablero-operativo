import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { APP_NAME } from '@/constants'

export function Header() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        aria-label="Alternar menú"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="text-lg font-semibold truncate">{APP_NAME}</h1>
    </header>
  )
}
