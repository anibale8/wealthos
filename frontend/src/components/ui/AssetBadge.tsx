import { cn } from '@/lib/utils'
import type { AssetClass } from '@/types'

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Acción',
  etf: 'ETF',
  fund: 'Fondo',
  crypto: 'Cripto',
  bond: 'Bono',
  real_estate: 'Inmueble',
  cash: 'Liquidez',
}

const ASSET_CLASS_CLASSES: Record<AssetClass, string> = {
  equity: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  etf: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  fund: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  crypto: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  bond: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  real_estate: 'bg-amber-700/10 text-amber-700 dark:text-amber-500',
  cash: 'bg-green-500/10 text-green-600 dark:text-green-400',
}

interface AssetBadgeProps {
  assetClass: AssetClass
  className?: string
}

export function AssetBadge({ assetClass, className }: AssetBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap',
        ASSET_CLASS_CLASSES[assetClass],
        className
      )}
    >
      {ASSET_CLASS_LABELS[assetClass]}
    </span>
  )
}
