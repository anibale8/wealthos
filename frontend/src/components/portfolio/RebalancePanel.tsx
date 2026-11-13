import { useEffect, useMemo, useState } from 'react'
import { Loader2, Scale } from 'lucide-react'
import { AssetBadge } from '@/components/ui/AssetBadge'
import { usePositions, useRebalanceSuggestion } from '@/hooks/usePortfolio'
import { cn, formatCurrency, formatPct, plClass } from '@/lib/utils'
import type { AssetClass } from '@/types'

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Acciones',
  etf: 'ETFs',
  fund: 'Fondos',
  crypto: 'Cripto',
  bond: 'Bonos',
  real_estate: 'Inmuebles',
  cash: 'Liquidez',
}

const ACTION_LABELS: Record<'buy' | 'sell', string> = { buy: 'Comprar', sell: 'Vender' }

export function RebalancePanel() {
  const { data: positions = [] } = usePositions()
  const rebalance = useRebalanceSuggestion()

  const currentByClass = useMemo(() => {
    const totals = new Map<AssetClass, number>()
    let total = 0
    for (const p of positions) {
      totals.set(p.asset_class, (totals.get(p.asset_class) ?? 0) + p.current_value)
      total += p.current_value
    }
    const classes = Array.from(totals.keys())
    return { classes, totals, total }
  }, [positions])

  const [targets, setTargets] = useState<Record<string, number>>({})

  useEffect(() => {
    if (currentByClass.classes.length > 0 && Object.keys(targets).length === 0) {
      const initial: Record<string, number> = {}
      for (const cls of currentByClass.classes) {
        const current = currentByClass.total ? (currentByClass.totals.get(cls)! / currentByClass.total) * 100 : 0
        initial[cls] = Math.round(current)
      }
      setTargets(initial)
    }
  }, [currentByClass, targets])

  const sum = Object.values(targets).reduce((acc, v) => acc + v, 0)

  if (currentByClass.classes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Añade activos a tu cartera para configurar un rebalanceo.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-medium mb-1">Pesos objetivo por clase de activo</h4>
        <p className="text-xs text-muted-foreground mb-3">
          Define el % que quieres que represente cada clase en tu cartera. Deben sumar 100%.
        </p>

        <div className="space-y-3">
          {currentByClass.classes.map((cls) => (
            <div key={cls} className="flex items-center gap-3">
              <AssetBadge assetClass={cls} className="w-24 justify-center shrink-0" />
              <input
                type="range"
                min={0}
                max={100}
                value={targets[cls] ?? 0}
                onChange={(e) => setTargets((prev) => ({ ...prev, [cls]: Number(e.target.value) }))}
                className="flex-1 accent-brand-500"
              />
              <span className="w-14 text-right text-sm font-mono tabular-nums">{targets[cls] ?? 0}%</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3 text-xs">
          <span className={cn('font-medium', sum === 100 ? 'text-profit' : 'text-loss')}>
            Suma: {sum}% {sum !== 100 && '— debe ser 100%'}
          </span>
          <button
            onClick={() => rebalance.mutate(targets)}
            disabled={sum !== 100 || rebalance.isPending}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {rebalance.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
            Calcular rebalanceo
          </button>
        </div>
      </div>

      {rebalance.data && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Clase</th>
                  <th className="text-right font-medium px-4 py-2.5">Actual</th>
                  <th className="text-right font-medium px-4 py-2.5">Objetivo</th>
                  <th className="text-right font-medium px-4 py-2.5">Diferencia</th>
                  <th className="text-right font-medium px-4 py-2.5">Valor actual</th>
                  <th className="text-right font-medium px-4 py-2.5">Valor objetivo</th>
                </tr>
              </thead>
              <tbody>
                {rebalance.data.rows.map((row) => (
                  <tr key={row.asset_class} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5"><AssetBadge assetClass={row.asset_class} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatPct(row.current_pct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatPct(row.target_pct)}</td>
                    <td className={cn('px-4 py-2.5 text-right tabular-nums font-medium', plClass(row.diff_pct))}>
                      {row.diff_pct > 0 ? '+' : ''}{formatPct(row.diff_pct)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground">
                      {formatCurrency(row.current_value)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground">
                      {formatCurrency(row.target_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rebalance.data.trades.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Tu cartera ya está alineada con estos pesos objetivo — no se sugieren operaciones.
            </p>
          ) : (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h4 className="text-sm font-medium">Operaciones sugeridas</h4>
              </div>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Activo</th>
                    <th className="text-left font-medium px-4 py-2">Acción</th>
                    <th className="text-right font-medium px-4 py-2">Importe aprox.</th>
                    <th className="text-right font-medium px-4 py-2">Cantidad aprox.</th>
                  </tr>
                </thead>
                <tbody>
                  {rebalance.data.trades.map((trade, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono font-medium">{trade.ticker}</td>
                      <td className="px-4 py-2">
                        <span className={cn('font-medium', trade.action === 'buy' ? 'text-profit' : 'text-loss')}>
                          {ACTION_LABELS[trade.action]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-mono">{formatCurrency(trade.amount)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-mono text-muted-foreground">
                        ≈ {trade.approx_quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border">
                Las ventas con plusvalías pueden generar impacto fiscal — consulta la sección de fiscalidad para una estimación.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
