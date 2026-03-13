import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { APP_NAME, ROUTES } from '@/constants'
import { useNavigate } from 'react-router-dom'

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>
            Inicia sesión para acceder al tablero
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Placeholder: aquí se integrará Supabase Auth */}
          <Button
            className="w-full"
            onClick={() => navigate(ROUTES.DASHBOARD)}
          >
            Entrar (demo)
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
