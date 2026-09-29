import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { ROUTES } from '@/constants'

interface LinkedKr {
  id: string
  okr_key_results: {
    title: string
    okrs: { id: string; nombre_okr: string } | null
  } | null
}

/** Reads through RLS: displaying an action never grants access to a private OKR. */
export function ActionOkrLinks({
  actionId,
  kind,
}: {
  actionId: string
  kind: 'company' | 'team'
}) {
  const query = useQuery({
    queryKey: ['okr-action-links', kind, actionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('okr_initiatives')
        .select('id, okr_key_results(title, okrs(id, nombre_okr))')
        .eq(kind === 'company' ? 'action_id' : 'team_action_id', actionId)
      if (error) throw new Error(error.message)
      return data as unknown as LinkedKr[]
    },
  })
  if (query.isError)
    return (
      <p className="px-4 py-1 text-xs text-muted-foreground">
        Vínculos OKR no disponibles.
      </p>
    )
  const links = query.data?.filter((item) => item.okr_key_results?.okrs) ?? []
  if (!links.length) return null
  return (
    <div className="flex flex-wrap gap-2 border-b px-4 py-2 text-xs">
      <span className="font-medium">Iniciativa de:</span>
      {links.map((item) => {
        const kr = item.okr_key_results!
        return (
          <Link
            className="text-primary hover:underline"
            key={item.id}
            to={`${ROUTES.OKRS}?objective=${kr.okrs!.id}`}
          >
            {kr.okrs!.nombre_okr} → {kr.title}
          </Link>
        )
      })}
    </div>
  )
}
