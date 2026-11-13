import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { useAddTransaction } from '@/hooks/usePortfolio'
import { cn, formatCurrency } from '@/lib/utils'
import type { Position, TransactionType } from '@/types'

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'buy',      label: 'Compra'    },
  { value: 'sell',     label: 'Venta'     },
  { value: 'dividend', label: 'Dividendo' },
  { value: 'split',    label: 'Split'     },
  { value: 'fee',      label: 'Comisión'  },
]

interface AddTransactionModalProps {
  position: Position
  trigger: React.ReactNode
}

export function AddTransactionModal({ position, trigger }: AddTransactionModalProps) {
  const [open, setOpen] = useState(false)
  const addTransaction = useAddTransaction()

  const today = new Date().toISOString().slice(0, 10)
  const [type, setType]       = useState<TransactionType>('buy')
  const [quantity, setQty]    = useState('')
  const [price, setPrice]     = useState('')
  const [fees, setFees]       = useState('0')
  const [date, setDate]       = useState(today)
  const [notes, setNotes]     = useState('')

  const qty  = Number(quantity)
  const prc  = Number(price)
  const fee  = Number(fees) || 0
  const total = qty > 0 && prc > 0 ? qty * prc + (type === 'sell' ? -fee : fee) : 0

  const overSell = type === 'sell' && qty > position.quantity
  const isValid  = qty > 0 && prc > 0 && date.length > 0 && !overSell

  function reset() {
    setType('buy'); setQty(''); setPrice(''); setFees('0')
    setDate(today); setNotes('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    addTransaction.mutate(
      { ticker: position.ticker, type, quantity: qty, price: prc, fees: fee, date, notes: notes || null },
      {
        onSuccess: () => {
          toast.success(`Operación registrada en ${position.ticker}`)
          setOpen(false)
          reset()
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva operación — <span className="font-mono">{position.ticker}</span></DialogTitle>
          <DialogDescription>{position.name} · {position.quantity.toLocaleString('es-ES')} uds. en cartera</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo */}
          <div className="flex gap-1.5 flex-wrap">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                  type === t.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Campos */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={type === 'split' ? 'Ratio (nuevo/antiguo)' : 'Cantidad'}>
              <input
                type="number" min="0" step="any" value={quantity}
                onChange={(e) => setQty(e.target.value)}
                className={cn(inputCls, overSell && 'border-red-400 focus:ring-red-400/40')}
                placeholder={type === 'split' ? '2' : '10'}
              />
              {overSell && (
                <span className="text-xs text-red-500 mt-0.5">Máx. {position.quantity.toLocaleString('es-ES')} uds.</span>
              )}
            </Field>

            <Field label={type === 'dividend' ? 'Importe por ud.' : 'Precio por unidad'}>
              <input
                type="number" min="0" step="any" value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputCls} placeholder="150.00"
              />
            </Field>

            {type !== 'split' && (
              <Field label="Comisiones">
                <input type="number" min="0" step="any" value={fees}
                  onChange={(e) => setFees(e.target.value)} className={inputCls} />
              </Field>
            )}

            <Field label="Fecha">
              <input type="date" value={date} max={today}
                onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>

            <Field label="Notas (opcional)" className="col-span-2">
              <input value={notes} onChange={(e) => setNotes(e.target.value)}
                className={inputCls} placeholder="Descripción opcional..." />
            </Field>
          </div>

          {total !== 0 && (
            <p className="text-sm text-muted-foreground">
              {type === 'sell' ? 'Ingreso neto' : type === 'dividend' ? 'Dividendo total' : 'Coste total'}:{' '}
              <span className="font-mono font-medium text-foreground tabular-nums">
                {formatCurrency(Math.abs(total), position.currency)}
              </span>
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={!isValid || addTransaction.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {addTransaction.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Registrar operación
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 tabular-nums'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      {children}
    </label>
  )
}
