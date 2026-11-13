import { Bot, User } from 'lucide-react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import type { ChatMessage as ChatMessageType } from '@/types'

const markdownComponents: Components = {
  p: ({ ...props }) => <p className="my-1.5 first:mt-0 last:mb-0" {...props} />,
  ul: ({ ...props }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5" {...props} />,
  ol: ({ ...props }) => <ol className="my-1.5 ml-4 list-decimal space-y-0.5" {...props} />,
  a: ({ ...props }) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />,
  strong: ({ ...props }) => <strong className="font-600" {...props} />,
  code: ({ ...props }) => <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 text-xs font-mono" {...props} />,
  table: ({ ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs border-collapse" {...props} />
    </div>
  ),
  thead: ({ ...props }) => <thead className="border-b border-border/60" {...props} />,
  th: ({ ...props }) => <th className="px-2 py-1 text-left font-medium" {...props} />,
  td: ({ ...props }) => <td className="px-2 py-1 border-t border-border/40 tabular-nums" {...props} />,
}

interface ChatMessageProps {
  message: ChatMessageType
  isStreaming?: boolean
}

export function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-brand-500/15 text-brand-600 dark:text-brand-400'
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      <div
        className={cn(
          'max-w-[75%] rounded-xl px-4 py-2.5 text-sm leading-relaxed',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-foreground'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content || (isStreaming ? '…' : '')}
            </ReactMarkdown>
          </div>
        )}
        {isStreaming && message.content && (
          <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current align-text-bottom animate-pulse" />
        )}
      </div>
    </div>
  )
}
