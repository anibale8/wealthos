import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { cn, formatCurrency } from '@/lib/utils'
import type { AssetClass, Position } from '@/types'

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Acciones',
  etf: 'ETFs',
  fund: 'Fondos',
  crypto: 'Cripto',
  bond: 'Bonos',
  real_estate: 'Inmuebles',
  cash: 'Liquidez',
}

const ASSET_CLASS_COLORS: Record<AssetClass, string> = {
  equity: '#3b82f6',
  etf: '#10b981',
  fund: '#14b8a6',
  crypto: '#f97316',
  bond: '#6b7280',
  real_estate: '#b45309',
  cash: '#22c55e',
}

type GroupBy = 'asset_class' | 'currency'

const GROUP_TABS: { key: GroupBy; label: string }[] = [
  { key: 'asset_class', label: 'Clase' },
  { key: 'currency', label: 'Divisa' },
]

const FALLBACK_COLORS = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ec4899', '#6b7280']

interface Slice {
  key: string
  label: string
  value: number
  color: string
}

interface AllocationDonutProps {
  positions: Position[]
  isLoading?: boolean
  onSelectClass?: (assetClass: string | null) => void
  selectedClass?: string | null
}

export function AllocationDonut({ positions, isLoading, onSelectClass, selectedClass }: AllocationDonutProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('asset_class')

  const slices = useMemo<Slice[]>(() => {
    const totals = new Map<string, number>()
    for (const p of positions) {
      const key = String(p[groupBy])
      totals.set(key, (totals.get(key) ?? 0) + p.current_value)
    }

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key, value], i) => ({
        key,
        value,
        label: groupBy === 'asset_class' ? (ASSET_CLASS_LABELS[key as AssetClass] ?? key) : key,
        color: groupBy === 'asset_class'
          ? (ASSET_CLASS_COLORS[key as AssetClass] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length])
          : FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      }))
  }, [positions, groupBy])

  const total = slices.reduce((sum, s) => sum + s.value, 0)

  function handleSliceClick(key: string) {
    if (groupBy !== 'asset_class' || !onSelectClass) return
    onSelectClass(selectedClass === key ? null : key)
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col h-full min-h-[320px]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Distribución</h3>
        <div className="flex items-center gap-1">
          {GROUP_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setGroupBy(tab.key)}
              className={cn(
                'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                groupBy === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Cargando…</div>
      ) : slices.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Añade activos para ver tu distribución.
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-4">
          <div className="w-1/2 h-full min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="58%"
                  outerRadius="85%"
                  paddingAngle={2}
                  onClick={(d) => handleSliceClick(d.key)}
                >
                  {slices.map((s) => (
                    <Cell
                      key={s.key}
                      fill={s.color}
                      className={cn(groupBy === 'asset_class' && 'cursor-pointer')}
                      opacity={selectedClass && selectedClass !== s.key ? 0.35 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul className="flex-1 space-y-1.5 text-sm">
            {slices.map((s) => {
              const pct = total ? (s.value / total) * 100 : 0
              const active = !selectedClass || selectedClass === s.key
              return (
                <li
                  key={s.key}
                  onClick={() => handleSliceClick(s.key)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-md px-1.5 py-1 transition-colors',
                    groupBy === 'asset_class' && 'cursor-pointer hover:bg-accent',
                    !active && 'opacity-40'
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums font-mono">
                    <span className="text-muted-foreground text-xs">{pct.toFixed(1)}%</span>
                    <span className="font-medium">{formatCurrency(s.value)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function DonutTooltip({ active, payload, total }: { active?: boolean; payload?: { payload: Slice }[]; total: number }) {
  if (!active || !payload?.length) return null
  const slice = payload[0].payload
  const pct = total ? (slice.value / total) * 100 : 0

  return (
    <div className="bg-popover border border-border rounded-lg shadow-md px-3 py-2 text-xs space-y-0.5">
      <p className="font-medium">{slice.label}</p>
      <p className="tabular-nums font-mono">{formatCurrency(slice.value)} · {pct.toFixed(1)}%</p>
    </div>
  )
}
