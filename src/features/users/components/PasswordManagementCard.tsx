import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KeyRound } from 'lucide-react'

/**
 * Gestión de contraseña (placeholder).
 * TODO: Integrar con Supabase Auth cuando esté listo:
 *   - Reset password por email (admin envía link)
 *   - Invitación de usuario (auth.admin.inviteUserByEmail)
 *   - Cambio de contraseña desde admin (auth.admin.updateUserById)
 *   - Self-service password reset (sendPasswordResetEmail)
 * No guardar ni mostrar contraseñas; todo vía auth.users.
 */
export function PasswordManagementCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Gestión de contraseña
            </CardTitle>
            <CardDescription className="mt-1">
              Restablecer o gestionar la contraseña del usuario (vinculado a Auth).
            </CardDescription>
          </div>
          <Badge variant="secondary">Próximamente</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          La funcionalidad de restablecer contraseña estará disponible en una siguiente fase.
          Se conectará con Supabase Auth (auth.users) para enviar enlaces de recuperación o
          invitaciones por email.
        </p>
        <Button disabled variant="outline" className="pointer-events-none">
          Restablecer contraseña
        </Button>
      </CardContent>
    </Card>
  )
}
