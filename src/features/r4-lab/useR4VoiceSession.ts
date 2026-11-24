import { useCallback, useEffect, useMemo, useState } from 'react'
import { createLinkStore } from '../../../api/_shared/r4/linkStore'
import { createR4SessionOrchestrator } from '../../../api/_shared/r4/sessionOrchestrator'
import { createSimulatedR4Adapters } from '../../../api/_shared/r4/simulatedAdapters'
import { createOnceReportFinalizer } from '../../../api/_shared/r4/reportFinalize'
import type { R4SessionSnapshot } from '../../../api/_shared/r4/sessionTypes'
import {
  linkRecordForScenario,
  sessionAuthForScenario,
  type R4LabScenario,
} from './labScenarios'

function createLabSession(scenario: R4LabScenario) {
  const auth = sessionAuthForScenario(scenario)
  return createR4SessionOrchestrator({
    adapters: createSimulatedR4Adapters(),
    linkStore: createLinkStore(linkRecordForScenario(scenario)),
    authenticated: auth.authenticated,
    publicConfirmAttempt: auth.publicConfirmAttempt,
    requesterUsuarioId: auth.requesterUsuarioId,
    sessionId: `lab-${scenario}`,
    source: 'link',
    isoNow: () => new Date().toISOString(),
    finalizer: createOnceReportFinalizer(() => new Date().toISOString()),
  })
}

export function useR4VoiceSession(scenario: R4LabScenario) {
  const [version, setVersion] = useState(0)
  const orchestrator = useMemo(() => createLabSession(scenario), [scenario, version])
  const [snapshot, setSnapshot] = useState<R4SessionSnapshot>(() => orchestrator.getSnapshot())

  useEffect(() => {
    setSnapshot(orchestrator.getSnapshot())
  }, [orchestrator])

  const refresh = useCallback((next: R4SessionSnapshot) => {
    setSnapshot(next)
    return next
  }, [])

  const reset = useCallback(() => {
    setVersion((value) => value + 1)
  }, [])

  const consent = useCallback(async () => refresh(await orchestrator.consent()), [orchestrator, refresh])
  const start = useCallback(async () => refresh(await orchestrator.start()), [orchestrator, refresh])
  const speak = useCallback(
    async (text: string) => refresh(await orchestrator.speak(text, `ui-${Date.now()}`)),
    [orchestrator, refresh]
  )
  const pause = useCallback(async () => refresh(await orchestrator.pause()), [orchestrator, refresh])
  const resume = useCallback(async () => refresh(await orchestrator.resume()), [orchestrator, refresh])
  const interruptSpeech = useCallback(
    async () => refresh(await orchestrator.interruptSpeech()),
    [orchestrator, refresh]
  )
  const recover = useCallback(async () => refresh(await orchestrator.recover()), [orchestrator, refresh])
  const end = useCallback(async () => refresh(await orchestrator.end()), [orchestrator, refresh])
  const cancelTurn = useCallback(
    async () => refresh(await orchestrator.cancelTurn()),
    [orchestrator, refresh]
  )
  const confirmAction = useCallback(
    () => orchestrator.confirmAction('lab-action') && refresh(orchestrator.getSnapshot()),
    [orchestrator, refresh]
  )

  return {
    snapshot,
    consent,
    start,
    speak,
    pause,
    resume,
    interruptSpeech,
    recover,
    end,
    cancelTurn,
    confirmAction,
    reset,
  }
}
