import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDeleteTransaction } from '@/hooks/usePortfolio'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Position, Transaction, TransactionType } from '@/types'

const TYPE_LABELS: Record<TransactionType, string> = {
  buy: 'Compra',
  sell: 'Venta',
  dividend: 'Dividendo',
  split: 'Split',
  fee: 'Comisión',
}

const TYPE_CLASSES: Record<TransactionType, string> = {
  buy: 'bg-profit/10 text-profit',
  sell: 'bg-loss/10 text-loss',
  dividend: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  split: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  fee: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
}

const TYPE_FILTERS: { value: TransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'buy', label: 'Compras' },
  { value: 'sell', label: 'Ventas' },
  { value: 'dividend', label: 'Dividendos' },
  { value: 'split', label: 'Splits' },
  { value: 'fee', label: 'Comisiones' },
]

interface TransactionHistoryProps {
  transactions: Transaction[]
  positions: Position[]
  isLoading?: boolean
}

export function TransactionHistory({ transactions, positions, isLoading }: TransactionHistoryProps) {
  const [tickerFilter, setTickerFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<TransactionType | 'all'>('all')
  const [confirmingId, setConfirmingId] = useState<number | null>(null)

  const deleteTransaction = useDeleteTransaction()
  const assetById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions])
  const tickers = useMemo(
    () => Array.from(new Set(positions.map((p) => p.ticker))).sort(),
    [positions]
  )

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => typeFilter === 'all' || t.type === typeFilter)
      .filter((t) => tickerFilter === 'all' || assetById.get(t.asset_id)?.ticker === tickerFilter)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, typeFilter, tickerFilter, assetById])

  function handleDelete(id: number) {
    deleteTransaction.mutate(id, {
      onSuccess: () => {
        toast.success('Operación eliminada')
        setConfirmingId(null)
      },
    })
  }

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Historial de operaciones ({filtered.length})</h2>
        <div className="flex items-center gap-2">
          <select
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            className="px-2 py-1 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">Todos los activos</option>
            {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TransactionType | 'all')}
            className="px-2 py-1 rounded-md border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {TYPE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-4 text-sm text-muted-foreground">Cargando…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="transactions"
          title="Sin operaciones que mostrar"
          description={
            transactions.length === 0
              ? 'Las operaciones que registres aparecerán aquí.'
              : 'No hay operaciones que coincidan con los filtros seleccionados.'
          }
        />
      ) : (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                <th className="px-4 py-2 text-left font-medium">Fecha</th>
                <th className="px-4 py-2 text-left font-medium">Activo</th>
                <th className="px-4 py-2 text-left font-medium">Tipo</th>
                <th className="px-4 py-2 text-right font-medium">Cantidad</th>
                <th className="px-4 py-2 text-right font-medium">Precio</th>
                <th className="px-4 py-2 text-right font-medium">Comisiones</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => {
                const asset = assetById.get(tx.asset_id)
                const total = tx.quantity * tx.price + tx.fees
                const confirming = confirmingId === tx.id

                return (
                  <tr key={tx.id} className="border-b border-border/60 last:border-0 hover:bg-accent/50 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{formatDate(tx.date)}</td>
                    <td className="px-4 py-2.5 font-mono font-medium">{asset?.ticker ?? `#${tx.asset_id}`}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', TYPE_CLASSES[tx.type])}>
                        {TYPE_LABELS[tx.type]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono">{tx.quantity.toLocaleString('es-ES')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono">{formatCurrency(tx.price, asset?.currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground">{formatCurrency(tx.fees, asset?.currency)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono font-medium">{formatCurrency(total, asset?.currency)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {confirming ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDelete(tx.id)}
                            disabled={deleteTransaction.isPending}
                            className="px-2 py-1 rounded-md text-xs font-medium bg-loss text-white hover:bg-loss/90 transition-colors disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(tx.id)}
                          className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-loss hover:bg-loss/10 transition-colors"
                          aria-label="Eliminar operación"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
