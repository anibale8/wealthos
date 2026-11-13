import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SignalsList } from '@/components/trading/SignalsList'
import { SignalDetail } from '@/components/trading/SignalDetail'
import { BacktestChart } from '@/components/trading/BacktestChart'
import { useSignals, useTrainModels, useBacktest } from '@/hooks/useSignals'
import { usePositions } from '@/hooks/usePortfolio'
import { cn } from '@/lib/utils'
import type { Signal } from '@/types'

const CONFIDENCE_FILTERS = [
  { label: 'Todas', value: 0 },
  { label: '≥ 60%', value: 0.6 },
  { label: '≥ 75%', value: 0.75 },
  { label: '≥ 90%', value: 0.9 },
] as const

export function TradingPage() {
  const [minConfidence, setMinConfidence] = useState(0.6)
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null)
  const [horizon, setHorizon] = useState(30)
  const [backtestTicker, setBacktestTicker] = useState<string | null>(null)

  const { data: signals = [], isLoading: loadingSignals } = useSignals(minConfidence)
  const { data: positions = [] } = usePositions()
  const trainModels = useTrainModels()

  const tickers = useMemo(
    () => Array.from(new Set(positions.map((p) => p.ticker))).sort(),
    [positions]
  )

  useEffect(() => {
    if (!backtestTicker && tickers.length > 0) setBacktestTicker(tickers[0])
  }, [tickers, backtestTicker])

  const { data: backtest, isLoading: loadingBacktest, isError: backtestError } = useBacktest(backtestTicker)

  return (
    <div>
      <PageHeader
        title="Señales de trading"
        subtitle="Predicciones del modelo ML (LightGBM + LSTM)"
        actions={
          <button
            onClick={() => tickers.length > 0 && trainModels.mutate(tickers)}
            disabled={trainModels.isPending || tickers.length === 0}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {trainModels.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            Reentrenar modelos
          </button>
        }
      />

      <div className="p-6 space-y-6">
        <Tabs defaultValue="signals" className="space-y-4">
          <TabsList>
            <TabsTrigger value="signals">Señales activas</TabsTrigger>
            <TabsTrigger value="backtest">Backtesting</TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Confianza mínima:</span>
              {CONFIDENCE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setMinConfidence(f.value)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    minConfidence === f.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <SignalsList
              signals={signals}
              isLoading={loadingSignals}
              selectedTicker={selectedSignal?.ticker ?? null}
              onSelect={setSelectedSignal}
            />

            {trainModels.isSuccess && (
              <p className="text-xs text-muted-foreground">
                Reentrenamiento lanzado para {trainModels.data?.tickers?.join(', ')} — esto se ejecuta en segundo plano
                y puede tardar varios minutos. Las señales se actualizarán automáticamente al terminar.
              </p>
            )}
          </TabsContent>

          <TabsContent value="backtest" className="space-y-4">
            {tickers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Añade activos a tu cartera para poder ejecutar un backtest.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-medium">Activo:</span>
                  {tickers.map((ticker) => (
                    <button
                      key={ticker}
                      onClick={() => setBacktestTicker(ticker)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-colors',
                        backtestTicker === ticker
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {ticker}
                    </button>
                  ))}
                </div>

                {backtestError ? (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    No se pudo ejecutar el backtest para {backtestTicker} — entrena primero el modelo desde "Reentrenar modelos".
                  </p>
                ) : (
                  <BacktestChart backtest={backtest} isLoading={loadingBacktest} />
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <SignalDetail
        signal={selectedSignal}
        horizon={horizon}
        onHorizonChange={setHorizon}
        onOpenChange={(open) => !open && setSelectedSignal(null)}
      />
    </div>
  )
}
