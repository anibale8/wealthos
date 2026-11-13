import { useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetricCard } from '@/components/ui/MetricCard'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { CorrelationHeatmap } from '@/components/charts/CorrelationHeatmap'
import { RebalancePanel } from '@/components/portfolio/RebalancePanel'
import {
  useCorrelations,
  useDividends,
  useOverlaps,
  usePortfolioMetrics,
  useTaxImpact,
} from '@/hooks/usePortfolio'
import { cn, formatCurrency, formatDate, formatPct, plClass } from '@/lib/utils'

const METRIC_LABELS: Record<string, string> = {
  sharpe_ratio: 'Sharpe',
  sortino_ratio: 'Sortino',
  volatility_annual: 'Volatilidad anual',
  max_drawdown: 'Drawdown máximo',
  var_95: 'VaR 95%',
  beta: 'Beta',
}

const RISK_EXPLANATIONS: Record<string, string> = {
  sharpe_ratio: 'Retorno ajustado al riesgo total. Por encima de 1 se considera bueno; por debajo de 0, la cartera pierde frente al activo libre de riesgo.',
  sortino_ratio: 'Como el Sharpe, pero solo penaliza la volatilidad a la baja — más representativo del riesgo "real" que percibe un inversor.',
  volatility_annual: 'Dispersión anualizada de los retornos diarios. Cuanto más alta, más bruscos son los movimientos de tu cartera.',
  max_drawdown: 'La mayor caída desde un máximo histórico hasta el siguiente mínimo — la peor racha que has sufrido.',
  var_95: 'Pérdida diaria que, con un 95% de confianza, no deberías superar en un día normal de mercado.',
  beta: 'Sensibilidad de tu cartera frente al mercado de referencia. Beta > 1 implica más volatilidad que el mercado.',
}

