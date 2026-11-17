import type {
  ActionActiveQuery,
  ActionQueryScope,
  ActionQueryStatusGroup,
  ActionQueryVisual,
} from '@/features/ai-support/actionQuery/types'
import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import type { AssistantUiPayload } from '@/features/ai-support/chatViews/types'
import type { CopilotClarification } from '@/features/ai-support/copilot/types'

export type ConversationRelation =
  | 'responsable'
  | 'created_by'
  | 'board'
  | 'person_responsable'
  | 'team'

export type ConversationIntent =
  | 'count'
  | 'list'
  | 'recommend'
  | 'clarify'
  | 'prepare_comms'
  | 'handoff'

export type ConversationResponseMode = 'count' | 'list' | 'clarify' | 'analysis' | 'empty' | 'error'

export type PersonRef = { id: string; nombre: string }

export type PersonClarification = {
  kind: 'person'
  candidates: NamedPerson[]
  originalMessage: string
  hint: string
}

export type ConversationQueryState = {
  entity: 'kanban_action' | 'okr' | 'comms' | 'none'
  intent: ConversationIntent
  scope: ActionQueryScope
  status_group: ActionQueryStatusGroup
  visual: ActionQueryVisual
  person: PersonRef | null
  relation: ConversationRelation
  responseMode: ConversationResponseMode
  lastResultIds: string[]
  pendingClarification: PersonClarification | null
  updatedAt: string
}

export type ApplyTurnInput = {
  message: string
  previous: ConversationQueryState | null
  people: NamedPerson[]
  canSeeTeam: boolean
}

export type ApplyTurnResult =
  | { kind: 'query'; state: ConversationQueryState }
  | { kind: 'clarify'; state: ConversationQueryState; clarification: CopilotClarification }
  | { kind: 'handoff'; state: ConversationQueryState; reason: string }

export type ConversationReply = {
  content: string
  ui: AssistantUiPayload
  clarification?: CopilotClarification
  state: ConversationQueryState
  debug?: {
    intent: ConversationIntent
    scope: ActionQueryScope
    personId: string | null
    prevScope: ActionQueryScope | null
    resultCount: number
  }
}

export function initialConversationState(): ConversationQueryState {
  return {
    entity: 'none',
    intent: 'count',
    scope: 'assigned_to_me',
    status_group: 'open',
    visual: 'none',
    person: null,
    relation: 'responsable',
    responseMode: 'count',
    lastResultIds: [],
    pendingClarification: null,
    updatedAt: new Date().toISOString(),
  }
}

export function toActiveQuery(state: ConversationQueryState): ActionActiveQuery {
  return {
    type: 'active_query',
    entity: 'actions',
    scope: state.scope,
    status_group: state.status_group,
    visual: state.visual,
    at: state.updatedAt,
  }
}
