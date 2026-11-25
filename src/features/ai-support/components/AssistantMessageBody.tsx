import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { SectionEyebrow } from '@/features/ai-support/components/ui'

type AssistantContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

function normalizeAssistantLine(line: string) {
  return line
    .replace(/^\*\*(.+)\*\*:?\s*$/, '$1')
    .replace(/^#+\s+/, '')
    .replace(/\*\*/g, '')
    .trim()
}

/** Inline markdown seguro: negritas y enlaces http(s)/rutas internas. Sin HTML arbitrario. */
function renderInlineSafe(text: string): ReactNode {
  const parts: ReactNode[] = []
  const pattern = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\))/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    if (match[2]) {
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold text-foreground">
          {match[2]}
        </strong>
      )
    } else if (match[3] && match[4]) {
      const href = match[4]
      const isInternal = href.startsWith('/')
      parts.push(
        isInternal ? (
          <Link
            key={`a-${key++}`}
            to={href}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {match[3]}
          </Link>
        ) : (
          <a
            key={`a-${key++}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            {match[3]}
          </a>
        )
      )
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length ? parts : text
}

function isAssistantHeading(line: string) {
  const clean = normalizeAssistantLine(line)
  if (!clean || clean.length > 56) return false
  if (/^(diagn[oó]stico|situaci[oó]n|resumen|recomendaci[oó]nes?|pr[oó]ximos pasos|acciones?|riesgos?|prioridades?|hallazgos?|hallazgo|evidencia|hecho|siguiente accion|conclusi[oó]n|qu[eé] hacer|siguiente|okr|tablero)\b/i.test(clean)) {
    return true
  }
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][\wÁÉÍÓÚÜÑáéíóúüñ /-]{1,40}:$/.test(clean)
}

function parseAssistantContent(raw: string): AssistantContentBlock[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const blocks: AssistantContentBlock[] = []
  let paragraph: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    paragraph = []
    if (text) blocks.push({ type: 'paragraph', text })
  }
  const flushList = () => {
    if (listItems.length === 0) return
    blocks.push({ type: 'list', items: listItems })
    listItems = []
  }

  for (const original of lines) {
    const line = original.trim()
    if (!line) {
      flushList()
      flushParagraph()
      continue
    }

    const listMatch = line.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/)
    if (listMatch?.[1]) {
      flushParagraph()
      listItems.push(normalizeAssistantLine(listMatch[1]))
      continue
    }

    if (isAssistantHeading(line)) {
      flushList()
      flushParagraph()
      blocks.push({
        type: 'heading',
        text: normalizeAssistantLine(line).replace(/:$/, ''),
      })
      continue
    }

    const inlineHeading = line.match(
      /^((?:Diagn[oó]stico|Situaci[oó]n|Resumen|Recomendaci[oó]nes?|Pr[oó]ximos pasos|Acciones?|Riesgos?|Prioridades?|Hallazgos?|Hallazgo|Evidencia|Siguiente accion|Hecho|Conclusi[oó]n|Qu[eé] hacer))\s*:\s*(.+)$/i
    )
    if (inlineHeading?.[1] && inlineHeading[2]) {
      flushList()
      flushParagraph()
      blocks.push({ type: 'heading', text: inlineHeading[1] })
      paragraph.push(inlineHeading[2])
      continue
    }

    flushList()
    paragraph.push(normalizeAssistantLine(line))
  }

  flushList()
  flushParagraph()
  return blocks.length > 0 ? blocks : [{ type: 'paragraph', text: raw.trim() }]
}

export function NumberedSteps({ items, render }: { items: string[]; render?: (item: string) => ReactNode }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-2.5 text-[13px] leading-5 text-foreground/90">
          <span className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
            {index + 1}
          </span>
          <span className="min-w-0">{render ? render(item) : item}</span>
        </li>
      ))}
    </ol>
  )
}

export function AssistantMessageBody({ content, compact }: { content: string; compact?: boolean }) {
  const blocks = parseAssistantContent(content)
  return (
    <div className={cn('space-y-2.5', compact ? 'text-[13px] leading-5' : 'text-sm leading-6')}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return <SectionEyebrow key={`h-${index}`}>{block.text}</SectionEyebrow>
        }
        if (block.type === 'list') {
          return <NumberedSteps key={`l-${index}`} items={block.items} render={renderInlineSafe} />
        }
        return (
          <p key={`p-${index}`} className="text-foreground/90">
            {renderInlineSafe(block.text)}
          </p>
        )
      })}
    </div>
  )
}
