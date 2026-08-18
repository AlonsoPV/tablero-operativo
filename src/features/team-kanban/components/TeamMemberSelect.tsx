import { useMemo, useState } from 'react'
import { Search, UserRound } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TeamMember } from '../types'
import { filterTeamMembers } from '../utils/teamMemberSearch'

const EMPTY_MEMBER = '__team_member_none__'

export function TeamMemberOption({ member }: { member: TeamMember }) {
  const initials = member.nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'
  const detail = [member.area, member.rol].filter(Boolean).join(' · ')

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{member.nombre}</span>
        {detail ? <span className="block truncate text-[10px] text-muted-foreground">{detail}</span> : null}
      </span>
    </span>
  )
}

type Props = {
  members: TeamMember[]
  value: string | null | undefined
  onValueChange: (value: string | null) => void
  id?: string
  disabled?: boolean
  allowEmpty?: boolean
  emptyLabel?: string
  placeholder?: string
  compact?: boolean
  className?: string
}

export function TeamMemberSelect({
  members,
  value,
  onValueChange,
  id,
  disabled = false,
  allowEmpty = false,
  emptyLabel = 'Sin responsable especifico',
  placeholder = 'Seleccionar responsable',
  compact = false,
  className,
}: Props) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => filterTeamMembers(members, query), [members, query])
  const selected = members.find((member) => member.id === value)

  return (
    <Select
      value={value || (allowEmpty ? EMPTY_MEMBER : undefined)}
      onValueChange={(next) => onValueChange(next === EMPTY_MEMBER ? null : next)}
      onOpenChange={(open) => { if (!open) setQuery('') }}
      disabled={disabled || (!allowEmpty && members.length === 0)}
    >
      <SelectTrigger
        id={id}
        className={cn(
          compact
            ? 'h-8 w-[9.5rem] justify-center gap-1.5 bg-background px-2 text-xs'
            : 'h-10 w-full bg-background',
          className
        )}
        title={selected?.nombre ?? emptyLabel}
      >
        {compact ? <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden /> : null}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-80 min-w-[18rem]">
        <div
          className="sticky top-0 z-10 border-b border-border/60 bg-popover p-2"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre"
              className="h-8 pl-8 text-xs"
              aria-label="Buscar usuario del equipo"
            />
          </div>
        </div>
        {allowEmpty && !query ? <SelectItem value={EMPTY_MEMBER}>{emptyLabel}</SelectItem> : null}
        {filtered.map((member) => (
          <SelectItem key={member.id} value={member.id} textValue={`${member.nombre} ${member.area ?? ''} ${member.rol ?? ''}`}>
            <TeamMemberOption member={member} />
          </SelectItem>
        ))}
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No hay usuarios disponibles dentro de tu equipo.
          </p>
        ) : null}
      </SelectContent>
    </Select>
  )
}