export function AnalysisPage() {
  const { data: metrics, isLoading: loadingMetrics } = usePortfolioMetrics()
  const { data: correlations, isLoading: loadingCorrelations } = useCorrelations()
  const { data: overlaps = [], isLoading: loadingOverlaps } = useOverlaps()
  const { data: dividends = [], isLoading: loadingDividends } = useDividends()
  const { data: tax, isLoading: loadingTax } = useTaxImpact()

  const dividendsByMonth = useMemo(() => {
    const groups = new Map<string, { label: string; total: number; entries: typeof dividends }>()
    for (const entry of dividends) {
      const d = new Date(entry.date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      if (!groups.has(key)) groups.set(key, { label, total: 0, entries: [] })
      const group = groups.get(key)!
      group.total += entry.amount
      group.entries.push(entry)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
  }, [dividends])

  const projectedAnnualTotal = useMemo(() => {
    const seen = new Set<string>()
    let total = 0
    for (const entry of dividends) {
      if (seen.has(entry.ticker)) continue
      seen.add(entry.ticker)
      total += entry.projected_annual
    }
    return total
  }, [dividends])

  return (
    <div>
      <PageHeader title="Análisis" subtitle="Riesgo, correlaciones, rebalanceo y fiscalidad" />

      <div className="p-6 space-y-8">
        {/* Sección 1 — Métricas de riesgo */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Métricas de riesgo</h3>
          {loadingMetrics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} className="h-20" />)}
            </div>
          ) : metrics ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <MetricCard label="Volatilidad anual" value={metrics.volatility_annual * 100} type="percent" size="sm" />
              <MetricCard label="Sharpe" value={metrics.sharpe_ratio} type="number" size="sm" />
              <MetricCard label="Sortino" value={metrics.sortino_ratio} type="number" size="sm" />
              <MetricCard label="Drawdown máximo" value={metrics.max_drawdown * 100} type="percent" size="sm" />
              <MetricCard label="VaR 95%" value={metrics.var_95 * 100} type="percent" size="sm" />
              <MetricCard label="Beta" value={metrics.beta ?? null} type="number" size="sm" />
            </div>
          ) : null}
          <div className="grid sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
            {Object.entries(RISK_EXPLANATIONS).map(([key, text]) => (
              <p key={key}><span className="font-medium text-foreground">{METRIC_LABELS[key]}:</span> {text}</p>
            ))}
          </div>
        </section>

        {/* Sección 2 — Correlaciones */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Matriz de correlación</h3>
          <div className="bg-card border border-border rounded-lg p-4">
            <CorrelationHeatmap data={correlations} isLoading={loadingCorrelations} />
          </div>
        </section>

        {/* Sección 3 — Rebalanceo */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Rebalanceo de cartera</h3>
          <div className="bg-card border border-border rounded-lg p-4">
            <RebalancePanel />
          </div>
        </section>

        {/* Sección 4 — Solapamientos */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Solapamientos entre fondos/ETFs</h3>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {loadingOverlaps ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} className="h-12" />)}
              </div>
            ) : overlaps.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                No se han detectado solapamientos relevantes entre tus fondos y ETFs (o no hay suficientes datos de holdings disponibles).
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left font-medium px-4 py-2.5">Par</th>
                    <th className="text-right font-medium px-4 py-2.5">Solapamiento</th>
                    <th className="text-left font-medium px-4 py-2.5">Holdings compartidos</th>
                  </tr>
                </thead>
                <tbody>
                  {overlaps.map((pair) => (
                    <tr key={`${pair.ticker_a}-${pair.ticker_b}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 font-mono font-medium">{pair.ticker_a} × {pair.ticker_b}</td>
                      <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium',
                        pair.overlap_pct > 30 ? 'text-loss' : pair.overlap_pct > 10 ? 'text-yellow-600' : 'text-muted-foreground')}>
                        {formatPct(pair.overlap_pct)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-md">
                        {pair.shared_holdings.slice(0, 6).join(', ')}
                        {pair.shared_holdings.length > 6 && ` +${pair.shared_holdings.length - 6} más`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Sección 5 — Calendario de dividendos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Calendario de dividendos</h3>
            {dividends.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Proyección anual estimada: <span className="font-medium text-foreground tabular-nums">{formatCurrency(projectedAnnualTotal)}</span>
              </span>
            )}
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {loadingDividends ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} className="h-12" />)}
              </div>
            ) : dividendsByMonth.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                No hay dividendos registrados todavía — se mostrarán aquí en cuanto registres operaciones de tipo "dividendo".
              </p>
            ) : (
              <div className="divide-y divide-border">
                {dividendsByMonth.map(([key, group]) => (
                  <div key={key} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium capitalize">{group.label}</span>
                      <span className="text-sm font-mono tabular-nums text-profit">{formatCurrency(group.total)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.entries.map((entry, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground font-mono">
                          {entry.ticker} · {formatCurrency(entry.amount)} · {formatDate(entry.date)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Sección 6 — Fiscalidad (estimación IRPF) */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Estimación fiscal (IRPF España)</h3>
          {loadingTax ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} className="h-20" />)}
            </div>
          ) : tax ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label={`Plusvalías realizadas ${tax.fiscal_year}`}
                  value={tax.realized_gains_total}
                  size="sm"
                />
                <MetricCard label="Impuesto estimado" value={tax.estimated_tax} size="sm" />
                <MetricCard label="Plusvalías latentes" value={tax.unrealized_gains} size="sm" />
                <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tipo efectivo</p>
                  <p className="font-display font-600 tabular-nums text-2xl">
                    {tax.effective_rate !== null ? formatPct(tax.effective_rate * 100) : '—'}
                  </p>
                </div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-xs text-muted-foreground space-y-1.5">
                <p>
                  Corto plazo (&lt;1 año): <span className={cn('font-medium', plClass(tax.realized_gains_short_term))}>{formatCurrency(tax.realized_gains_short_term)}</span>
                  {' · '}
                  Largo plazo (≥1 año): <span className={cn('font-medium', plClass(tax.realized_gains_long_term))}>{formatCurrency(tax.realized_gains_long_term)}</span>
                </p>
                <p>
                  Tramos aplicados sobre la base del ahorro 2024: hasta 6.000€ = 19%, 6.000–50.000€ = 21%, 50.000–200.000€ = 23%, &gt;200.000€ = 27%.
                  Esta es una estimación informativa — no sustituye el asesoramiento fiscal profesional.
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
