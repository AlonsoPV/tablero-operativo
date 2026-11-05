export const COPILOT_READ_TOOLS = [
  'get_my_actions',
  'get_action_details',
  'get_team_actions',
  'get_pending_verifications',
  'get_okr_progress',
  'search_people',
  'get_dashboard_summary',
  'get_org_chart',
  'get_module_data',
  'search_board',
] as const

export const COPILOT_WRITE_TOOLS = [
  'create_action',
  'update_action',
  'add_action_comment',
  'update_checklist_item',
  'mark_action_done',
  'verify_action',
] as const

export type CopilotReadTool = (typeof COPILOT_READ_TOOLS)[number]
export type CopilotWriteTool = (typeof COPILOT_WRITE_TOOLS)[number]
export type CopilotToolName = CopilotReadTool | CopilotWriteTool

export type CopilotPendingStatus =
  | 'pending'
  | 'executing'
  | 'confirmed'
  | 'cancelled'
  | 'expired'
  | 'conflict'

export type CopilotPreviewField = {
  label: string
  from?: string
  to?: string
}

export type CopilotRecordRef = {
  id: string
  title: string
  href: string
}

export type CopilotClarification = {
  question: string
  options: Array<{ id: string; label: string }>
}

export type CopilotProposal = {
  id: string
  tool: CopilotWriteTool
  title: string
  summary: string
  fields: CopilotPreviewField[]
  record?: CopilotRecordRef
  expiresAt: string
}

export type CopilotToolResult = {
  ok: boolean
  tool: CopilotToolName
  kind: 'read' | 'proposal' | 'clarification' | 'denied' | 'error'
  data?: unknown
  proposal?: CopilotProposal
  clarification?: CopilotClarification
  error?: string
}

export type CopilotChatExtras = {
  proposals?: CopilotProposal[]
  clarification?: CopilotClarification
  toolTrace?: Array<{ tool: string; kind: string }>
}
