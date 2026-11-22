/**
 * Paridad AT-20: mismo corpus de intenciones en web, WhatsApp simulado y voz simulada.
 * No envía Graph ni Retell.
 */
import { interpretOperationalMessage, type OperationalIntent } from '../operationalInterpret.js'
import { detectAssistantIntent } from '../../../src/features/ai-support/operationalContext/detectAssistantIntent.js'
import { classifyWhatsAppIntent } from '../../../src/lib/whatsappFlowRouting.js'
import type { WhatsAppIntent } from '../../../src/lib/whatsappFlowRouting.js'
import { createSimulatedRetellLinkRuntime } from './providerRuntime.js'

export type OmniFamily =
  | 'query_pending'
  | 'query_overdue'
  | 'prepare_followup'
  | 'propose_action'
  | 'approve'

export type OmniCase = {
  id: string
  text: string
  family: OmniFamily
  whatsapp?: { buttonId?: string }
  publicApprove?: boolean
}

export const AT20_CORPUS: OmniCase[] = [
  { id: 'pending', text: 'Que tengo pendiente?', family: 'query_pending' },
  { id: 'overdue', text: 'Cuales estan vencidas?', family: 'query_overdue' },
  {
    id: 'followup',
    text: 'Prepara un seguimiento por WhatsApp para el responsable',
    family: 'prepare_followup',
  },
  {
    id: 'create',
    text: 'Crea una accion para cerrar el POD manana',
    family: 'propose_action',
  },
  {
    id: 'approve',
    text: 'Confirma la accion acordada',
    family: 'approve',
    whatsapp: { buttonId: 'aiop:11111111-1111-4111-8111-111111111111:ok' },
    publicApprove: true,
  },
]

function familyFromOperational(intent: OperationalIntent, text: string): OmniFamily {
  if (intent === 'propose_create_kanban' || intent === 'propose_create_initiative') {
    return 'propose_action'
  }
  if (intent === 'prepare_comms') return 'prepare_followup'
  if (/vencid/.test(text.toLowerCase())) return 'query_overdue'
  return 'query_pending'
}

export function classifyOmniCase(item: OmniCase) {
  const operational = interpretOperationalMessage(item.text)
  const assistant = detectAssistantIntent(item.text)
  const wa = classifyWhatsAppIntent({
    canUseAi: true,
    textBody: item.whatsapp?.buttonId ? null : item.text,
    buttonId: item.whatsapp?.buttonId ?? null,
    messageType: item.whatsapp?.buttonId ? 'interactive' : 'text',
  })
  return {
    family: item.family,
    web: {
      operational: operational.intent,
      assistant,
      family:
        item.family === 'approve'
          ? ('approve' as const)
          : familyFromOperational(operational.intent, item.text),
    },
    whatsapp: {
      intent: wa.intent as WhatsAppIntent,
      route: wa.route.kind,
    },
  }
}

export async function runAt20ParityCase(item: OmniCase) {
  const classified = classifyOmniCase(item)
  const runtime = createSimulatedRetellLinkRuntime({
    authenticated: !item.publicApprove,
  })

  if (item.publicApprove) {
    const confirm = runtime.confirmAction('accion-1')
    return {
      ...classified,
      voice: {
        phase: runtime.snapshot().phase,
        protectedConfirmOk: confirm.ok,
      },
    }
  }

  await runtime.consent()
  await runtime.start()
  const spoken = await runtime.speak(item.text)
  return {
    ...classified,
    voice: {
      phase: spoken.phase,
      protectedConfirmOk: null as boolean | null,
    },
  }
}
