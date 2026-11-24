/**
 * Paridad AT-20: mismo corpus de intenciones en web, WhatsApp simulado y voz simulada.
 * No envía Graph ni Retell.
 */
import { detectAssistantIntent } from '../../../src/features/ai-support/operationalContext/detectAssistantIntent.js'
import { createSimulatedRetellLinkRuntime } from './providerRuntime.js'
import {
  classifySharedAcrossChannels,
  interpretSharedIntent,
  type OmniFamily,
} from './sharedIntent.js'

export type { OmniFamily } from './sharedIntent.js'

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

export function classifyOmniCase(item: OmniCase) {
  const assistant = detectAssistantIntent(item.text)
  const web = interpretSharedIntent({
    text: item.text,
    channel: 'web',
    authenticated: true,
    isOwner: true,
  })
  const whatsappSim = interpretSharedIntent({
    text: item.text,
    channel: 'whatsapp_sim',
    authenticated: true,
    isOwner: true,
    whatsappButtonId: item.whatsapp?.buttonId,
  })
  const voiceSim = interpretSharedIntent({
    text: item.text,
    channel: 'voice_sim',
    authenticated: !item.publicApprove,
    isOwner: true,
    publicConfirmAttempt: item.publicApprove,
  })
  const production = classifySharedAcrossChannels({
    text: item.text,
    whatsappButtonId: item.whatsapp?.buttonId,
  }).whatsappProductionRouter
  return {
    family: item.family,
    web: {
      operational: web.operational,
      assistant,
      family: web.family,
      proposal: web.proposal,
    },
    whatsappSim: {
      family: whatsappSim.family,
      proposal: whatsappSim.proposal,
    },
    voiceSim: {
      family: voiceSim.family,
      proposal: voiceSim.proposal,
    },
    whatsapp: {
      intent: production.intent,
      route: production.route,
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
