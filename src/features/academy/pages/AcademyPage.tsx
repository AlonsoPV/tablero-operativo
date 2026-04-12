import { useMemo, useState } from 'react'
import { SectionCard, SectionCardBody, SectionCardHeader } from '@/components/SectionCard'
import { ACADEMY_MODULES, ACADEMY_TOTAL_MODULES } from '../data/modules'
import { useAcademyProgress } from '../hooks/useAcademyProgress'
import { AcademyModuleCard } from '../components/AcademyModuleCard'
import { AcademyProgressBar } from '../components/AcademyProgressBar'
import { AcademyModuleDetail } from '../components/AcademyModuleDetail'
import { AcademyQuiz } from '../components/AcademyQuiz'

export function AcademyPage() {
  const [selectedModuleId, setSelectedModuleId] = useState(1)
  const {
    isLoading,
    isSaving,
    error,
    completedCount,
    isModuleUnlocked,
    isModuleCompleted,
    isQuizPassed,
    isStepCompleted,
    toggleStep,
    submitQuiz,
  } = useAcademyProgress()

  const selectedModule = useMemo(
    () => ACADEMY_MODULES.find((m) => m.id === selectedModuleId) ?? ACADEMY_MODULES[0],
    [selectedModuleId]
  )

  const isSelectedLocked = !isModuleUnlocked(selectedModule.id)

  const handleQuizSubmit = async (answers: number[]) => {
    const result = await submitQuiz(selectedModule, answers)
    if (result.allCorrect) {
      const nextModuleId = selectedModule.id + 1
      if (nextModuleId <= ACADEMY_TOTAL_MODULES && isModuleUnlocked(nextModuleId)) {
        setSelectedModuleId(nextModuleId)
      }
    }
    return result
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Formación O2C</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Academia O2C</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Ruta formativa de 8 módulos con desbloqueo progresivo, quiz obligatorio y progreso persistente por usuario.
        </p>
      </header>

      <SectionCard>
        <SectionCardHeader
          title="Progreso en la ruta"
          subtitle={`${ACADEMY_TOTAL_MODULES} módulos · desbloqueo y quiz por etapa.`}
        />
        <SectionCardBody>
          <AcademyProgressBar completed={completedCount} total={ACADEMY_TOTAL_MODULES} />
        </SectionCardBody>
      </SectionCard>

      {error && (
        <SectionCard className="border-destructive/35">
          <SectionCardBody className="text-sm text-destructive">
            Error al cargar/guardar progreso de academia: {error}
          </SectionCardBody>
        </SectionCard>
      )}

      {isLoading ? (
        <SectionCard>
          <SectionCardBody className="text-sm text-muted-foreground">
            Cargando progreso de la academia…
          </SectionCardBody>
        </SectionCard>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-3">
            {ACADEMY_MODULES.map((module) => (
              <AcademyModuleCard
                key={module.id}
                module={module}
                selected={module.id === selectedModule.id}
                unlocked={isModuleUnlocked(module.id)}
                completed={isModuleCompleted(module.id)}
                onSelect={setSelectedModuleId}
              />
            ))}
          </aside>

          <div className="space-y-6">
            <AcademyModuleDetail
              module={selectedModule}
              isLocked={isSelectedLocked}
              isSaving={isSaving}
              isStepCompleted={isStepCompleted}
              onToggleStep={(moduleId, stepIndex) => {
                void toggleStep(moduleId, stepIndex)
              }}
            />
            <AcademyQuiz
              module={selectedModule}
              isLocked={isSelectedLocked}
              isPassed={isQuizPassed(selectedModule.id)}
              isSaving={isSaving}
              onSubmitQuiz={(_module, answers) => handleQuizSubmit(answers)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
