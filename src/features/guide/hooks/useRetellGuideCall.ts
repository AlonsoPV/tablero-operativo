import { createVoiceInputMonitor } from '@/features/guide/voiceInputActivity'
import { hasValidUserTranscriptActivity } from '@/features/guide/voiceInactivity'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RetellWebClient } from 'retell-client-js-sdk'
import { guideService } from '@/features/guide/services/guide.service'
import type { GuideCompactMessage, GuideMessage, GuideSession } from '@/features/guide/types'
import { stopSpeechPlayback } from '@/lib/speechPlayback'

export type RetellGuideStatus = 'idle' | 'connecting' | 'connected' | 'ended' | 'error'

type RetellUtterance = {
  role?: string
  content?: string
}

function utterancesToMessages(sessionId: string, utterances: RetellUtterance[]): GuideMessage[] {
  return utterances
    .filter(
      (item) =>
        (item.role === 'user' || item.role === 'agent') &&
        typeof item.content === 'string' &&
        item.content.trim()
    )
    .map((item, index) => ({
      id: `retell-${index + 1}`,
      session_id: sessionId,
      sequence: index + 1,
      role: item.role === 'agent' ? 'assistant' : 'user',
      content: item.content!.trim().slice(0, 8000),
      created_at: new Date().toISOString(),
    }))
}

export function compactRetellMessages(messages: GuideMessage[]): GuideCompactMessage[] {
  return messages.map((message) => ({
    sequence: message.sequence,
    role: message.role,
    content: message.content,
  }))
}

