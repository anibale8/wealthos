import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { portfolioApi } from '@/lib/api'
import { cn } from '@/lib/utils'

const BROKERS = [
  { value: 'auto',    label: 'Detectar automáticamente' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'degiro',  label: 'Degiro' },
  { value: 'ibkr',    label: 'Interactive Brokers' },
  { value: 'etoro',   label: 'eToro' },
  { value: 'generic', label: 'CSV genérico' },
]

type ParsedRow = {
  row_num: number
  ticker: string
  type: string
  date: string | null
  quantity: number
  price: number
  fees: number
  notes?: string | null
  status: 'ok' | 'error'
  message?: string | null
}

type PreviewResult = {
  broker_detected: string
  rows: ParsedRow[]
  total: number
  errors: number
}

interface ImportCSVModalProps {
  trigger: React.ReactNode
}

export function ImportCSVModal({ trigger }: ImportCSVModalProps) {
  const [open, setOpen] = useState(false)
  const [broker, setBroker] = useState('auto')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const previewMutation = useMutation({
    mutationFn: async ({ f, b }: { f: File; b: string }) => {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('broker', b)
      const res = await fetch('/api/portfolio/import/preview', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al analizar el archivo')
      }
      return res.json() as Promise<PreviewResult>
    },
    onSuccess: (data) => setPreview(data),
    onError: (err: Error) => toast.error(err.message),
  })

  const confirmMutation = useMutation({
    mutationFn: async (rows: ParsedRow[]) => {
      const res = await fetch('/api/portfolio/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Error al importar operaciones')
      }
      return res.json() as Promise<{ created: number; skipped: number }>
    },
    onSuccess: (data) => {
      toast.success(`Importadas ${data.created} operaciones${data.skipped > 0 ? ` (${data.skipped} omitidas)` : ''}`)
      queryClient.invalidateQueries()
      handleClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  function handleClose() {
    setOpen(false)
    setFile(null)
    setPreview(null)
    setBroker('auto')
  }

  function handleFile(f: File) {
    setFile(f)
    setPreview(null)
    previewMutation.mutate({ f, b: broker })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) handleFile(f)
    else toast.error('Solo se aceptan archivos CSV')
  }

  function handleBrokerChange(b: string) {
    setBroker(b)
    if (file) previewMutation.mutate({ f: file, b })
  }

  const validRows = preview?.rows.filter((r) => r.status === 'ok') ?? []

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true) }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar operaciones desde CSV</DialogTitle>
          <DialogDescription>
            Compatible con Revolut, Degiro, Interactive Brokers, eToro y CSV genérico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selector de broker */}
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Broker / formato</label>
            <div className="flex flex-wrap gap-1.5">
              {BROKERS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => handleBrokerChange(b.value)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    broker === b.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {previewMutation.isPending ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="w-6 h-6 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {file
                ? <span className="text-foreground font-medium">{file.name}</span>
                : 'Arrastra tu CSV aquí o haz clic para seleccionar'}
            </p>
            {file && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null) }}
                className="absolute top-2 right-2 p-1 rounded-md hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Resultado del preview */}
          {preview && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">
                    Broker detectado: <span className="font-medium text-foreground capitalize">{preview.broker_detected}</span>
                  </span>
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {validRows.length} OK
                  </span>
                  {preview.errors > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {preview.errors} errores
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden max-h-64 overflow-y-auto scrollbar-thin">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-muted-foreground uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Ticker</th>
                      <th className="px-3 py-2 text-left font-medium">Tipo</th>
                      <th className="px-3 py-2 text-left font-medium">Fecha</th>
                      <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                      <th className="px-3 py-2 text-right font-medium">Precio</th>
                      <th className="px-3 py-2 text-right font-medium">Fees</th>
                      <th className="px-3 py-2 text-left font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr
                        key={row.row_num}
                        className={cn(
                          'border-t border-border/60',
                          row.status === 'error' && 'bg-destructive/5'
                        )}
                      >
                        <td className="px-3 py-1.5 text-muted-foreground">{row.row_num}</td>
                        <td className="px-3 py-1.5 font-mono font-medium">{row.ticker || '—'}</td>
                        <td className="px-3 py-1.5 capitalize">{row.type}</td>
                        <td className="px-3 py-1.5 font-mono">{row.date ?? '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.quantity}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.price}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.fees}</td>
                        <td className="px-3 py-1.5">
                          {row.status === 'ok' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <span className="text-destructive" title={row.message ?? undefined}>
                              <AlertCircle className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancelar
            </button>
            {preview && validRows.length > 0 && (
              <button
                type="button"
                onClick={() => confirmMutation.mutate(validRows)}
                disabled={confirmMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {confirmMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Importar {validRows.length} operaciones
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
