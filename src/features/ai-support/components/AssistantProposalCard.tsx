import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Loader2, Pencil } from 'lucide-react'
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
import type { CopilotProposal } from '@/features/ai-support/copilot/types'
import { isGoogleWriteTool } from '@/features/ai-support/copilot/googleWorkspace'
import {
  cancelAssistantOp,
  confirmAssistantOp,
  editAssistantOp,
} from '@/features/ai-support/services/assistantOpsClient'

type ProposalStatus = 'pending' | 'confirmed' | 'cancelled' | 'error'

type AssistantProposalCardProps = {
  proposal: CopilotProposal
  compact?: boolean
  status?: ProposalStatus
  onResolved?: (status: 'confirmed' | 'cancelled', href?: string) => void
  onUpdated?: (proposal: CopilotProposal) => void
}

export function AssistantProposalCard({
  proposal: initial,
  compact = false,
  status: statusProp,
  onResolved,
  onUpdated,
}: AssistantProposalCardProps) {
  const [proposal, setProposal] = useState(initial)
  const [status, setStatus] = useState<ProposalStatus>(statusProp ?? 'pending')
  const [busy, setBusy] = useState<'confirm' | 'cancel' | 'edit' | null>(null)
  const [resultHref, setResultHref] = useState(proposal.record?.href)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const workspace = proposal.workspace
  const googleWrite = isGoogleWriteTool(proposal.tool)
  const canEdit = googleWrite && status === 'pending'

  const confirm = async () => {
    setBusy('confirm')
    setError(null)
    try {
      const result = await confirmAssistantOp(proposal.id)
      setStatus('confirmed')
      const href = result.result?.href || proposal.record?.href
      setResultHref(href)
      onResolved?.('confirmed', href)
      toast.success(googleWrite ? 'Listo en Google Workspace.' : 'Operacion ejecutada.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo confirmar.'
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
      await cancelAssistantOp(proposal.id)
      setStatus('cancelled')
      onResolved?.('cancelled')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cancelar.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className={cn(
        'mt-3 space-y-2.5 rounded-2xl bg-muted/30 px-3 py-2.5 ring-1 ring-border/50',
        compact && 'px-2.5 py-2'
      )}
      aria-label={proposal.title}
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-primary">
          {proposal.title}
        </p>
        <p className={cn('mt-0.5 text-foreground', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
          {proposal.summary}
        </p>
      </div>
      {workspace?.kind === 'email' ? (
        <dl className="space-y-1 text-[12px] leading-5">
          {workspace.from ? (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">De</dt>
              <dd>{workspace.from}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">Para</dt>
            <dd>{(workspace.to ?? []).join(', ') || '—'}</dd>
          </div>
          {workspace.cc?.length ? (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">CC</dt>
              <dd>{workspace.cc.join(', ')}</dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">Asunto</dt>
            <dd>{workspace.subject || '—'}</dd>
          </div>
          {workspace.body ? (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Cuerpo</dt>
              <dd className="whitespace-pre-wrap">{workspace.body}</dd>
            </div>
          ) : null}
        </dl>
      ) : workspace?.kind === 'event' ? (
        <dl className="space-y-1 text-[12px] leading-5">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-muted-foreground">Titulo</dt>
            <dd>{workspace.title || '—'}</dd>
          </div>
          {workspace.start ? (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Inicio</dt>
              <dd>{workspace.start.replace('T', ' ')} (CDMX)</dd>
            </div>
          ) : null}
          {workspace.end ? (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Fin</dt>
              <dd>{workspace.end.replace('T', ' ')} (CDMX)</dd>
            </div>
          ) : null}
          {workspace.attendees?.length ? (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">Participantes</dt>
              <dd>{workspace.attendees.join(', ')}</dd>
            </div>
          ) : null}
        </dl>
      ) : proposal.fields.length > 0 ? (
        <dl className="space-y-1">
          {proposal.fields.map((field) => (
            <div key={`${field.label}-${field.to}`} className="flex gap-2 text-[12px] leading-5">
              <dt className="w-24 shrink-0 text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 text-foreground">
                {field.from ? (
                  <>
                    <span className="text-muted-foreground line-through">{field.from}</span>
                    {' → '}
                  </>
                ) : null}
                {field.to}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      {status === 'confirmed' ? (
        <p className="text-[12px] text-foreground">
          Ejecutado.
          {resultHref ? (
            <>
              {' '}
              {resultHref.startsWith('http') ? (
                <a
                  href={resultHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                >
                  Abrir
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </a>
              ) : (
                <Link
                  to={resultHref}
                  className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                >
                  Abrir registro
                  <ArrowUpRight className="h-3 w-3" aria-hidden />
                </Link>
              )}
            </>
          ) : null}
        </p>
      ) : status === 'cancelled' ? (
        <p className="text-[12px] text-muted-foreground">Operacion cancelada.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-full px-3"
            disabled={busy !== null}
            onClick={() => void confirm()}
          >
            {busy === 'confirm' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Confirmar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3"
            disabled={busy !== null}
            onClick={() => void cancel()}
          >
            {busy === 'cancel' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Cancelar
          </Button>
          {canEdit ? (
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
        </div>
      )}

      <EditWorkspaceDialog
        open={editOpen}
        proposal={proposal}
        busy={busy === 'edit'}
        onOpenChange={setEditOpen}
        onSave={async (patch) => {
          setBusy('edit')
          try {
            const next = await editAssistantOp(proposal.id, patch)
            setProposal(next)
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
  onSave: (patch: { subject?: string; body?: string; title?: string; start?: string; end?: string }) => Promise<void>
}) {
  const workspace = proposal.workspace
  const isEmail = workspace?.kind === 'email' || proposal.tool.startsWith('gmail_')
  const [subject, setSubject] = useState(workspace?.subject ?? '')
  const [body, setBody] = useState(workspace?.body ?? '')
  const [title, setTitle] = useState(workspace?.title ?? '')
  const [start, setStart] = useState(workspace?.start ?? '')
  const [end, setEnd] = useState(workspace?.end ?? '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92dvh,40rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEmail ? 'Editar correo' : 'Editar evento'}</DialogTitle>
          <DialogDescription>
            Los cambios actualizan el borrador. Debes volver a confirmar antes de enviarlo.
          </DialogDescription>
        </DialogHeader>
        {isEmail ? (
          <div className="space-y-3">
            <label className="space-y-1 text-xs font-medium">
              Asunto
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Cuerpo
              <textarea
                className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={body}
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
                isEmail ? { subject, body } : { title, start, end }
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
