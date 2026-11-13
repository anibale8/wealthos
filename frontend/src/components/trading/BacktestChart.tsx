import { useMemo } from 'react'
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { cn, formatCurrency, formatDate, formatPct, plClass } from '@/lib/utils'
import type { Backtest, EquityPoint } from '@/types'

interface BacktestChartProps {
  backtest: Backtest | undefined
  isLoading?: boolean
}

export function BacktestChart({ backtest, isLoading }: BacktestChartProps) {
  const data = backtest?.equity_curve ?? []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Retorno total (estrategia)"
          value={backtest ? formatPct(backtest.strategy.total_return * 100) : '—'}
          tone={backtest ? plClass(backtest.strategy.total_return) : undefined}
        />
        <SummaryCard
          label="Retorno total (Buy & Hold)"
          value={backtest ? formatPct(backtest.benchmark.total_return * 100) : '—'}
          tone={backtest ? plClass(backtest.benchmark.total_return) : undefined}
        />
        <SummaryCard
          label="Sharpe"
          value={backtest?.strategy.sharpe_ratio?.toFixed(2) ?? '—'}
        />
        <SummaryCard
          label="Drawdown máximo"
          value={backtest ? formatPct(backtest.strategy.max_drawdown * 100) : '—'}
          tone="text-loss"
        />
        <SummaryCard
          label="Sortino"
          value={backtest?.strategy.sortino_ratio?.toFixed(2) ?? '—'}
        />
        <SummaryCard
          label="Hit rate"
          value={backtest?.strategy.hit_rate !== null && backtest?.strategy.hit_rate !== undefined
            ? `${Math.round(backtest.strategy.hit_rate * 100)}%`
            : '—'}
        />
        <SummaryCard
          label="Profit factor"
          value={backtest?.strategy.profit_factor?.toFixed(2) ?? '—'}
        />
        <SummaryCard
          label="Operaciones"
          value={backtest?.strategy.n_trades?.toString() ?? '—'}
        />
      </div>

      <div className="bg-card border border-border rounded-lg p-4 h-72">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Ejecutando backtest…</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
            No hay backtest disponible — entrena primero el modelo para este activo.
          </div>
        ) : (
          <EquityCurveChart data={data} initialCapital={backtest?.initial_capital ?? 10_000} />
        )}
      </div>

      {backtest && backtest.strategy.trades && backtest.strategy.trades.length > 0 && (
        <TradesTable trades={backtest.strategy.trades} />
      )}
    </div>
  )
}

function EquityCurveChart({ data, initialCapital }: { data: EquityPoint[]; initialCapital: number }) {
  const chartData = useMemo(() => data, [data])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDate(d)}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={50}
        />
        <YAxis
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => formatCurrency(v).replace(/,\d{2}(?=\D*$)/, '')}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip content={<EquityTooltip initialCapital={initialCapital} />} />
        <Line type="monotone" dataKey="value" name="Estrategia" stroke="#259970" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="benchmark" name="Buy & Hold" stroke="#a1a1aa" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function EquityTooltip({ active, payload, initialCapital }: { active?: boolean; payload?: { payload: EquityPoint }[]; initialCapital: number }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload

  return (
    <div className="bg-popover border border-border rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-medium">{formatDate(point.date)}</p>
      <p className="tabular-nums">
        <span className="inline-block w-2 h-2 rounded-full bg-brand-500 mr-1.5" />
        Estrategia: <span className="font-medium">{formatCurrency(point.value)}</span>
        <span className={cn('ml-1', plClass(point.value - initialCapital))}>
          ({formatPct(((point.value - initialCapital) / initialCapital) * 100)})
        </span>
      </p>
      <p className="tabular-nums text-muted-foreground">
        <span className="inline-block w-2 h-2 rounded-full bg-zinc-400 mr-1.5" />
        Buy & Hold: {formatCurrency(point.benchmark)}
      </p>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className={cn('font-display font-600 tabular-nums text-lg mt-0.5', tone)}>{value}</p>
    </div>
  )
}

function TradesTable({ trades }: { trades: NonNullable<Backtest['strategy']['trades']> }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h4 className="text-sm font-medium">Operaciones simuladas</h4>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left font-medium px-4 py-2">Entrada</th>
              <th className="text-left font-medium px-4 py-2">Salida</th>
              <th className="text-right font-medium px-4 py-2">Precio entrada</th>
              <th className="text-right font-medium px-4 py-2">Precio salida</th>
              <th className="text-right font-medium px-4 py-2">P&L</th>
              <th className="text-right font-medium px-4 py-2">P&L %</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-4 py-2 tabular-nums">{formatDate(trade.entry_date)}</td>
                <td className="px-4 py-2 tabular-nums">{formatDate(trade.exit_date)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-mono">{formatCurrency(trade.entry_price)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-mono">{formatCurrency(trade.exit_price)}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums font-mono', plClass(trade.pnl))}>{formatCurrency(trade.pnl)}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums font-mono', plClass(trade.pnl_pct))}>{formatPct(trade.pnl_pct * 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
