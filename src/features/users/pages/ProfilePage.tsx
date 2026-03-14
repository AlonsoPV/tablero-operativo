import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useCurrentUser } from '../hooks'
import { useUpdateUser } from '../hooks'
import { ChangePasswordCard } from '../components/ChangePasswordCard'
import { Pencil, User } from 'lucide-react'
import { toast } from 'sonner'

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function ProfilePage() {
  const { refetch: refetchAuth, user: authUser } = useAuth()
  const { data: user, isLoading, isError } = useCurrentUser()
  const updateUser = useUpdateUser()
  const [editOpen, setEditOpen] = useState(false)
  const [nombreEdit, setNombreEdit] = useState('')

  const handleOpenEdit = () => {
    if (user) {
      setNombreEdit(user.nombre)
      setEditOpen(true)
    }
  }

  const handleSaveNombre = () => {
    if (!user) return
    updateUser.mutate(
      { id: user.id, input: { nombre: nombreEdit.trim() } },
      {
        onSuccess: () => {
          toast.success('Nombre actualizado correctamente')
          setEditOpen(false)
          refetchAuth()
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Error al actualizar')
        },
      }
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Cargando perfil...
      </div>
    )
  }

  if (isError || !user) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        No se pudo cargar tu perfil. Intenta recargar la página.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Mi perfil</h2>
        <p className="text-muted-foreground">
          Información de tu cuenta y preferencias
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">{user.nombre}</CardTitle>
              <CardDescription>
                Rol: {user.rol} · {user.area ?? 'Sin área asignada'}
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleOpenEdit}>
            <Pencil className="mr-1 h-4 w-4" />
            Editar nombre
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Correo</dt>
              <dd className="mt-0.5 text-sm">{authUser?.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Nombre</dt>
              <dd className="mt-0.5 text-sm">{user.nombre}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Rol</dt>
              <dd className="mt-0.5">
                <Badge variant="secondary">{user.rol}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Área</dt>
              <dd className="mt-0.5 text-sm">{user.area ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Estatus</dt>
              <dd className="mt-0.5">
                <Badge variant={user.activo ? 'success' : 'muted'}>
                  {user.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Onboarding</dt>
              <dd className="mt-0.5">
                <Badge variant={user.onboarding_completed ? 'success' : 'outline'}>
                  {user.onboarding_completed ? 'Completado' : 'Pendiente'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Cuenta creada</dt>
              <dd className="mt-0.5 text-sm">{formatDate(user.created_at)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Última actualización</dt>
              <dd className="mt-0.5 text-sm">{formatDate(user.updated_at)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ChangePasswordCard />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar nombre</DialogTitle>
            <DialogDescription>
              Actualiza tu nombre de visualización. El rol y área solo pueden ser modificados por un administrador.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="profile-nombre">Nombre</Label>
              <Input
                id="profile-nombre"
                value={nombreEdit}
                onChange={(e) => setNombreEdit(e.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} disabled={updateUser.isPending}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveNombre}
                disabled={
                  !nombreEdit.trim() ||
                  nombreEdit.trim().length < 2 ||
                  nombreEdit.trim() === user.nombre ||
                  updateUser.isPending
                }
              >
                {updateUser.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
