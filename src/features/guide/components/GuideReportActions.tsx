import { useState } from 'react'
import { Download, Loader2, MessageCircle, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { downloadGuideReportPdf } from '@/features/guide/guideReportPdf'
import type { GuideReportSource } from '@/features/guide/guideReportPresentation'

type ShareResult = {
  ok: boolean
  code: string
  preview: string
  phone: string | null
  sent: boolean
}

const SHARE_COPY: Record<string, string> = {
  no_recipient: 'Este perfil no tiene un WhatsApp activo.',
  window_closed: 'WhatsApp solo acepta este mensaje si la persona escribio en las ultimas 24 horas.',
  not_configured: 'WhatsApp no esta configurado en el servidor.',
  provider_failed: 'WhatsApp no confirmo el envio. Puedes reintentar.',
  sent: 'Mensaje enviado. La entrega la confirma WhatsApp despues.',
}

export function GuideReportActions({
  topic,
  dateLabel,
  executiveReport,
  summary,
  learning,
  intention,
  createdAt,
  entryId,
  sessionId,
  onShare,
}: {
  topic?: string | null
  /** Solo para WhatsApp/UI; el PDF usa createdAt en zona CDMX. */
  dateLabel: string
  executiveReport?: string | null
  summary?: string | null
  learning?: string | null
  intention?: string | null
  createdAt?: string | null
  entryId?: string | null
  sessionId?: string | null
  onShare: (confirm: boolean) => Promise<ShareResult>
}) {
  const [preview, setPreview] = useState<ShareResult | null>(null)
  const [sharing, setSharing] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)

  const savePdf = () => {
    setSavingPdf(true)
    try {
      const source: GuideReportSource = {
        id: entryId,
        session_id: sessionId,
        topic,
        created_at: createdAt,
        executive_report: executiveReport,
        summary,
        learning,
        intention,
      }
      const result = downloadGuideReportPdf(source)
      if (result.warnings.length) {
        toast.message('PDF generado con notas de alcance', {
          description: result.warnings[0],
        })
      } else {
        toast.success('PDF listo para guardar.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el PDF.')
    } finally {
      setSavingPdf(false)
    }
  }

  const openPreview = async () => {
    setSharing(true)
    try {
      const result = await onShare(false)
      if (!result.ok && result.code !== 'preview') {
        toast.error(SHARE_COPY[result.code] || 'No se pudo preparar el mensaje.')
        return
      }
      if (!result.preview.trim()) {
        toast.error('No hay contenido suficiente para WhatsApp.')
        return
      }
      setPreview(result)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo preparar el mensaje.')
    } finally {
      setSharing(false)
    }
  }

  const confirmSend = async () => {
    setSharing(true)
    try {
      const result = await onShare(true)
      const sent = result.sent || result.code === 'sent'
      if (!sent) {
        toast.error(SHARE_COPY[result.code] || 'WhatsApp no confirmo el envio.')
        return
      }
      toast.success(SHARE_COPY.sent)
      setPreview(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={savePdf}
          disabled={savingPdf}
          className={cn(
            'group flex min-h-11 items-start gap-3 rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 text-left transition',
            'hover:border-primary/30 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-border/60">
            {savingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight text-foreground">
              Guardar PDF
            </span>
            <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
              Informe ejecutivo del historial, listo para direccion.
            </span>
          </span>
        </button>

        <button
          type="button"
          disabled={sharing}
          onClick={() => void openPreview()}
          className={cn(
            'group flex min-h-11 items-start gap-3 rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 text-left transition',
            'hover:border-primary/30 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        >
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
            {sharing && !preview ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <MessageCircle className="h-4 w-4" aria-hidden />
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight text-foreground">
              Enviar por WhatsApp
            </span>
            <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
              Resumen corto al numero vinculado del perfil.
            </span>
          </span>
        </button>
      </div>

      {preview ? (
        <div className="space-y-3 rounded-2xl border border-border/60 bg-background/90 px-4 py-3.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                Vista previa del mensaje
              </p>
              <p className="text-xs text-muted-foreground">
                {preview.phone
                  ? `Se enviara al WhatsApp ${preview.phone}`
                  : 'Revisa el texto antes de confirmar'}
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              Resumen corto
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-xl bg-muted/40 px-3.5 py-3">
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.preview}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-11 gap-2 rounded-full px-4"
              disabled={sharing}
              onClick={() => void confirmSend()}
            >
              {sharing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
              Confirmar envio
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 rounded-full"
              disabled={sharing}
              onClick={() => setPreview(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {/* dateLabel retained for callers that still surface it nearby */}
      <span className="sr-only">{dateLabel}</span>
    </div>
  )
}
