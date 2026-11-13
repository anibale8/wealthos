import { useMemo, useState } from 'react'
import type { CorrelationMatrix } from '@/types'

interface CorrelationHeatmapProps {
  data: CorrelationMatrix | undefined
  isLoading?: boolean
}

export function CorrelationHeatmap({ data, isLoading }: CorrelationHeatmapProps) {
  const [hovered, setHovered] = useState<{ a: string; b: string; value: number } | null>(null)

  const cells = useMemo(() => {
    if (!data) return []
    const list: { a: string; b: string; value: number; row: number; col: number }[] = []
    data.tickers.forEach((a, row) => {
      data.tickers.forEach((b, col) => {
        list.push({ a, b, value: data.matrix[row]?.[col] ?? 0, row, col })
      })
    })
    return list
  }, [data])

  if (isLoading) {
    return <div className="h-72 rounded-lg bg-muted animate-pulse" />
  }

  if (!data || data.tickers.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-muted-foreground text-center px-6">
        Necesitas al menos 2 activos en cartera para calcular correlaciones.
      </div>
    )
  }

  const n = data.tickers.length
  const cellSize = Math.min(56, Math.max(28, Math.floor(480 / n)))

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto scrollbar-thin">
        <div className="inline-block">
          <div className="flex" style={{ marginLeft: cellSize }}>
            {data.tickers.map((ticker) => (
              <div
                key={ticker}
                className="flex items-end justify-center font-mono text-[10px] text-muted-foreground"
                style={{ width: cellSize, height: cellSize * 0.7 }}
              >
                {ticker}
              </div>
            ))}
          </div>
          {data.tickers.map((rowTicker, row) => (
            <div key={rowTicker} className="flex">
              <div
                className="flex items-center justify-end pr-2 font-mono text-[10px] text-muted-foreground"
                style={{ width: cellSize }}
              >
                {rowTicker}
              </div>
              {cells
                .filter((c) => c.row === row)
                .map((cell) => (
                  <div
                    key={`${cell.a}-${cell.b}`}
                    onMouseEnter={() => setHovered(cell)}
                    onMouseLeave={() => setHovered(null)}
                    className="flex items-center justify-center text-[10px] font-mono tabular-nums border border-card cursor-default transition-transform hover:scale-110 hover:z-10 hover:shadow-md"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: correlationColor(cell.value),
                      color: '#000000',
                    }}
                  >
                    {cell.value.toFixed(2)}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>-1</span>
          <div
            className="h-3 w-32 rounded-full"
            style={{ background: 'linear-gradient(to right, #dc2626, #f4f4f5, #16a34a)' }}
          />
          <span>+1</span>
          <span className="ml-1">correlación de retornos diarios (1 año)</span>
        </div>
        {hovered && (
          <span className="font-mono">
            {hovered.a} × {hovered.b}: <span className="font-medium text-foreground">{hovered.value.toFixed(3)}</span>
          </span>
        )}
      </div>
    </div>
  )
}

function correlationColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value))
  if (clamped >= 0) {
    // 0 → blanco, +1 → verde
    const t = clamped
    return mix([244, 244, 245], [22, 163, 74], t)
  }
  // 0 → blanco, -1 → rojo
  const t = -clamped
  return mix([244, 244, 245], [220, 38, 38], t)
}

function mix(from: number[], to: number[], t: number): string {
  const [r, g, b] = from.map((c, i) => Math.round(c + (to[i] - c) * t))
  return `rgb(${r}, ${g}, ${b})`
}
