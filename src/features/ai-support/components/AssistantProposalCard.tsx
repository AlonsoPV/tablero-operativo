import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { NamedPerson } from '@/features/ai-support/copilot/matching'
import type { CopilotProposal } from '@/features/ai-support/copilot/types'
import { isGoogleWriteTool } from '@/features/ai-support/copilot/googleWorkspace'
import { sanitizeRecipientFacingText } from '@/features/ai-support/copilot/pendingOpTaxonomy'
import {
  actionLifecycleTone,
  actionTypeLabel,
  proposalExecutionBadge,
  toActionCardView,
  type ActionLifecycleStatus,
} from '@/features/ai-support/copilot/actionLifecycle'
import {
  cancelAssistantOp,
  confirmAssistantOp,
  editAssistantOp,
  searchWhatsappRecipients,
} from '@/features/ai-support/services/assistantOpsClient'
import { friendlyAssistantError } from '@/features/ai-support/assistantErrors'
import { toneSoftClass } from '@/features/ai-support/components/ui/tones'

type ProposalStatus = 'pending' | 'confirmed' | 'cancelled' | 'error'

type AssistantProposalCardProps = {
  proposal: CopilotProposal
  compact?: boolean
  status?: ProposalStatus
  /** Solo lectura: oculta confirmar/editar/cancelar. */
  readOnly?: boolean
  /** Si se pasa, no usa JWT/assistant-ops (p. ej. liga de voz). */
  confirmOp?: (opId: string) => Promise<{ result?: { href?: string } | null }>
  cancelOp?: (opId: string) => Promise<void>
  /** Oculta editar aunque no sea readOnly (liga sin login). */
  disableEdit?: boolean
  onResolved?: (status: 'confirmed' | 'cancelled', href?: string) => void
  onUpdated?: (proposal: CopilotProposal) => void
}

