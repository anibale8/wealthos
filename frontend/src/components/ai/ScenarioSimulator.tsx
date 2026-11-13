import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { cn, plClass } from '@/lib/utils'
import type { ScenarioAnalysis } from '@/types'

const EXAMPLES = [
  'Recesión suave en Europa',
  'La Fed sube tipos 100 puntos básicos',
  'Rally de IA similar a 2023',
  'Crisis energética con petróleo a 150$',
] as const

export function ScenarioSimulator() {
  const [scenario, setScenario] = useState('')
  const [result, setResult] = useState<ScenarioAnalysis | null>(null)

  const { mutate, isPending, error } = useMutation({
    mutationFn: (text: string) => aiApi.analyzeScenario(text).then((r) => r.data),
    onSuccess: setResult,
  })

  const submit = () => {
    const trimmed = scenario.trim()
    if (!trimmed || isPending) return
    setResult(null)
    mutate(trimmed)
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">Describe un escenario macroeconómico hipotético</p>
        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="Ej. Subida de tipos de 200 puntos básicos en la zona euro…"
          rows={3}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setScenario(ex)}
              className="px-2.5 py-1 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={!scenario.trim() || isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" /> Simular impacto
          </button>
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Estimando el impacto en tu cartera…
        </div>
      )}

      {error && (
        <p className="text-xs text-loss flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {(error as Error).message || 'No se pudo simular el escenario'}
        </p>
      )}

      {result && <ScenarioResult result={result} />}

      <p className="text-xs text-muted-foreground italic">
        Estimación orientativa basada en análisis histórico. No constituye asesoramiento de inversión regulado.
      </p>
    </div>
  )
}

function ScenarioResult({ result }: { result: ScenarioAnalysis }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Impacto estimado en la cartera</p>
        <span className={cn('font-display text-lg font-600 tabular-nums', plClass(result.portfolio_impact_pct))}>
          {result.portfolio_impact_pct >= 0 ? '+' : ''}{result.portfolio_impact_pct.toFixed(2)}%
        </span>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">{result.scenario_summary}</p>

      {result.impact_by_position.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Impacto por posición</p>
          <div className="space-y-2">
            {result.impact_by_position
              .slice()
              .sort((a, b) => a.impact_pct - b.impact_pct)
              .map((p) => (
                <div key={p.ticker} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono font-medium">{p.ticker} <span className="text-muted-foreground font-sans font-normal">— {p.name}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.rationale}</p>
                  </div>
                  <span className={cn('flex-shrink-0 font-mono tabular-nums text-sm font-medium', plClass(p.impact_pct))}>
                    {p.impact_pct >= 0 ? '+' : ''}{p.impact_pct.toFixed(2)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {result.recommendations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Recomendaciones orientativas</p>
          <ul className="list-disc ml-4 space-y-0.5 text-sm">
            {result.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
