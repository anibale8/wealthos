import { SignalBadge } from '@/components/ui/SignalBadge'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn, formatPct } from '@/lib/utils'
import type { Signal } from '@/types'

interface SignalsListProps {
  signals: Signal[]
  isLoading?: boolean
  selectedTicker: string | null
  onSelect: (signal: Signal) => void
}

export function SignalsList({ signals, isLoading, selectedTicker, onSelect }: SignalsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-16" />)}
      </div>
    )
  }

  if (signals.length === 0) {
    return (
      <EmptyState
        variant="signals"
        title="Sin señales activas"
        description="El modelo aún no ha generado señales para los activos de tu cartera. Entrénalo desde aquí cuando tengas datos suficientes."
      />
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-muted-foreground border-b border-border">
          <tr>
            <th className="text-left font-medium px-4 py-2.5">Activo</th>
            <th className="text-left font-medium px-4 py-2.5">Señal</th>
            <th className="text-left font-medium px-4 py-2.5">Confianza</th>
            <th className="text-right font-medium px-4 py-2.5">Retorno esperado</th>
            <th className="text-right font-medium px-4 py-2.5">Horizonte</th>
            <th className="text-right font-medium px-4 py-2.5">Generada</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => (
            <tr
              key={signal.id}
              onClick={() => onSelect(signal)}
              className={cn(
                'border-b border-border last:border-0 cursor-pointer transition-colors hover:bg-accent/50',
                selectedTicker === signal.ticker && 'bg-accent'
              )}
            >
              <td className="px-4 py-3 font-mono font-medium">{signal.ticker}</td>
              <td className="px-4 py-3"><SignalBadge action={signal.action} /></td>
              <td className="px-4 py-3 w-40">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', {
                        'bg-profit': signal.action === 'BUY',
                        'bg-yellow-500': signal.action === 'HOLD',
                        'bg-loss': signal.action === 'SELL',
                      })}
                      style={{ width: `${Math.round(signal.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-xs text-muted-foreground w-9 text-right">
                    {Math.round(signal.confidence * 100)}%
                  </span>
                </div>
              </td>
              <td className={cn('px-4 py-3 text-right tabular-nums font-mono', signal.predicted_return ? (signal.predicted_return > 0 ? 'text-profit' : 'text-loss') : '')}>
                {signal.predicted_return !== null ? formatPct(signal.predicted_return * 100) : '—'}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{signal.horizon_days}d</td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">
                {timeAgo(signal.generated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / (60 * 60 * 1000))
  if (hours < 1) return 'hace minutos'
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}