export function AssistantProposalCard({
  proposal: initial,
  compact = false,
  status: statusProp,
  readOnly = false,
  confirmOp,
  cancelOp,
  disableEdit = false,
  onResolved,
  onUpdated,
}: AssistantProposalCardProps) {
  const [proposal, setProposal] = useState(initial)
  const [status, setStatus] = useState<ProposalStatus>(statusProp ?? 'pending')
  const [busy, setBusy] = useState<'confirm' | 'cancel' | 'edit' | null>(null)
  const [resultHref, setResultHref] = useState(proposal.record?.href)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const googleWrite = isGoogleWriteTool(proposal.tool)
  const whatsappWrite = proposal.tool === 'whatsapp_prepare_send'
  const dailySummary = proposal.tool === 'update_daily_action_summary'
  const boardNotifyEmail = proposal.tool === 'notify_action_email'
  const canEdit = !disableEdit && (googleWrite || whatsappWrite || boardNotifyEmail) && status === 'pending'
  const view = toActionCardView(proposal, {
    status: busy === 'confirm' || busy === 'cancel' ? 'executing' : status,
    busy,
    errorMessage: error,
    resultHref,
  })
  const tone = actionLifecycleTone(view.status)
  const typeLabel = actionTypeLabel(view.tool, view.kind)
  const needsInfo =
    Boolean(view.whatsappPreview?.needsInfo) ||
    Boolean(proposal.workspace?.needsInfo) ||
    Boolean(proposal.workspace?.incomplete) ||
    (view.kind === 'email' && !(proposal.workspace?.to && proposal.workspace.to.length > 0))
  const simulated = proposal.simulated === true
  const executionBadge = proposalExecutionBadge(view.status, simulated)
  const approveLabel =
    dailySummary
      ? 'Aprobar cambio'
      : simulated && view.kind === 'board'
        ? 'Aprobar (simulación)'
        : view.kind === 'board'
          ? 'Aprobar y ejecutar'
          : needsInfo
            ? 'Completar informacion'
            : 'Aprobar y enviar'

  const confirm = async () => {
    setBusy('confirm')
    setError(null)
    try {
      const result = confirmOp
        ? await confirmOp(proposal.id)
        : await confirmAssistantOp(proposal.id)
      setStatus('confirmed')
      const href = result.result?.href || proposal.record?.href
      setResultHref(href)
      onResolved?.('confirmed', href)
      toast.success(
        simulated
          ? 'Simulación ejecutada. No se escribió en QA ni PROD.'
          : whatsappWrite
            ? 'WhatsApp aceptado por el proveedor.'
            : boardNotifyEmail
              ? 'Correo aceptado por el proveedor.'
              : googleWrite
                ? 'Listo en Google Workspace.'
                : dailySummary
                  ? 'Resumen diario actualizado.'
                  : view.kind === 'board'
                    ? 'Accion creada en el tablero.'
                    : 'Operacion ejecutada.'
      )
    } catch (err) {
      const message = friendlyAssistantError(err)
      setError(message)
      setStatus('error')
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const cancel = async () => {
    setBusy('cancel')
    setError(null)
    try {
      if (cancelOp) await cancelOp(proposal.id)
      else await cancelAssistantOp(proposal.id)
      setStatus('cancelled')
      onResolved?.('cancelled')
    } catch (err) {
      const message = friendlyAssistantError(err)
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className={cn(
        'relative mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
      )}
      aria-label={proposal.title}
      data-action-status={view.status}
    >
      <div className={cn('absolute inset-y-0 left-0 w-1.5', tone.rail)} aria-hidden />
      <div className="space-y-2.5 pl-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ring-1',
              toneSoftClass[tone.tone]
            )}
          >
            {view.statusLabel}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">{typeLabel}</span>
          {executionBadge ? (
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ring-1',
                executionBadge === 'Simulado' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200'
              )}
            >
              {executionBadge}
            </span>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-700">{proposal.title}</p>
          <p className={cn('mt-0.5 text-slate-900', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
            {proposal.summary}
          </p>
        </div>

        {view.kind === 'whatsapp' && view.whatsappPreview ? (
          <div className="space-y-2 rounded-xl border border-emerald-200/70 bg-emerald-50/80 p-2.5 text-[12px] leading-5">
            <div className="flex gap-2">
              <span className="w-24 shrink-0 text-emerald-800/70">Para</span>
              <span className="font-medium text-emerald-950">
                {view.whatsappPreview.recipientName || '—'}
                {view.whatsappPreview.phone ? ` · ${view.whatsappPreview.phone}` : ''}
              </span>
            </div>
            {view.whatsappPreview.needsInfo ? (
              <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-amber-900">
                Completar informacion
                {view.whatsappPreview.needsInfoReason
                  ? `: ${view.whatsappPreview.needsInfoReason}`
                  : '.'}
              </p>
            ) : null}
            {view.whatsappPreview.body ? (
              <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-emerald-600 px-3 py-2 text-white whitespace-pre-wrap">
                {view.whatsappPreview.body}
              </div>
            ) : null}
          </div>
        ) : view.kind === 'email' && view.emailPreview ? (
          <dl className="space-y-1 rounded-xl border border-blue-200/70 bg-blue-50/70 p-2.5 text-[12px] leading-5">
            {view.emailPreview.from ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">De</dt>
                <dd>{view.emailPreview.from}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Para</dt>
              <dd>{view.emailPreview.to.join(', ') || '—'}</dd>
            </div>
            {view.emailPreview.cc?.length ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">CC</dt>
                <dd>{view.emailPreview.cc.join(', ')}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Asunto</dt>
              <dd className="font-medium">{view.emailPreview.subject || '—'}</dd>
            </div>
            {view.emailPreview.body ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Cuerpo</dt>
                <dd className="max-h-40 overflow-y-auto whitespace-pre-wrap">{view.emailPreview.body}</dd>
              </div>
            ) : null}
          </dl>
        ) : view.kind === 'event' && view.eventPreview ? (
          <dl className="space-y-1 rounded-xl border border-white/70 bg-white/90 p-2.5 text-[12px] leading-5">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-slate-500">Titulo</dt>
              <dd>{view.eventPreview.title || '—'}</dd>
            </div>
            {view.eventPreview.start ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Inicio</dt>
                <dd>{view.eventPreview.start.replace('T', ' ')} (CDMX)</dd>
              </div>
            ) : null}
            {view.eventPreview.end ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Fin</dt>
                <dd>{view.eventPreview.end.replace('T', ' ')} (CDMX)</dd>
              </div>
            ) : null}
            {view.eventPreview.attendees?.length ? (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-slate-500">Participantes</dt>
                <dd>{view.eventPreview.attendees.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        ) : proposal.fields.length > 0 ? (
          <dl className="space-y-1 rounded-xl border border-white/70 bg-white/90 p-2.5">
            {proposal.fields.map((field) => (
              <div key={`${field.label}-${field.to}`} className="flex gap-2 text-[12px] leading-5">
                <dt className="w-24 shrink-0 text-slate-500">{field.label}</dt>
                <dd className="min-w-0 text-slate-900">
                  {field.from ? (
                    <>
                      <span className="text-slate-400 line-through">{field.from}</span>
                      {' → '}
                    </>
                  ) : null}
                  {field.to}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {error ? <p className="text-[11px] text-red-700">{error}</p> : null}

        {status === 'confirmed' ? (
          <p className="text-[12px] text-slate-800">
            {whatsappWrite
              ? 'Aceptado por el proveedor (no implica entrega al destinatario).'
              : 'Completado.'}
            {resultHref ? (
              <>
                {' '}
                {resultHref.startsWith('http') ? (
                  <a
                    href={resultHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-medium text-[#2563EB] hover:underline"
                  >
                    Abrir
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <Link
                    to={resultHref}
                    className="inline-flex items-center gap-0.5 font-medium text-[#2563EB] hover:underline"
                  >
                    Abrir registro
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </>
            ) : null}
          </p>
        ) : status === 'cancelled' ? (
          <p className="text-[12px] text-slate-500">Descartado.</p>
        ) : readOnly ? (
          <p className="text-[12px] text-slate-500">
            Pendiente de revision. Inicia sesion como el dueno para editar, aprobar o descartar.
          </p>
        ) : (
          <div className="space-y-2">
            {needsInfo ? (
              <p className="text-[11px] text-amber-800">
                Faltan datos indispensables.
                {view.whatsappPreview?.needsInfoReason
                  ? ` ${view.whatsappPreview.needsInfoReason}`
                  : proposal.workspace?.needsInfoReason
                    ? ` ${proposal.workspace.needsInfoReason}`
                    : ' Completa la informacion antes de aprobar.'}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {needsInfo && canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3"
                  disabled={busy !== null}
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Completar informacion
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3"
                  disabled={busy !== null || needsInfo}
                  onClick={() => void confirm()}
                >
                  {busy === 'confirm' ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : null}
                  {approveLabel}
                </Button>
              )}
              {canEdit && !needsInfo ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full px-3"
                  disabled={busy !== null}
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
                  Editar
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-full px-3"
                disabled={busy !== null}
                onClick={() => void cancel()}
              >
                {busy === 'cancel' ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : null}
                Descartar
              </Button>
            </div>
          </div>
        )}
      </div>

      <EditWorkspaceDialog
        key={`${proposal.id}:${editOpen}`}
        open={editOpen}
        proposal={proposal}
        busy={busy === 'edit'}
        onOpenChange={setEditOpen}
        onSave={async (patch) => {
          setBusy('edit')
          try {
            const next = await editAssistantOp(proposal.id, patch)
            setProposal(next)
            setStatus('pending')
            onUpdated?.(next)
            setEditOpen(false)
            toast.success('Borrador actualizado. Confirma de nuevo para enviar.')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudo editar.')
          } finally {
            setBusy(null)
          }
        }}
      />
    </section>
  )
}

/** Alias canónico del plan de acciones. */
export const ActionCard = AssistantProposalCard

export type { ActionLifecycleStatus }

function WhatsappRecipientDropdown({
  name,
  disabled,
  onSelect,
}: {
  name?: string
  disabled: boolean
  onSelect: (person: NamedPerson) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ query: string; people?: NamedPerson[]; error?: string }>()
  const term = query.trim()
  useEffect(() => {
    if (!open || term.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void searchWhatsappRecipients(term, controller.signal).then(
        (people) => { if (!controller.signal.aborted) setSearch({ query: term, people }) },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setSearch({ query: term, error: error instanceof Error ? error.message : 'No se pudo buscar.' })
          }
        }
      )
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [open, term])

  const result = search?.query === term ? search : undefined
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">Destinatario</p>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="w-full justify-between"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{name || 'Seleccionar usuario con WhatsApp'}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
      </Button>
      {open ? (
        <div id={id} className="space-y-1 rounded-md border bg-popover p-2">
          <Input
            autoFocus
            aria-label="Buscar usuarios con WhatsApp"
            placeholder="Buscar por nombre"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="max-h-40 overflow-y-auto">
            {term.length < 2 ? (
              <p className="p-2 text-xs text-muted-foreground">Escribe al menos dos letras.</p>
            ) : result?.people?.length ? (
              <ul>
                {result.people.map((person) => (
                  <li key={person.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start text-left"
                      disabled={disabled}
                      onClick={() => { onSelect(person); setOpen(false) }}
                    >
                      <span className="truncate">{person.nombre}</span>
                      <span className="truncate text-xs text-muted-foreground">{[person.area, person.rol].filter(Boolean).join(' · ')}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="p-2 text-xs text-muted-foreground">
                {result?.error || (result ? 'No encontré usuarios con WhatsApp vinculado.' : 'Buscando…')}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function EditWorkspaceDialog({
  open,
  proposal,
  busy,
  onOpenChange,
  onSave,
}: {
  open: boolean
  proposal: CopilotProposal
  busy: boolean
  onOpenChange: (open: boolean) => void
  onSave: (patch: { recipientId?: string; subject?: string; body?: string; title?: string; start?: string; end?: string }) => Promise<void>
}) {
  const workspace = proposal.workspace
  const isWhatsapp = workspace?.kind === 'whatsapp' || proposal.tool === 'whatsapp_prepare_send'
  const isEmail = !isWhatsapp && (workspace?.kind === 'email' || proposal.tool.startsWith('gmail_'))
  const isBoardEmail = proposal.tool === 'notify_action_email'
  const [recipient, setRecipient] = useState<NamedPerson>()
  const [subject, setSubject] = useState(workspace?.subject ?? '')
  const [body, setBody] = useState(
    isBoardEmail
      ? workspace?.message ?? proposal.fields.find((field) => field.label === 'Mensaje')?.to ?? ''
      : isWhatsapp ? sanitizeRecipientFacingText(workspace?.body) : workspace?.body ?? ''
  )
  const [title, setTitle] = useState(workspace?.title ?? '')
  const [start, setStart] = useState(workspace?.start ?? '')
  const [end, setEnd] = useState(workspace?.end ?? '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,40rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isWhatsapp ? 'Editar WhatsApp' : isEmail ? 'Editar correo' : 'Editar evento'}
          </DialogTitle>
          <DialogDescription>
            Los cambios actualizan el borrador. Debes volver a confirmar antes de enviarlo.
          </DialogDescription>
        </DialogHeader>
        {isWhatsapp || isEmail ? (
          <div className="space-y-3">
            {isWhatsapp ? (
              <WhatsappRecipientDropdown
                name={recipient?.nombre || workspace?.recipientName}
                disabled={busy}
                onSelect={setRecipient}
              />
            ) : null}
            {isEmail ? (
              <label className="space-y-1 text-xs font-medium">
                Asunto
                <Input value={subject} readOnly={isBoardEmail} onChange={(event) => setSubject(event.target.value)} />
              </label>
            ) : null}
            <label className="space-y-1 text-xs font-medium">
              {isBoardEmail ? 'Mensaje para el responsable' : isWhatsapp ? 'Mensaje' : 'Cuerpo'}
              <textarea
                className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={body}
                maxLength={isBoardEmail ? 500 : undefined}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="space-y-1 text-xs font-medium">
              Titulo
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Inicio (YYYY-MM-DDTHH:MM, CDMX)
              <Input value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Fin (YYYY-MM-DDTHH:MM, CDMX)
              <Input value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void onSave(
                isWhatsapp
                  ? { body, recipientId: recipient?.id }
                  : isBoardEmail ? { body } : isEmail ? { subject, body } : { title, start, end }
              )
            }
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Guardar borrador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
