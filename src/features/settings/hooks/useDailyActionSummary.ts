import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '@/features/users/hooks'
import { dailyActionSummaryService } from '../services/dailyActionSummary.service'
import type { UpdateDailyActionSummarySettingsInput } from '../types/dailyActionSummary.types'

export const dailyActionSummarySettingsQueryKey = ['settings', 'daily-action-summary'] as const
export const dailyActionSummaryLogsQueryKey = ['settings', 'daily-action-summary', 'logs'] as const

export function useDailyActionSummarySettings() {
  return useQuery({
    queryKey: dailyActionSummarySettingsQueryKey,
    queryFn: () => dailyActionSummaryService.getSettings(),
  })
}

export function useDailyActionSummaryLogs(limit = 10) {
  return useQuery({
    queryKey: [...dailyActionSummaryLogsQueryKey, limit],
    queryFn: () => dailyActionSummaryService.listLogs(limit),
  })
}

export function useUpdateDailyActionSummarySettings() {
  const queryClient = useQueryClient()
  const { data: currentUser } = useCurrentUser()

  return useMutation({
    mutationFn: (input: UpdateDailyActionSummarySettingsInput) =>
      dailyActionSummaryService.updateSettings(input, currentUser?.id ?? null),
    onSuccess: (settings) => {
      queryClient.setQueryData(dailyActionSummarySettingsQueryKey, settings)
      queryClient.invalidateQueries({ queryKey: dailyActionSummaryLogsQueryKey })
    },
  })
}

export function useSendDailyActionSummaryTest() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (testEmail?: string) => dailyActionSummaryService.sendTest(testEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dailyActionSummarySettingsQueryKey })
      queryClient.invalidateQueries({ queryKey: dailyActionSummaryLogsQueryKey })
    },
  })
}
