import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ChevronDown, Loader2, Mail, MessageCircle, Pencil, CalendarDays, LayoutGrid } from 'lucide-react'
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
  pendingFailureStatus,
  proposalStageLabel,
  toActionCardView,
  type ActionLifecycleStatus,
} from '@/features/ai-support/copilot/actionLifecycle'
import { friendlyAssistantError } from '@/features/ai-support/assistantErrors'
import { StatusPill } from '@/features/ai-support/components/ui'
import {
  cancelAssistantOp,
  confirmAssistantOp,
  editAssistantOp,
  searchWhatsappRecipients,
} from '@/features/ai-support/services/assistantOpsClient'

type ProposalStatus = 'pending' | 'confirmed' | 'cancelled' | 'error' | 'expired' | 'conflict'

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

const KIND_ICON = {
  whatsapp: MessageCircle,
  email: Mail,
  event: CalendarDays,
  board: LayoutGrid,
} as const

function PreviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-[12px] leading-5">
      <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-foreground">{children}</dd>
    </div>
  )
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
  const stageLabel = proposalStageLabel({
    lifecycle: view.status,
    kind: view.kind,
    approving: busy === 'confirm',
  })
  const typeLabel = actionTypeLabel(view.tool, view.kind)
  const KindIcon = KIND_ICON[view.kind]
  const needsInfo =
    Boolean(view.whatsappPreview?.needsInfo) ||
    Boolean(proposal.workspace?.needsInfo) ||
    Boolean(proposal.workspace?.incomplete) ||
    (view.kind === 'email' && !(proposal.workspace?.to && proposal.workspace.to.length > 0))
  const approveLabel =
    dailySummary ? 'Aprobar cambio' : view.kind === 'board' ? 'Aprobar y ejecutar' : needsInfo ? 'Completar informacion' : 'Aprobar y enviar'
  const terminal = status === 'expired' || status === 'conflict'

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
        whatsappWrite
          ? 'Listo, WhatsApp enviado.'
          : boardNotifyEmail
            ? 'Listo, correo enviado.'
            : googleWrite
              ? 'Listo en Google Workspace.'
              : dailySummary
                ? 'Resumen diario actualizado.'
                : view.kind === 'board'
                  ? 'Accion creada en el tablero.'
                : 'Operacion ejecutada.'
      )
    } catch (err) {
      const failure = pendingFailureStatus(err)
      const message =
        failure === 'expired'
          ? 'La autorización venció. Pide una nueva propuesta.'
          : failure === 'conflict'
            ? 'El registro cambió después de la vista previa. Pide una nueva propuesta.'
            : friendlyAssistantError(err)
      setError(message)
      setStatus(failure)
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
        'relative mt-2 overflow-hidden rounded-2xl bg-card ring-1 ring-border/70',
        'shadow-[0_12px_28px_-24px_hsl(var(--foreground)/0.5)]',
        compact ? 'py-2.5 pl-4 pr-3' : 'py-3 pl-5 pr-4'
      )}
      aria-label={proposal.title}
      data-action-status={view.status}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', tone.rail)} aria-hidden />
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <KindIcon className="h-3.5 w-3.5" aria-hidden />
            {typeLabel}
          </span>
          <StatusPill tone={tone.tone} pulse={view.status === 'executing'}>
            {stageLabel}
          </StatusPill>
        </div>
        <div>
          {proposal.title.trim().toLowerCase() !== typeLabel.toLowerCase() ? (
            <p className={cn('font-semibold text-foreground', compact ? 'text-[13px] leading-5' : 'text-sm leading-5')}>
              {proposal.title}
            </p>
          ) : null}
          {proposal.summary ? (
            <p className={cn('mt-0.5 text-foreground/85', compact ? 'text-[12px] leading-5' : 'text-[13px] leading-5')}>
              {proposal.summary}
            </p>
          ) : null}
        </div>

        {view.kind === 'whatsapp' && view.whatsappPreview ? (
          <div className="space-y-2 border-t border-border/60 pt-2.5">
            <dl>
              <PreviewRow label="Canal">WhatsApp</PreviewRow>
              <PreviewRow label="Para">
                <span className="font-medium">
                  {view.whatsappPreview.recipientName || '—'}
                  {view.whatsappPreview.phone ? ` · ${view.whatsappPreview.phone}` : ''}
                </span>
              </PreviewRow>
            </dl>
            {view.whatsappPreview.body ? (
              <div className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-success px-3 py-2 text-[12px] leading-5 text-success-foreground">
                {view.whatsappPreview.body}
              </div>
            ) : null}
          </div>
        ) : view.kind === 'email' && view.emailPreview ? (
          <dl className="space-y-0.5 border-t border-border/60 pt-2.5">
            <PreviewRow label="Canal">Correo</PreviewRow>
            {view.emailPreview.from ? <PreviewRow label="De">{view.emailPreview.from}</PreviewRow> : null}
            <PreviewRow label="Para">{view.emailPreview.to.join(', ') || '—'}</PreviewRow>
            {view.emailPreview.cc?.length ? <PreviewRow label="CC">{view.emailPreview.cc.join(', ')}</PreviewRow> : null}
            <PreviewRow label="Asunto">
              <span className="font-medium">{view.emailPreview.subject || '—'}</span>
            </PreviewRow>
            {view.emailPreview.body ? (
              <PreviewRow label="Mensaje">
                <span className="block max-h-40 overflow-y-auto whitespace-pre-wrap">{view.emailPreview.body}</span>
              </PreviewRow>
            ) : null}
          </dl>
        ) : view.kind === 'event' && view.eventPreview ? (
          <dl className="space-y-0.5 border-t border-border/60 pt-2.5">
            <PreviewRow label="Titulo">{view.eventPreview.title || '—'}</PreviewRow>
            {view.eventPreview.start ? (
              <PreviewRow label="Inicio">{view.eventPreview.start.replace('T', ' ')} (CDMX)</PreviewRow>
            ) : null}
            {view.eventPreview.end ? (
              <PreviewRow label="Fin">{view.eventPreview.end.replace('T', ' ')} (CDMX)</PreviewRow>
            ) : null}
            {view.eventPreview.attendees?.length ? (
              <PreviewRow label="Participantes">{view.eventPreview.attendees.join(', ')}</PreviewRow>
            ) : null}
          </dl>
        ) : proposal.fields.length > 0 ? (
          <dl className="space-y-0.5 border-t border-border/60 pt-2.5">
            {proposal.fields.map((field) => (
              <PreviewRow key={`${field.label}-${field.to}`} label={field.label}>
                {field.from ? (
                  <>
                    <span className="text-muted-foreground line-through">{field.from}</span>
                    {' → '}
                  </>
                ) : null}
                {field.to}
              </PreviewRow>
            ))}
          </dl>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-destructive/[0.06] px-2.5 py-1.5 text-[12px] text-foreground ring-1 ring-destructive/20">
            {error}
          </p>
        ) : null}

        {status === 'confirmed' ? (
          <p className="text-[12px] text-foreground/85">
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
                    className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
                  >
                    Abrir
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <Link
                    to={resultHref}
                    className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline"
                  >
                    Abrir registro
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </Link>
                )}
              </>
            ) : null}
          </p>
        ) : status === 'cancelled' ? (
          <p className="text-[12px] text-muted-foreground">Descartado.</p>
        ) : terminal ? (
          <p className="text-[12px] text-muted-foreground">Esta propuesta ya no se puede aprobar.</p>
        ) : readOnly ? (
          <p className="text-[12px] text-muted-foreground">
            Pendiente de revision. Inicia sesion como el dueno para editar, aprobar o descartar.
          </p>
        ) : (
          <div className="space-y-2">
            {needsInfo ? (
              <p className="text-[11px] text-warning">
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
            toast.error(friendlyAssistantError(err))
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
