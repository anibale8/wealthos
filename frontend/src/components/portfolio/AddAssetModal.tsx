import { useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { AssetBadge } from '@/components/ui/AssetBadge'
import { useAssetSearch } from '@/hooks/useAssetSearch'
import { useAddTransaction } from '@/hooks/usePortfolio'
import { cn, formatCurrency } from '@/lib/utils'
import type { AssetClass, AssetSearchResult, TransactionType } from '@/types'

type Step = 'search' | 'confirm' | 'transaction'

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'buy', label: 'Compra' },
  { value: 'sell', label: 'Venta' },
  { value: 'dividend', label: 'Dividendo' },
  { value: 'split', label: 'Split' },
  { value: 'fee', label: 'Comisión' },
]

interface AddAssetModalProps {
  trigger: React.ReactNode
}

export function AddAssetModal({ trigger }: AddAssetModalProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('search')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<AssetSearchResult | null>(null)

  const { data: results = [], isFetching } = useAssetSearch(query)
  const addTransaction = useAddTransaction()

  function reset() {
    setStep('search')
    setQuery('')
    setSelected(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function selectAsset(asset: AssetSearchResult) {
    setSelected(asset)
    setStep('confirm')
  }

  function handleSubmit(values: { quantity: number; price: number; fees: number; date: string; notes: string }) {
    if (!selected) return
    addTransaction.mutate(
      {
        ticker: selected.ticker,
        type: 'buy',
        quantity: values.quantity,
        price: values.price,
        fees: values.fees,
        date: values.date,
        notes: values.notes || null,
        asset_name: selected.name,
        asset_class: selected.asset_class,
        asset_exchange: selected.exchange ?? undefined,
        asset_currency: selected.currency ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${selected.ticker} añadido a tu cartera`)
          handleOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {step === 'search' && (
          <>
            <DialogHeader>
              <DialogTitle>Añadir activo</DialogTitle>
              <DialogDescription>Busca por ticker, ISIN o nombre.</DialogDescription>
            </DialogHeader>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="AAPL, Apple, US0378331005..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {isFetching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            <div className="mt-3 max-h-72 overflow-y-auto scrollbar-thin space-y-1">
              {query.trim().length < 2 && (
                <p className="text-sm text-muted-foreground px-1 py-4 text-center">
                  Escribe al menos 2 caracteres para buscar.
                </p>
              )}
              {query.trim().length >= 2 && !isFetching && results.length === 0 && (
                <p className="text-sm text-muted-foreground px-1 py-4 text-center">
                  No se encontraron activos para «{query}».
                </p>
              )}
              {results.map((asset) => (
                <button
                  key={asset.ticker}
                  onClick={() => selectAsset(asset)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium font-mono">{asset.ticker}</p>
                    <p className="text-xs text-muted-foreground truncate">{asset.name}</p>
                  </div>
                  <AssetBadge assetClass={(asset.asset_class as AssetClass) ?? 'equity'} />
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'confirm' && selected && (
          <ConfirmStep
            asset={selected}
            onBack={() => setStep('search')}
            onConfirm={() => setStep('transaction')}
          />
        )}

        {step === 'transaction' && selected && (
          <TransactionStep
            asset={selected}
            isSubmitting={addTransaction.isPending}
            onBack={() => setStep('confirm')}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConfirmStep({
  asset, onBack, onConfirm,
}: { asset: AssetSearchResult; onBack: () => void; onConfirm: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirmar activo</DialogTitle>
        <DialogDescription>Verifica que este es el activo que buscas.</DialogDescription>
      </DialogHeader>

      <div className="rounded-lg border border-border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-mono font-medium">{asset.ticker}</span>
          <AssetBadge assetClass={(asset.asset_class as AssetClass) ?? 'equity'} />
        </div>
        <p className="text-sm text-muted-foreground">{asset.name}</p>
        <div className="flex gap-4 text-xs text-muted-foreground pt-1">
          {asset.exchange && <span>Mercado: {asset.exchange}</span>}
          {asset.currency && <span>Divisa: {asset.currency}</span>}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
          Atrás
        </button>
        <button onClick={onConfirm} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          Continuar
        </button>
      </div>
    </>
  )
}

interface TransactionFormValues {
  quantity: number
  price: number
  fees: number
  date: string
  notes: string
}

function TransactionStep({
  asset, isSubmitting, onBack, onSubmit,
}: {
  asset: AssetSearchResult
  isSubmitting: boolean
  onBack: () => void
  onSubmit: (values: TransactionFormValues) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [fees, setFees] = useState('0')
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState('')

  const qty = Number(quantity)
  const prc = Number(price)
  const fee = Number(fees) || 0
  const total = qty > 0 && prc > 0 ? qty * prc + fee : 0
  const isValid = qty > 0 && prc > 0 && date.length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    onSubmit({ quantity: qty, price: prc, fees: fee, date, notes })
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Primera operación — {asset.ticker}</DialogTitle>
        <DialogDescription>Registra la compra inicial para empezar a seguir esta posición.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad">
          <input
            type="number" min="0" step="any" value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass} placeholder="10"
          />
        </Field>
        <Field label="Precio por unidad">
          <input
            type="number" min="0" step="any" value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={inputClass} placeholder="150.00"
          />
        </Field>
        <Field label="Comisiones">
          <input
            type="number" min="0" step="any" value={fees}
            onChange={(e) => setFees(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Fecha">
          <input
            type="date" value={date} max={today}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Notas (opcional)" className="col-span-2">
          <input
            value={notes} onChange={(e) => setNotes(e.target.value)}
            className={inputClass} placeholder="Compra inicial..."
          />
        </Field>
      </div>

      {total > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Coste total: <span className="font-mono font-medium text-foreground tabular-nums">{formatCurrency(total)}</span>
        </p>
      )}

      <div className="flex justify-end gap-2 mt-5">
        <button type="button" onClick={onBack} className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
          Atrás
        </button>
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Añadir a la cartera
        </button>
      </div>
    </form>
  )
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 tabular-nums'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      {children}
    </label>
  )
}
