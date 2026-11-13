import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SignalBadge } from '@/components/ui/SignalBadge'
import { HorizonSelector } from '@/components/trading/HorizonSelector'
import { PredictionBand } from '@/components/charts/PredictionBand'
import { usePrediction } from '@/hooks/useSignals'
import { cn, formatDate, formatPct } from '@/lib/utils'
import type { Signal } from '@/types'

interface SignalDetailProps {
  signal: Signal | null
  horizon: number
  onHorizonChange: (horizon: number) => void
  onOpenChange: (open: boolean) => void
}

const ACTION_VERBS: Record<Signal['action'], string> = {
  BUY: 'comprar',
  HOLD: 'mantener',
  SELL: 'vender',
}

export function SignalDetail({ signal, horizon, onHorizonChange, onOpenChange }: SignalDetailProps) {
  const { data: prediction, isLoading, isError } = usePrediction(signal?.ticker ?? null, horizon)

  return (
    <Sheet open={!!signal} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        {signal && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <SheetTitle className="font-mono">{signal.ticker}</SheetTitle>
                <SignalBadge action={signal.action} confidence={signal.confidence} />
              </div>
              <SheetDescription>
                Señal generada {formatDate(signal.generated_at)} · modelo {signal.model_version}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6">
              <section>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {explanation(signal)}
                </p>
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Predicción de precio</h4>
                  <HorizonSelector value={horizon} onChange={onHorizonChange} />
                </div>
                <div className="bg-card border border-border rounded-lg h-64 p-2">
                  {isError ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
                      No se pudo calcular la predicción — comprueba que el modelo está entrenado para {signal.ticker}.
                    </div>
                  ) : (
                    <PredictionBand predictions={prediction?.predictions ?? []} isLoading={isLoading} />
                  )}
                </div>
              </section>

              {signal.shap_values && Object.keys(signal.shap_values).length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-sm font-medium">¿Qué influyó en esta señal?</h4>
                  <p className="text-xs text-muted-foreground">
                    Importancia de cada variable (SHAP) en la predicción — barras verdes empujan hacia BUY, rojas hacia SELL.
                  </p>
                  <ShapWaterfall values={signal.shap_values} />
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function explanation(signal: Signal): string {
  const verb = ACTION_VERBS[signal.action]
  const pct = Math.round(signal.confidence * 100)
  const driver = signal.shap_values
    ? Object.entries(signal.shap_values).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]?.[0]
    : null

  const base = `La señal "${signal.action}" sugiere ${verb} ${signal.ticker} con un ${pct}% de confianza, `
    + `proyectando un retorno esperado de ${signal.predicted_return !== null ? formatPct(signal.predicted_return * 100) : 'no disponible'} `
    + `a ${signal.horizon_days} días.`

  return driver
    ? `${base} El factor que más influyó fue "${driver}".`
    : base
}

function ShapWaterfall({ values }: { values: Record<string, number> }) {
  const entries = Object.entries(values)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 8)

  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v)), 1e-9)

  return (
    <div className="space-y-1.5">
      {entries.map(([feature, value]) => (
        <div key={feature} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate font-mono text-muted-foreground" title={feature}>{feature}</span>
          <div className="flex-1 h-4 rounded bg-muted relative overflow-hidden">
            <div
              className={cn('absolute top-0 bottom-0 rounded', value >= 0 ? 'bg-profit left-1/2' : 'bg-loss right-1/2')}
              style={{ width: `${(Math.abs(value) / maxAbs) * 50}%` }}
            />
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
          </div>
          <span className="w-16 shrink-0 text-right tabular-nums font-mono text-muted-foreground">{value.toFixed(3)}</span>
        </div>
      ))}
    </div>
  )
}
