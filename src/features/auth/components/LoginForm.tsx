/**
 * Formulario de inicio de sesión con validación.
 */

import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loginFormSchema, type LoginFormValues } from '../schemas/login.schema'
import { ROUTES } from '@/constants'

interface LoginFormProps {
  onSubmit: (values: LoginFormValues) => Promise<void>
  isLoading?: boolean
}

export function LoginForm({ onSubmit, isLoading = false }: LoginFormProps) {
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit({
      email: values.email.trim(),
      password: values.password,
    })
  })

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          disabled={isLoading}
          {...form.register('email')}
          className={form.formState.errors.email ? 'border-destructive' : ''}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Contraseña</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          disabled={isLoading}
          {...form.register('password')}
          className={form.formState.errors.password ? 'border-destructive' : ''}
        />
        {form.formState.errors.password && (
          <p className="text-sm text-destructive">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <Link
          to={ROUTES.FORGOT_PASSWORD}
          className="text-sm text-muted-foreground hover:text-primary hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  )
}
