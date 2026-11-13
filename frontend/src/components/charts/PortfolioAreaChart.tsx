import { useMemo } from 'react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { SnapshotPoint } from '@/types'

const PERIODS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1A', days: 365 },
  { label: 'Todo', days: 3650 },
] as const

interface PortfolioAreaChartProps {
  data: SnapshotPoint[]
  isLoading?: boolean
  period: number
  onPeriodChange: (days: number) => void
}

export function PortfolioAreaChart({ data, isLoading, period, onPeriodChange }: PortfolioAreaChartProps) {
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, total_pnl: d.total_value - d.total_cost })),
    [data]
  )

  const startValue = chartData[0]?.total_value
  const endValue = chartData[chartData.length - 1]?.total_value
  // Rentabilidad del periodo descontando aportaciones: encadena cada día (ΔValor − ΔAportado) / Valor previo
  const changeFromStart = useMemo(() => {
    if (!startValue || endValue === undefined || chartData.length < 2) return null
    let factor = 1
    for (let i = 1; i < chartData.length; i++) {
      const prev = chartData[i - 1], cur = chartData[i]
      if (prev.total_value > 0) factor *= 1 + (cur.total_value - prev.total_value - (cur.total_cost - prev.total_cost)) / prev.total_value
    }
    return (factor - 1) * 100
  }, [chartData, startValue, endValue])

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col h-full min-h-[320px]">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-medium">Evolución del patrimonio</h3>
          {changeFromStart !== null && (
            <p className={cn('text-xs mt-0.5', changeFromStart >= 0 ? 'text-profit' : 'text-loss')}>
              {changeFromStart >= 0 ? '+' : ''}{changeFromStart.toFixed(2)}% en el período
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => onPeriodChange(p.days)}
              className={cn(
                'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                period === p.days
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-[240px]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Cargando…</div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Sin histórico todavía — vuelve mañana para ver tu evolución.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioValueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#259970" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#259970" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => formatDate(d)}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v: number) => formatCurrency(v).replace(/\D00(?=\D*$)/, '')}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="total_value"
                stroke="#259970"
                strokeWidth={2}
                fill="url(#portfolioValueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

interface TooltipPayloadItem {
  payload: SnapshotPoint & { total_pnl: number }
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload

  return (
    <div className="bg-popover border border-border rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-medium">{formatDate(point.date)}</p>
      <p className="tabular-nums">Valor: <span className="font-mono font-medium">{formatCurrency(point.total_value)}</span></p>
      <p className="tabular-nums text-muted-foreground">Coste: <span className="font-mono">{formatCurrency(point.total_cost)}</span></p>
      <p className={cn('tabular-nums font-medium', point.total_pnl >= 0 ? 'text-profit' : 'text-loss')}>
        P&L: <span className="font-mono">{formatCurrency(point.total_pnl)}</span>
      </p>
    </div>
  )
}
