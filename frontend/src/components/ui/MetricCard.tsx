import { cn, formatCurrency, formatPct, plClass } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: number | null  // null = no calculado: se muestra "—"
  type?: 'currency' | 'percent' | 'number'
  change?: number
  changePct?: number
  currency?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function MetricCard({
  label, value, type = 'currency', change, changePct,
  currency = 'EUR', className, size = 'md',
}: MetricCardProps) {
  const formatted =
    value === null ? '—' :
    type === 'currency' ? formatCurrency(value, currency) :
    type === 'percent'  ? formatPct(value) :
    value.toLocaleString('es-ES')

  const changeClass = change !== undefined ? plClass(change) : ''
  const TrendIcon =
    change === undefined ? null :
    change > 0 ? TrendingUp :
    change < 0 ? TrendingDown : Minus

  return (
    <div className={cn(
      'bg-card border border-border rounded-lg p-4 flex flex-col gap-1 transition-colors hover:border-border/80',
      size === 'lg' && 'p-6',
      className
    )}>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className={cn(
        'font-display font-600 tabular-nums',
        size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-3xl' : 'text-2xl'
      )}>
        {formatted}
      </p>
      {(change !== undefined || changePct !== undefined) && (
        <div className={cn('flex items-center gap-1 text-xs font-medium', changeClass)}>
          {TrendIcon && <TrendIcon className="w-3 h-3" />}
          {changePct !== undefined && <span>{formatPct(changePct)}</span>}
          {change !== undefined && (
            <span className="text-muted-foreground">
              ({formatCurrency(Math.abs(change), currency)})
            </span>
          )}
        </div>
      )}
    </div>
  )
}
