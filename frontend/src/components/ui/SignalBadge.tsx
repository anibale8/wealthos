import { cn } from '@/lib/utils'
import type { Signal } from '@/types'

interface SignalBadgeProps {
  action: Signal['action']
  confidence?: number
  size?: 'sm' | 'md'
  className?: string
}

const config = {
  BUY:  { label: 'Comprar', bg: 'bg-profit/10',  text: 'text-profit',  border: 'border-profit/20'  },
  HOLD: { label: 'Mantener', bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800' },
  SELL: { label: 'Vender', bg: 'bg-loss/10',   text: 'text-loss',    border: 'border-loss/20'    },
}

export function SignalBadge({ action, confidence, size = 'sm', className }: SignalBadgeProps) {
  const { label, bg, text, border } = config[action]

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border font-medium tabular-nums',
      bg, text, border,
      size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      className
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full', {
        'bg-profit': action === 'BUY',
        'bg-yellow-500': action === 'HOLD',
        'bg-loss': action === 'SELL',
      })} />
      {label}
      {confidence !== undefined && (
        <span className="opacity-70">{Math.round(confidence * 100)}%</span>
      )}
    </span>
  )
}
