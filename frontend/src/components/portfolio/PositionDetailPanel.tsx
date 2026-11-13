import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AssetBadge } from '@/components/ui/AssetBadge'
import { CandlestickChart } from '@/components/charts/CandlestickChart'
import { AddTransactionModal } from '@/components/portfolio/AddTransactionModal'
import { usePriceHistory } from '@/hooks/usePriceHistory'
import { assetsApi } from '@/lib/api'
import { cn, formatCurrency, formatPct, plClass } from '@/lib/utils'
import type { Position } from '@/types'

interface PositionDetailPanelProps {
  position: Position | null
  onOpenChange: (open: boolean) => void
}

export function PositionDetailPanel({ position, onOpenChange }: PositionDetailPanelProps) {
  const [period, setPeriod] = useState('6mo')

  const { data: ohlcv = [], isLoading: loadingOhlcv } = usePriceHistory(position?.ticker, period, '1d')
  const { data: info } = useQuery({
    queryKey: ['assets', position?.ticker, 'info'],
    queryFn: () => assetsApi.getInfo(position!.ticker).then((r) => r.data),
    enabled: !!position,
  })
  const { data: fundamentals } = useQuery({
    queryKey: ['assets', position?.ticker, 'fundamentals'],
    queryFn: () => assetsApi.getMetrics(position!.ticker).then((r) => r.data),
    enabled: !!position,
  })

  return (
    <Sheet open={!!position} onOpenChange={onOpenChange}>
      <SheetContent>
        {position && (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <SheetTitle className="font-mono">{position.ticker}</SheetTitle>
                  <AssetBadge assetClass={position.asset_class} />
                </div>
                <AddTransactionModal
                  position={position}
                  trigger={
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                      <Plus className="w-3 h-3" />
                      Añadir operación
                    </button>
                  }
                />
              </div>
              <SheetDescription>{position.name}</SheetDescription>
            </SheetHeader>

            {/* Resumen de la posición */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Stat label="Valor actual" value={formatCurrency(position.current_value, position.currency)} />
              <Stat label="Cantidad" value={position.quantity.toLocaleString('es-ES')} />
              <Stat label="Coste medio" value={formatCurrency(position.avg_cost, position.currency)} />
              <Stat label="Precio actual" value={formatCurrency(position.current_price, position.currency)} />
              <Stat
                label="P&L"
                value={formatCurrency(position.pnl, position.currency)}
                valueClassName={plClass(position.pnl)}
                sub={formatPct(position.pnl_pct)}
              />
              <Stat
                label="Variación hoy"
                value={formatPct(position.daily_change_pct)}
                valueClassName={plClass(position.daily_change_pct)}
              />
            </div>

            <CandlestickChart
              data={ohlcv}
              isLoading={loadingOhlcv}
              period={period}
              onPeriodChange={setPeriod}
              currency={position.currency}
            />

            {/* Información del activo */}
            {(info || fundamentals) && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                {info?.sector && <Stat label="Sector" value={info.sector} />}
                {info?.country && <Stat label="País" value={info.country} />}
                {fundamentals?.pe_ratio != null && <Stat label="P/E" value={fundamentals.pe_ratio.toFixed(2)} />}
                {fundamentals?.dividend_yield != null && <Stat label="Yield dividendo" value={`${fundamentals.dividend_yield.toFixed(2)}%`} />}
                {fundamentals?.beta != null && <Stat label="Beta" value={fundamentals.beta.toFixed(2)} />}
                {info?.fifty_two_week_high != null && (
                  <Stat label="Rango 52 semanas" value={`${formatCurrency(info.fifty_two_week_low ?? 0, info.currency ?? undefined)} – ${formatCurrency(info.fifty_two_week_high, info.currency ?? undefined)}`} />
                )}
              </div>
            )}

            {info?.description && (
              <p className="mt-6 text-sm text-muted-foreground leading-relaxed line-clamp-6">
                {info.description}
              </p>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value, sub, valueClassName }: { label: string; value: string; sub?: string; valueClassName?: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={cn('text-sm font-mono font-medium tabular-nums mt-0.5', valueClassName)}>
        {value}
        {sub && <span className="ml-1.5 text-xs opacity-80">({sub})</span>}
      </p>
    </div>
  )
}
