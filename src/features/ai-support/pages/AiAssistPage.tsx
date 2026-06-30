import { useMemo, useState } from 'react'
import { Bot, Loader2, Send, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { assistantModes, type AssistantModeId } from '@/lib/assistantModes'
import type { AiChatMessage } from '@/features/ai-support/types'

const MAX_MESSAGES = 24

async function sendMessage({
  mode,
  messages,
}: {
  mode: AssistantModeId
  messages: AiChatMessage[]
}) {
  const response = await fetch('/api/gemini-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode,
      messages,
    }),
  })

  const data = (await response.json()) as { answer?: string; error?: string }

  if (!response.ok) {
    throw new Error(data?.error || 'No se pudo generar una respuesta.')
  }

  return data.answer || 'No pude generar una respuesta en este momento.'
}

export function AiAssistPage() {
  const [selectedMode, setSelectedMode] = useState<AssistantModeId | null>(null)
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const currentMode = useMemo(
    () => assistantModes.find((mode) => mode.id === selectedMode) ?? null,
    [selectedMode]
  )

  const visibleMessages = useMemo(() => {
    if (!currentMode) return messages
    return [{ role: 'assistant' as const, content: currentMode.welcome }, ...messages]
  }, [currentMode, messages])

  const selectMode = (mode: AssistantModeId) => {
    setSelectedMode(mode)
    setMessages([])
    setInput('')
  }

  const handleSuggestion = (suggestion: string) => {
    setInput(suggestion)
  }

  const clearChat = () => {
    setMessages([])
    setInput('')
  }

  const handleSend = async () => {
    const trimmed = input.trim()

    if (!selectedMode) {
      toast.warning('Selecciona un modo de asesoria antes de preguntar.')
      return
    }

    if (!trimmed || loading) return

    const nextMessages = [...messages, { role: 'user' as const, content: trimmed }].slice(
      -MAX_MESSAGES
    )

    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const answer = await sendMessage({
        mode: selectedMode,
        messages: nextMessages,
      })

      setMessages([...nextMessages, { role: 'assistant' as const, content: answer }].slice(-MAX_MESSAGES))
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'No pude conectar con el asistente. Intenta nuevamente.'
      toast.error(message)
      setMessages([
        ...nextMessages,
        {
          role: 'assistant' as const,
          content:
            'No pude procesar tu solicitud en este momento. Revisa la configuracion o intenta nuevamente en unos minutos.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl space-y-6 pb-12">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="h-7 w-7 text-primary" aria-hidden />
          <h2 className="text-2xl font-bold tracking-tight">Asistente IA</h2>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Haz preguntas dentro del alcance seleccionado y recibe recomendaciones practicas para
          mejorar la ejecucion, operacion y toma de decisiones.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="assistant-mode-title">
        <div>
          <h3 id="assistant-mode-title" className="text-sm font-semibold text-foreground">
            Selecciona el alcance
          </h3>
          <p className="text-sm text-muted-foreground">
            Al cambiar de modo se limpia el historial para evitar mezclar contextos.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {assistantModes.map((mode) => {
            const active = selectedMode === mode.id

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => selectMode(mode.id)}
                className={cn(
                  'rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  active && 'border-primary bg-primary/5 ring-1 ring-primary/30'
                )}
                aria-pressed={active}
              >
                <span className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-muted/40 text-muted-foreground'
                    )}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {mode.title}
                    </span>
                    <span className="block text-sm leading-6 text-muted-foreground">
                      {mode.description}
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Este asistente responde unicamente dentro del alcance seleccionado. Para obtener mejores
          resultados, describe tu proceso, problema, area, objetivo y restricciones.
        </p>
      </section>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div
            className="min-h-[280px] max-h-[480px] space-y-3 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 p-4"
            aria-live="polite"
          >
            {!currentMode ? (
              <div className="flex min-h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
                Selecciona un modo para iniciar la conversacion.
              </div>
            ) : (
              visibleMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    'max-w-[92%] rounded-lg border px-3 py-2 text-sm leading-6 whitespace-pre-wrap',
                    message.role === 'user'
                      ? 'ml-auto border-primary/20 bg-primary/10 text-foreground'
                      : 'mr-auto border-border/70 bg-card text-foreground'
                  )}
                >
                  {message.content}
                </div>
              ))
            )}

            {loading && (
              <div className="mr-auto flex max-w-[92%] items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Analizando...
              </div>
            )}
          </div>

          {currentMode && (
            <div className="flex flex-wrap gap-2">
              {currentMode.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestion(suggestion)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={loading}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ai-assistant-input">Tu pregunta</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                id="ai-assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  selectedMode
                    ? 'Describe el proceso, problema, objetivo y restricciones...'
                    : 'Primero selecciona un modo de asesoria.'
                }
                className="min-h-[88px] flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={loading || !selectedMode}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />
              <div className="flex gap-2 sm:flex-col">
                <Button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={loading || !selectedMode || !input.trim()}
                  className="gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-4 w-4" aria-hidden />
                  )}
                  Enviar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearChat}
                  disabled={loading || messages.length === 0}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Limpiar
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
