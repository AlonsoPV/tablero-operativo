import type { TeamMember } from '../types'

function normalized(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function filterTeamMembers(members: TeamMember[], query: string): TeamMember[] {
  const term = normalized(query)
  if (!term) return members
  return members.filter((member) =>
    normalized(`${member.nombre} ${member.area ?? ''} ${member.rol ?? ''}`).includes(term)
  )
}
