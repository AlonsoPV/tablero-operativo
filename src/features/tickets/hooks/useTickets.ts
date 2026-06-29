import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  supportTicketCommentsService,
  supportTicketsService,
  type SupportTicketInput,
  type SupportTicketsFilter,
} from '@/services/supportTickets.service'
import type { SupportTicket, TicketStatus } from '@/types'

const KEY = ['supportTickets'] as const
const COMMENTS_KEY = ['supportTicketComments'] as const

function ticketsFilterKey(filter: SupportTicketsFilter = {}): unknown[] {
  return [
    filter.status ?? 'todos',
    filter.tipo ?? '',
    filter.modulo ?? '',
    filter.search?.trim() ?? '',
  ]
}

export function useTickets(filter: SupportTicketsFilter = {}) {
  return useQuery({
    queryKey: [...KEY, ...ticketsFilterKey(filter)],
    queryFn: () => supportTicketsService.list(filter),
    staleTime: 30_000,
  })
}

export function useTicket(id: string | null | undefined) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: () => supportTicketsService.getById(id!),
    enabled: Boolean(id),
    retry: false,
  })
}

export function useTicketCommentCounts(ticketIds: string[]) {
  const sortedIds = [...ticketIds].sort().join(',')
  return useQuery({
    queryKey: [...COMMENTS_KEY, 'counts', sortedIds],
    queryFn: () => supportTicketCommentsService.countByTicketIds(ticketIds),
    enabled: ticketIds.length > 0,
    staleTime: 30_000,
  })
}

export function useTicketComments(ticketId: string | null | undefined) {
  return useQuery({
    queryKey: [...COMMENTS_KEY, ticketId],
    queryFn: () => supportTicketCommentsService.listByTicket(ticketId!),
    enabled: Boolean(ticketId),
  })
}

function invalidateTicketLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY, refetchType: 'active' })
}

function invalidateCommentCounts(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [...COMMENTS_KEY, 'counts'], refetchType: 'active' })
}

export function useCreateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SupportTicketInput) => supportTicketsService.create(input),
    onSuccess: () => invalidateTicketLists(qc),
  })
}

export function useUpdateTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SupportTicketInput> }) =>
      supportTicketsService.update(id, input),
    onSuccess: (ticket) => {
      qc.setQueryData<SupportTicket>([...KEY, 'detail', ticket.id], ticket)
      invalidateTicketLists(qc)
    },
  })
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, updatedBy }: { id: string; status: TicketStatus; updatedBy?: string | null }) =>
      supportTicketsService.updateStatus(id, status, updatedBy),
    onSuccess: (ticket) => {
      qc.setQueryData<SupportTicket>([...KEY, 'detail', ticket.id], ticket)
      invalidateTicketLists(qc)
    },
  })
}

export function useDeleteTicket() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supportTicketsService.delete(id),
    onSuccess: (_result, id) => {
      qc.removeQueries({ queryKey: [...KEY, 'detail', id] })
      invalidateTicketLists(qc)
      invalidateCommentCounts(qc)
    },
  })
}

export function useCreateTicketComment(ticketId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ticket_id: string; contenido: string; created_by?: string | null }) =>
      supportTicketCommentsService.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...COMMENTS_KEY, ticketId] })
      invalidateCommentCounts(qc)
    },
  })
}
