export type GuideProvider = 'text' | 'retell'

export type GuideSessionStatus =
  | 'active'
  | 'closing'
  | 'completed'
  | 'abandoned'
  | 'safety_ended'

export type GuideMessageRole = 'user' | 'assistant'

export type GuideSession = {
  id: string
  usuario_id: string
  provider: GuideProvider
  provider_session_id: string | null
  status: GuideSessionStatus
  started_at: string
  expires_at: string
  closed_at: string | null
  close_reason: string | null
  created_at: string
  updated_at: string
}

export type GuideMessage = {
  id: string
  session_id: string
  sequence: number
  role: GuideMessageRole
  content: string
  created_at: string
}

export type GuideJournalEntry = {
  id: string
  session_id: string
  usuario_id: string
  topic: string | null
  summary: string | null
  learning: string | null
  intention: string | null
  reflection_question: string | null
  user_words: string | null
  agent_inferences: string | null
  created_at: string
  updated_at: string
}

export type GuideCloseReason = 'user_requested' | 'time_limit' | 'safety_ended' | 'abandoned'

export type GuideChatTurnResponse = {
  answer: string
  remaining_seconds: number
  sequence: number
}

export type GuideChatCloseResponse = {
  remaining_seconds: number
  journal: GuideJournalEntry | null
  status: GuideSessionStatus
}

export type GuideCompactMessage = {
  sequence: number
  role: GuideMessageRole
  content: string
}

export type GuideRetellWebCallResponse = {
  access_token: string
  call_id: string
  transport?: 'livekit' | 'gateway'
  ice_servers?: RTCIceServer[]
  guide_session_id: string
  expires_at: string
  max_duration_seconds: number
  session: GuideSession
}
