import { useCallback, useRef, useState } from 'react'
import type { ChatMessage } from '@/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

interface StreamChunk {
  text?: string
  error?: string
}

export function useAIStream() {
  const [content, setContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (messages: ChatMessage[]) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setContent('')
    setError(null)
    setIsStreaming(true)

    try {
      const res = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, include_portfolio: true }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        throw new Error(`Error del servidor (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const payload = line.replace(/^data:\s*/, '').trim()
          if (!payload || payload === '[DONE]') continue

          const chunk = JSON.parse(payload) as StreamChunk
          if (chunk.error) {
            setError(chunk.error)
          } else if (chunk.text) {
            acc += chunk.text
            setContent(acc)
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message || 'Error al conectar con la IA')
      }
    } finally {
      setIsStreaming(false)
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const reset = useCallback(() => {
    setContent('')
    setError(null)
  }, [])

  return { content, isStreaming, error, sendMessage, stop, reset }
}