export function useRetellGuideCall(options?: {
  guideToken?: string
  accessGrant?: string
  onRemoteEnded?: () => void
  onError?: (message: string) => void
}) {
  const clientRef = useRef<RetellWebClient | null>(null)
  const sessionIdRef = useRef('')
  const localStopRef = useRef(false)
  const runIdRef = useRef(0)
  const probeStreamRef = useRef<MediaStream | null>(null)
  const inputMonitorRef = useRef<ReturnType<typeof createVoiceInputMonitor> | null>(null)
  const guideTokenRef = useRef(options?.guideToken?.trim() || '')
  const accessGrantRef = useRef(options?.accessGrant?.trim() || '')
  const onRemoteEndedRef = useRef(options?.onRemoteEnded)
  const onErrorRef = useRef(options?.onError)
  guideTokenRef.current = options?.guideToken?.trim() || ''
  accessGrantRef.current = options?.accessGrant?.trim() || ''
  onRemoteEndedRef.current = options?.onRemoteEnded
  onErrorRef.current = options?.onError

  const [status, setStatus] = useState<RetellGuideStatus>('idle')
  const statusRef = useRef<RetellGuideStatus>('idle')
  const [muted, setMuted] = useState(false)
  const [agentTalking, setAgentTalking] = useState(false)
  const [awaitingResponse, setAwaitingResponse] = useState(false)
  const [messages, setMessages] = useState<GuideMessage[]>([])
  const messagesRef = useRef<GuideMessage[]>([])
  const preservedMessagesRef = useRef<GuideMessage[]>([])
  messagesRef.current = messages
  statusRef.current = status

  const detach = useCallback(() => {
    const client = clientRef.current
    if (!client) return
    client.removeAllListeners()
    clientRef.current = null
  }, [])

  const releaseProbe = useCallback(() => {
    if (inputMonitorRef.current) inputMonitorRef.current.close()
    else probeStreamRef.current?.getTracks().forEach((track) => track.stop())
    inputMonitorRef.current = null
    probeStreamRef.current = null
  }, [])

  const stop = useCallback(() => {
    runIdRef.current += 1
    localStopRef.current = true
    releaseProbe()
    stopSpeechPlayback()
    const client = clientRef.current
    if (client) {
      try {
        client.stopCall()
      } catch {
        /* ya cerrada */
      }
      detach()
    }
    setAgentTalking(false)
    setAwaitingResponse(false)
    setMuted(false)
    if (statusRef.current === 'connecting' || statusRef.current === 'connected') setStatus('ended')
  }, [detach, releaseProbe])

  const start = useCallback(async (opts?: {
    intent?: 'consult' | 'create' | 'action' | 'whatsapp' | 'email'
    preserveHistory?: boolean
    resumeSessionId?: string
  }): Promise<{ session: GuideSession; callId: string }> => {
    // Prevent duplicate sessions: cleanly close any prior client before starting.
    const prevClient = clientRef.current
    if (prevClient) {
      localStopRef.current = true
      try {
        prevClient.stopCall()
      } catch {
        /* ya cerrada */
      }
      detach()
    }
    releaseProbe()
    stopSpeechPlayback()

    const runId = ++runIdRef.current
    localStopRef.current = false
    setStatus('connecting')
    setAwaitingResponse(false)
    setMuted(false)
    setAgentTalking(false)
    preservedMessagesRef.current = opts?.preserveHistory ? [...messagesRef.current] : []
    setMessages(preservedMessagesRef.current)
    sessionIdRef.current = ''

    let probe: MediaStream | null = null
    try {
      probe = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (runId !== runIdRef.current) {
        probe.getTracks().forEach(track=>track.stop())
        throw new Error('La sesión de voz fue cancelada antes de conectar.')
      }
      probeStreamRef.current = probe
      inputMonitorRef.current = createVoiceInputMonitor(probe)
    } catch {
      if (runId === runIdRef.current) setStatus('error')
      throw new Error('Necesitas permitir el microfono para hablar con Guia.')
    }
    if (runId !== runIdRef.current) {
      throw new Error('La sesion de voz fue cancelada antes de conectar.')
    }

    const guideToken = guideTokenRef.current || undefined
    const accessGrant =
      accessGrantRef.current ||
      (guideToken ? guideService.readAccessGrant(guideToken) : '') ||
      undefined
    if (guideToken && !accessGrant) {
      releaseProbe()
      setStatus('error')
      throw new Error('Vuelve a la invitacion y acepta el consentimiento para iniciar la voz.')
    }
    const intentRaw = opts?.intent
    const intent =
      intentRaw === 'create' || intentRaw === 'action'
        ? 'action'
        : intentRaw === 'whatsapp' || intentRaw === 'email'
          ? intentRaw
          : 'consult'
    const created = await guideService.createRetellWebCall({
      replaceActive: true,
      resumeSessionId: opts?.resumeSessionId,
      intent,
      guideToken,
      accessGrant,
    }).catch(error=>{
      if (runId === runIdRef.current) {releaseProbe(); setStatus('error')}
      throw error
    })
    if (runId !== runIdRef.current) {
      throw new Error('La sesion de voz fue cancelada antes de conectar.')
    }
    sessionIdRef.current = created.session.id

    const client = new RetellWebClient()
    clientRef.current = client

    client.on('call_started', () => {
      setStatus('connected')
    })
    client.on('agent_start_talking', () => {setAwaitingResponse(false); setAgentTalking(true)})
    client.on('agent_stop_talking', () => setAgentTalking(false))
    client.on('update', (event: { transcript?: RetellUtterance[] }) => {
      const live = utterancesToMessages(sessionIdRef.current, event?.transcript ?? [])
      const next = [...preservedMessagesRef.current, ...live].map((message,index)=>({...message,sequence:index+1}))
      if (hasValidUserTranscriptActivity(messagesRef.current, next)) setAwaitingResponse(true)
      if (next.at(-1)?.role === 'assistant') setAwaitingResponse(false)
      messagesRef.current = next
      setMessages(next)
    })
    client.on('error', (message: unknown) => {
      releaseProbe()
      const text = typeof message === 'string' && message.trim() ? message.trim() : 'Error en la llamada de Guia.'
      setAgentTalking(false)
      setMuted(false)
      setStatus('error')
      try {
        client.stopCall()
      } catch {
        /* ya cerrada */
      }
      detach()
      onErrorRef.current?.(text)
    })
    client.on('call_ended', () => {
      releaseProbe()
      setAwaitingResponse(false)
      setAgentTalking(false)
      setStatus('ended')
      const remote = !localStopRef.current
      localStopRef.current = false
      detach()
      if (remote) onRemoteEndedRef.current?.()
    })

    try {
      await client.startCall({
        accessToken: created.access_token,
        callId: created.call_id,
        transport: created.transport,
        iceServers: created.ice_servers,
        sampleRate: 24000,
      })
      if (runId !== runIdRef.current) {
        try {
          client.stopCall()
        } catch {
          /* ya cerrada */
        }
        detach()
        throw new Error('La sesion de voz fue cancelada antes de conectar.')
      }
    } catch (error) {
      if (runId === runIdRef.current) releaseProbe()
      detach()
      if (runId === runIdRef.current) setStatus('error')
      throw error instanceof Error ? error : new Error('No se pudo conectar la llamada de Guia.')
    }

    return { session: created.session, callId: created.call_id }
  }, [detach, releaseProbe])

  const toggleMute = useCallback(() => {
    const client = clientRef.current
    if (!client || status !== 'connected') return
    if (muted) {
      client.unmute()
      setMuted(false)
    } else {
      client.mute()
      setMuted(true)
    }
  }, [muted, status])

  useEffect(() => {
    return () => {
      runIdRef.current += 1
      localStopRef.current = true
      releaseProbe()
      stopSpeechPlayback()
      try {
        clientRef.current?.stopCall()
      } catch {
        /* unmount */
      }
      clientRef.current?.removeAllListeners()
      clientRef.current = null
    }
  }, [releaseProbe])

  return {
    status,
    muted,
    agentTalking,
    awaitingResponse,
    readInputActivity: () => inputMonitorRef.current?.read() ?? 'unknown',
    messages,
    compactMessages: () => compactRetellMessages(messagesRef.current),
    start,
    stop,
    toggleMute,
  }
}
