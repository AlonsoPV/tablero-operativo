import { useCallback, useEffect, useRef, useState } from 'react'
import { RetellWebClient } from 'retell-client-js-sdk'
import { guideService } from '@/features/guide/services/guide.service'
import type { GuideCompactMessage, GuideMessage, GuideSession } from '@/features/guide/types'

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
  onRemoteEnded?: () => void
  onError?: (message: string) => void
}) {
  const clientRef = useRef<RetellWebClient | null>(null)
  const sessionIdRef = useRef('')
  const localStopRef = useRef(false)
  const onRemoteEndedRef = useRef(options?.onRemoteEnded)
  const onErrorRef = useRef(options?.onError)
  onRemoteEndedRef.current = options?.onRemoteEnded
  onErrorRef.current = options?.onError

  const [status, setStatus] = useState<RetellGuideStatus>('idle')
  const statusRef = useRef<RetellGuideStatus>('idle')
  const [muted, setMuted] = useState(false)
  const [agentTalking, setAgentTalking] = useState(false)
  const [messages, setMessages] = useState<GuideMessage[]>([])
  const messagesRef = useRef<GuideMessage[]>([])
  messagesRef.current = messages
  statusRef.current = status

  const detach = useCallback(() => {
    const client = clientRef.current
    if (!client) return
    client.removeAllListeners()
    clientRef.current = null
  }, [])

  const stop = useCallback(() => {
    localStopRef.current = true
    const client = clientRef.current
    if (client) {
      try {
        client.stopCall()
      } catch {
        /* ya cerrada */
      }
    }
    setAgentTalking(false)
    setMuted(false)
    if (statusRef.current === 'connecting' || statusRef.current === 'connected') setStatus('ended')
  }, [])

  const start = useCallback(async (): Promise<{ session: GuideSession; callId: string }> => {
    localStopRef.current = false
    setStatus('connecting')
    setMuted(false)
    setAgentTalking(false)
    setMessages([])
    sessionIdRef.current = ''

    let probe: MediaStream | null = null
    try {
      probe = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStatus('error')
      throw new Error('Necesitas permitir el microfono para hablar con Guia.')
    } finally {
      probe?.getTracks().forEach((track) => track.stop())
    }

    const created = await guideService.createRetellWebCall({ replaceActive: true })
    sessionIdRef.current = created.session.id

    const client = new RetellWebClient()
    clientRef.current = client

    client.on('call_started', () => {
      setStatus('connected')
    })
    client.on('agent_start_talking', () => setAgentTalking(true))
    client.on('agent_stop_talking', () => setAgentTalking(false))
    client.on('update', (event: { transcript?: RetellUtterance[] }) => {
      const next = utterancesToMessages(sessionIdRef.current, event?.transcript ?? [])
      setMessages(next)
    })
    client.on('error', (message: unknown) => {
      const text = typeof message === 'string' && message.trim() ? message.trim() : 'Error en la llamada de Guia.'
      setStatus('error')
      onErrorRef.current?.(text)
    })
    client.on('call_ended', () => {
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
    } catch (error) {
      detach()
      setStatus('error')
      throw error instanceof Error ? error : new Error('No se pudo conectar la llamada de Guia.')
    }

    return { session: created.session, callId: created.call_id }
  }, [detach])

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
      localStopRef.current = true
      try {
        clientRef.current?.stopCall()
      } catch {
        /* unmount */
      }
      clientRef.current?.removeAllListeners()
      clientRef.current = null
    }
  }, [])

  return {
    status,
    muted,
    agentTalking,
    messages,
    compactMessages: () => compactRetellMessages(messagesRef.current),
    start,
    stop,
    toggleMute,
  }
}
