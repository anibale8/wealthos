import { useEffect, useRef, useState } from 'react'
import { Send, Trash2 } from 'lucide-react'
import { ChatMessage } from '@/components/ai/ChatMessage'
import { useAIStream } from '@/hooks/useAIStream'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '@/types'

const QUICK_ACTIONS = [
  'Analiza mi cartera',
  '¿Debo rebalancear?',
  'Riesgos actuales',
] as const

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [input, setInput] = useState('')
  const { content, isStreaming, error, sendMessage, reset } = useAIStream()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, content])

  // Cuando termina el streaming, consolidamos la respuesta como mensaje del historial
  useEffect(() => {
    if (!isStreaming && content) {
      setMessages((prev) => [...prev, { role: 'assistant', content }])
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming])

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    const next = [...messages, { role: 'user' as const, content: trimmed }]
    setMessages(next)
    setInput('')
    void sendMessage(next)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(input)
    }
  }

  const clearConversation = () => {
    setMessages([])
    setInput('')
    reset()
  }

  return (
    <div className="flex flex-col h-[68vh] bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <p className="text-sm font-medium">Chat con WealthOS AI</p>
        <button
          onClick={clearConversation}
          disabled={messages.length === 0 && !content}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Limpiar conversación
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
        {messages.length === 0 && !content && (
          <div className="h-full flex flex-col items-center justify-center text-center text-sm text-muted-foreground gap-1">
            <p className="font-medium text-foreground">Pregúntame lo que quieras sobre tu cartera</p>
            <p>Conozco tus posiciones, P&L, métricas de riesgo y tu historial de operaciones.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <ChatMessage key={i} message={m} />
        ))}

        {(isStreaming || content) && (
          <ChatMessage message={{ role: 'assistant', content }} isStreaming={isStreaming} />
        )}

        {error && (
          <p className="text-xs text-loss text-center">{error}</p>
        )}
      </div>

      <div className="border-t border-border p-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action}
              onClick={() => submit(action)}
              disabled={isStreaming}
              className="px-2.5 py-1 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {action}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu pregunta… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-32 scrollbar-thin"
          />
          <button
            onClick={() => submit(input)}
            disabled={isStreaming || !input.trim()}
            className={cn(
              'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed'
            )}
            aria-label="Enviar mensaje"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
