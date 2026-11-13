import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from 'lucide-react'
import { AssetBadge } from '@/components/ui/AssetBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { AddTransactionModal } from '@/components/portfolio/AddTransactionModal'
import { cn, formatCurrency, formatPct, plClass } from '@/lib/utils'
import type { Position } from '@/types'

type SortKey =
  | 'ticker' | 'name' | 'asset_class' | 'quantity' | 'avg_cost' | 'current_price'
  | 'current_value' | 'pnl' | 'pnl_pct' | 'weight' | 'daily_change_pct'

interface Column {
  key: SortKey
  label: string
  align?: 'left' | 'right'
}

const COLUMNS: Column[] = [
  { key: 'ticker', label: 'Ticker' },
  { key: 'name', label: 'Nombre' },
  { key: 'asset_class', label: 'Clase' },
  { key: 'quantity', label: 'Cantidad', align: 'right' },
  { key: 'avg_cost', label: 'Coste medio', align: 'right' },
  { key: 'current_price', label: 'Precio', align: 'right' },
  { key: 'current_value', label: 'Valor', align: 'right' },
  { key: 'pnl', label: 'P&L', align: 'right' },
  { key: 'pnl_pct', label: 'P&L %', align: 'right' },
  { key: 'weight', label: 'Peso', align: 'right' },
  { key: 'daily_change_pct', label: 'Hoy', align: 'right' },
]

interface PositionsTableProps {
  positions: Position[]
  onSelect?: (position: Position) => void
}

export function PositionsTable({ positions, onSelect }: PositionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('weight')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const copy = [...positions]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [positions, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (positions.length === 0) {
    return (
      <EmptyState
        variant="positions"
        title="Aún no tienes posiciones"
        description="Añade tu primer activo para empezar a seguir tu cartera."
      />
    )
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className={cn(
                  'px-4 py-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors',
                  col.align === 'right' ? 'text-right' : 'text-left'
                )}
              >
                <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                  {col.label}
                  <SortIcon active={sortKey === col.key} dir={sortDir} />
                </span>
              </th>
            ))}
            <th className="px-2 py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr
              key={p.id}
              onClick={() => onSelect?.(p)}
              className="border-b border-border/60 last:border-0 hover:bg-accent/50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-2.5 font-mono font-medium tabular-nums">{p.ticker}</td>
              <td className="px-4 py-2.5 text-muted-foreground max-w-[220px] truncate">{p.name}</td>
              <td className="px-4 py-2.5"><AssetBadge assetClass={p.asset_class} /></td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono">{p.quantity.toLocaleString('es-ES')}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono">{formatCurrency(p.avg_cost, p.currency)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono">{formatCurrency(p.current_price, p.currency)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono font-medium">{formatCurrency(p.current_value, p.currency)}</td>
              <td className={cn('px-4 py-2.5 text-right tabular-nums font-mono font-medium', plClass(p.pnl))}>
                {formatCurrency(p.pnl, p.currency)}
              </td>
              <td className={cn('px-4 py-2.5 text-right tabular-nums font-mono', plClass(p.pnl_pct))}>
                {formatPct(p.pnl_pct)}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums font-mono text-muted-foreground">{p.weight.toFixed(1)}%</td>
              <td className={cn('px-4 py-2.5 text-right tabular-nums font-mono', plClass(p.daily_change_pct))}>
                {formatPct(p.daily_change_pct)}
              </td>
              <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                <AddTransactionModal
                  position={p}
                  trigger={
                    <button
                      className="flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                      title={`Añadir operación en ${p.ticker}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 opacity-40" />
  return dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
}
