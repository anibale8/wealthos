import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, BrainCircuit, Sparkles } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { BiasFinding, BiasSeverity } from '@/types'

const SEVERITY_CLASSES: Record<BiasSeverity, string> = {
  leve: 'bg-signal-hold/10 text-signal-hold border-signal-hold/30',
  moderado: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
  alto: 'bg-loss/10 text-loss border-loss/30',
}

const SEVERITY_LABELS: Record<BiasSeverity, string> = {
  leve: 'Leve',
  moderado: 'Moderado',
  alto: 'Alto',
}

export function BiasDetector() {
  const { data, mutate, isPending, error, isSuccess } = useMutation({
    mutationFn: () => aiApi.detectBiases().then((r) => r.data),
  })

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center flex-shrink-0">
            <BrainCircuit className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-sm font-medium">Detector de sesgos cognitivos</p>
            <p className="text-xs text-muted-foreground">Claude analiza tu historial de operaciones en busca de patrones de comportamiento</p>
          </div>
        </div>
        <button
          onClick={() => mutate()}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          {isPending ? 'Analizando…' : 'Analizar mis decisiones'}
        </button>
      </div>

      {isPending && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Revisando tu historial de operaciones…
        </div>
      )}

      {error && (
        <p className="text-xs text-loss flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {(error as Error).message || 'No se pudo completar el análisis'}
        </p>
      )}

      {isSuccess && data.biases_detected.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No se han detectado sesgos significativos en tu historial de operaciones. Sigue así.
        </p>
      )}

      {isSuccess && data.biases_detected.length > 0 && (
        <div className="space-y-3">
          {data.biases_detected.map((bias, i) => <BiasCard key={i} bias={bias} />)}
        </div>
      )}
    </div>
  )
}

function BiasCard({ bias }: { bias: BiasFinding }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-600">{bias.type}</p>
        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium border', SEVERITY_CLASSES[bias.severity])}>
          {SEVERITY_LABELS[bias.severity]}
        </span>
      </div>
      <p className="text-sm leading-relaxed">{bias.description}</p>
      <div className="bg-muted/40 rounded-lg p-2.5">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">Evidencia</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{bias.evidence}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-0.5">Recomendación</p>
        <p className="text-sm leading-relaxed">{bias.recommendation}</p>
      </div>
    </div>
  )
}
