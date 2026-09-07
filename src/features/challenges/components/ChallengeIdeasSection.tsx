import { useState } from 'react'
import { Lightbulb, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import type { Usuario } from '@/types'
import { isAdminByRole, isDirectionByRole, isSuperAdminByRole } from '@/features/auth/lib/permissions'
import { ChallengeIdeaCard } from './ChallengeIdeaCard'
import { ChallengeIdeaFormDialog } from './ChallengeIdeaFormDialog'
import { useChallengeIdeas, useToggleChallengeIdeaVote } from '../hooks/useChallengeIdeas'
import type { ChallengeIdeaListItem, ChallengeIdeaSort, ChallengeListItem } from '../types'

export function ChallengeIdeasSection({
  challenge,
  currentUser,
  userNames,
  openForParticipation,
}: {
  challenge: ChallengeListItem
  currentUser?: Usuario | null
  userNames: Record<string, string>
  openForParticipation: boolean
}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ChallengeIdeaSort>('top')
  const [dialogOpen, setDialogOpen] = useState(false)
  const canManage = Boolean(
    currentUser && (isAdminByRole(currentUser.rol) || isDirectionByRole(currentUser.rol) || isSuperAdminByRole(currentUser.rol))
  )
  const { data: ideas = [], isLoading, isError, error, refetch } = useChallengeIdeas(
    challenge.id,
    { search, sort, includeHidden: canManage },
    currentUser?.id
  )
  const toggleVote = useToggleChallengeIdeaVote(currentUser?.id)

  const handleVote = async (idea: ChallengeIdeaListItem) => {
    try {
      await toggleVote.mutateAsync({ idea })
      toast.success(idea.voted_by_me ? 'Apoyo retirado' : 'Gracias por apoyar esta propuesta')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar tu apoyo')
    }
  }

  return (
    <SectionCard>
      <SectionCardHeader
        title="Ideas"
        subtitle="Propuestas concretas para resolver el reto."
        icon={Lightbulb}
        action={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              {ideas.length}
            </Badge>
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={!openForParticipation}
              onClick={() => setDialogOpen(true)}
            >
              Proponer
            </Button>
          </div>
        }
      />
      <SectionCardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <label className="relative block">
            <span className="sr-only">Buscar ideas</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar ideas..."
              className="pl-9"
            />
          </label>
          <Select value={sort} onValueChange={(value) => setSort(value as ChallengeIdeaSort)}>
            <SelectTrigger aria-label="Ordenar por">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top">Más apoyadas</SelectItem>
              <SelectItem value="comments">Más comentadas</SelectItem>
              <SelectItem value="recent">Más recientes</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm font-semibold">No se pudieron cargar las ideas.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Revisa permisos o conexión.'}
            </p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        ) : isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-40 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : ideas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center">
            <Lightbulb className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-foreground">Aún no hay ideas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sé el primero en proponer una solución concreta.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {ideas.map((idea) => (
              <ChallengeIdeaCard
                key={idea.id}
                idea={idea}
                authorName={userNames[idea.author_user_id] ?? 'Usuario'}
                currentUserId={currentUser?.id}
                openForParticipation={openForParticipation}
                onVote={handleVote}
              />
            ))}
          </div>
        )}
      </SectionCardBody>

      <ChallengeIdeaFormDialog
        open={dialogOpen}
        challengeId={challenge.id}
        currentUserId={currentUser?.id}
        onOpenChange={setDialogOpen}
      />
    </SectionCard>
  )
}
