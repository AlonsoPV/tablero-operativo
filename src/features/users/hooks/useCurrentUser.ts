import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { authService } from '@/services/auth.service'
import { usuariosService } from '@/services/usuarios.service'

const QUERY_KEY = ['users', 'current'] as const

export function useCurrentUser() {
  const [authUserId, setAuthUserId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const { data } = await authService.getSession()
        if (mounted && data?.session?.user?.id) {
          setAuthUserId(data.session.user.id)
        } else if (mounted) {
          setAuthUserId(null)
        }
      } catch {
        if (mounted) setAuthUserId(null)
      }
    }
    load()
    const { data: { subscription } } = authService.onAuthStateChange(() => load())
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return useQuery({
    queryKey: [...QUERY_KEY, authUserId],
    queryFn: () => usuariosService.getByAuthId(authUserId!),
    enabled: !!authUserId,
  })
}
