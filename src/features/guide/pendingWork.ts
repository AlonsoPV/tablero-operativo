import type { AssistantActionDraft, AssistantAudioResult } from '@/lib/assistantAudioClient'
import type { GuideCreatedWork } from '@/features/guide/types'

export function isPendingWork(item: GuideCreatedWork) {
  return Boolean(item.pending && item.title && !item.error)
}

export function isRecordedWork(item: GuideCreatedWork) {
  return Boolean(item.title && !item.error && !item.pending && item.id)
}

export function pendingWorkItems(items: GuideCreatedWork[] | null | undefined) {
  return (items ?? []).filter(isPendingWork)
}

export function recordedWorkItems(items: GuideCreatedWork[] | null | undefined) {
  return (items ?? []).filter(isRecordedWork)
}

function toDraft(item: GuideCreatedWork): AssistantActionDraft {
  return {
    title: item.title,
    description: item.description || item.title,
    objective: item.objective || '',
    evidenceExpected: item.evidenceExpected || '',
    priority: item.priority || 'P2_Media',
    leanWaste: '',
    eosComponent: '',
    ownerHint: item.ownerHint ?? null,
    dueDateHint: item.dueDateHint ?? null,
    activities: item.activities ?? [],
  }
}

export function pendingWorkToAnalysis(items: GuideCreatedWork[]): AssistantAudioResult {
  const drafts = items.filter(isPendingWork).map(toDraft)
  return {
    transcript: '',
    validation: {
      status: drafts.length > 0 ? 'usable' : 'needs_more_context',
      summary: drafts.length > 0 ? 'Borradores del reporte listos para aprobar.' : '',
      missingPoints: [],
      clarificationQuestions: [],
    },
    interpretation: {
      executiveSummary: '',
      signals: [],
      risks: [],
      opportunities: [],
    },
    nextSteps: [],
    actionDrafts: drafts,
  }
}
