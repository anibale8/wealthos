import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertTriangle, Plus, Sparkles, X } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { cn, formatPct } from '@/lib/utils'
import type { FundComparison } from '@/types'

const MAX_FUNDS = 4

export function FundComparator() {
  const [isins, setIsins] = useState<string[]>(['', ''])
  const [result, setResult] = useState<FundComparison | null>(null)

  const { mutate, isPending, error } = useMutation({
    mutationFn: (values: string[]) => aiApi.compareFunds(values).then((r) => r.data),
    onSuccess: setResult,
  })

  const validIsins = isins.map((i) => i.trim().toUpperCase()).filter(Boolean)
  const canSubmit = validIsins.length >= 1 && !isPending

  const updateIsin = (index: number, value: string) => {
    setIsins((prev) => prev.map((v, i) => (i === index ? value : v)))
  }

  const addField = () => setIsins((prev) => (prev.length < MAX_FUNDS ? [...prev, ''] : prev))
  const removeField = (index: number) => setIsins((prev) => prev.filter((_, i) => i !== index))

  const submit = () => {
    if (!canSubmit) return
    setResult(null)
    mutate(validIsins)
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">Introduce los ISIN de los fondos a comparar</p>
        <div className="space-y-2">
          {isins.map((value, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={value}
                onChange={(e) => updateIsin(i, e.target.value)}
                placeholder={`ISIN ${i + 1} (ej. IE00B4L5Y983)`}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {isins.length > 1 && (
                <button onClick={() => removeField(i)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Eliminar">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={addField}
            disabled={isins.length >= MAX_FUNDS}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir fondo (máx. {MAX_FUNDS})
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" /> Comparar
          </button>
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Claude está analizando los fondos…
        </div>
      )}

      {error && (
        <p className="text-xs text-loss flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {(error as Error).message || 'No se pudo completar la comparación'}
        </p>
      )}

      {result && <ComparisonResult result={result} />}
    </div>
  )
}

function ComparisonResult({ result }: { result: FundComparison }) {
  const best = pickBest(result)

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4 animate-fade-in">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {result.funds.map((f) => (
          <div key={f.isin} className={cn('rounded-lg border p-3 relative', f.isin === best ? 'border-primary bg-primary/5' : 'border-border bg-muted/30')}>
            {f.isin === best && (
              <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                Recomendado
              </span>
            )}
            <p className="text-sm font-medium truncate">{f.name}</p>
            <p className="text-xs text-muted-foreground font-mono mb-2">{f.isin}</p>
            <dl className="space-y-0.5 text-xs">
              <Row label="TER" value={f.ter != null ? `${f.ter.toFixed(2)}%` : '—'} />
              <Row label="Riesgo" value={f.risk_level != null ? `${f.risk_level}/7` : '—'} />
              <Row label="Categoría" value={f.category ?? '—'} />
              <Row label="Rent. 1A" value={f.returns_1y != null ? formatPct(f.returns_1y) : '—'} />
              <Row label="Rent. 3A" value={f.returns_3y != null ? formatPct(f.returns_3y) : '—'} />
            </dl>
          </div>
        ))}
      </div>

      {result.overlap_pct != null && (
        <p className="text-sm">
          Solapamiento estimado entre carteras: <span className="font-mono font-medium">{result.overlap_pct.toFixed(1)}%</span>
        </p>
      )}

      <div className="text-sm leading-relaxed [&_table]:w-full [&_table]:text-xs [&_table]:my-2 [&_th]:text-left [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_td]:border-t [&_td]:border-border/40 [&_thead]:border-b [&_thead]:border-border/60">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.comparison_table}</ReactMarkdown>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Análisis y recomendación</p>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.recommendation}</p>
      </div>
    </div>
  )
}

function pickBest(result: FundComparison): string | null {
  const withTer = result.funds.filter((f) => f.ter != null)
  if (withTer.length === 0) return null
  return withTer.reduce((best, f) => (f.ter! < best.ter! ? f : best)).isin
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums truncate">{value}</dd>
    </div>
  )
}
