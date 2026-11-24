import { FilterMultiSelect } from '@/features/ai-support/components/FilterMultiSelect'

type Option = { value: string; label: string }

type InitiativeLike = { id: string; key_result_id: string }

export function OkrScopeSelectors({
  keyResults,
  initiatives,
  selectedKrIds,
  selectedInitiativeIds,
  onKrChange,
  onInitiativeChange,
  initiativeEmptyLabel = 'Iniciativas',
}: {
  keyResults: Option[]
  initiatives: Array<Option & InitiativeLike>
  selectedKrIds: string[]
  selectedInitiativeIds: string[]
  onKrChange: (ids: string[]) => void
  onInitiativeChange: (ids: string[]) => void
  initiativeEmptyLabel?: string
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <FilterMultiSelect
        label="KRs"
        emptyLabel="Todos los KR"
        className="h-8 rounded-xl"
        values={selectedKrIds}
        onChange={(ids) => {
          onKrChange(ids)
          onInitiativeChange(
            selectedInitiativeIds.filter((id) => {
              const initiative = initiatives.find((item) => item.id === id)
              return Boolean(initiative && (ids.length === 0 || ids.includes(initiative.key_result_id)))
            })
          )
        }}
        options={keyResults}
      />
      <FilterMultiSelect
        label="Iniciativas"
        emptyLabel={initiatives.length > 0 ? initiativeEmptyLabel : 'Sin iniciativas'}
        className="h-8 rounded-xl"
        values={selectedInitiativeIds}
        onChange={onInitiativeChange}
        disabled={initiatives.length === 0}
        options={initiatives.map(({ value, label }) => ({ value, label }))}
      />
    </div>
  )
}
