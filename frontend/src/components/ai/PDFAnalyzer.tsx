import { useCallback, useState } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, FileText, Upload } from 'lucide-react'
import { aiApi } from '@/lib/api'
import { cn, formatPct } from '@/lib/utils'
import type { FundAnalysis } from '@/types'

const MAX_SIZE = 10 * 1024 * 1024

export function PDFAnalyzer() {
  const [result, setResult] = useState<FundAnalysis | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: (file: File) => aiApi.analyzePdf(file).then((r) => r.data),
    onSuccess: (data) => setResult(data),
  })

  const onDrop = useCallback(
    (accepted: File[], fileRejections: FileRejection[]) => {
      setResult(null)
      reset()
      if (fileRejections.length > 0) {
        setRejection(fileRejections[0].errors[0]?.message ?? 'Archivo no válido')
        return
      }
      setRejection(null)
      const file = accepted[0]
      if (file) mutate(file)
    },
    [mutate, reset]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: MAX_SIZE,
    maxFiles: 1,
    disabled: isPending,
  })

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/40',
          isPending && 'opacity-60 cursor-wait'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium">
          {isDragActive ? 'Suelta el PDF aquí…' : 'Arrastra un KID o folleto de fondo, o haz clic para seleccionar'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">Solo PDF · máx. 10MB</p>
      </div>

      {rejection && (
        <p className="text-xs text-loss flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> {rejection}
        </p>
      )}

      {isPending && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Analizando documento con Claude… (puede tardar 10-20 segundos)
        </div>
      )}

      {error && (
        <p className="text-xs text-loss flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          {(error as Error).message || 'No se pudo analizar el PDF'}
        </p>
      )}

      {result && <FundAnalysisCard analysis={result} />}
    </div>
  )
}

function FundAnalysisCard({ analysis }: { analysis: FundAnalysis }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="font-display text-base font-600">{analysis.fund_name}</h3>
          {analysis.isin && <p className="text-xs text-muted-foreground font-mono">{analysis.isin}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="TER" value={analysis.ter != null ? `${analysis.ter.toFixed(2)}%` : '—'} />
        <Field label="Riesgo (SRRI)" value={analysis.risk_level != null ? `${analysis.risk_level}/7` : '—'} />
        <Field label="Rent. 1A" value={analysis.returns_1y != null ? formatPct(analysis.returns_1y) : '—'} />
        <Field label="Rent. 3A (anual.)" value={analysis.returns_3y != null ? formatPct(analysis.returns_3y) : '—'} />
      </div>

      {analysis.benchmark && (
        <p className="text-xs text-muted-foreground">
          Benchmark: <span className="text-foreground font-medium">{analysis.benchmark}</span>
        </p>
      )}

      <p className="text-sm leading-relaxed">{analysis.summary}</p>

      {analysis.top_holdings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Principales posiciones</p>
          <ul className="space-y-1">
            {analysis.top_holdings.map((h, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span>{h.name}</span>
                {h.weight_pct != null && <span className="tabular-nums text-muted-foreground">{h.weight_pct.toFixed(2)}%</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.key_risks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Riesgos clave</p>
          <ul className="list-disc ml-4 space-y-0.5 text-sm text-muted-foreground">
            {analysis.key_risks.map((risk, i) => <li key={i}>{risk}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-mono font-medium tabular-nums mt-0.5">{value}</p>
    </div>
  )
}
