import { cn } from '@/lib/utils'

const HORIZONS = [
  { label: '7 días', value: 7 },
  { label: '30 días', value: 30 },
  { label: '90 días', value: 90 },
] as const

interface HorizonSelectorProps {
  value: number
  onChange: (horizon: number) => void
  className?: string
}

export function HorizonSelector({ value, onChange, className }: HorizonSelectorProps) {
  return (
    <div className={cn('inline-flex items-center gap-1 p-1 rounded-lg bg-muted', className)}>
      {HORIZONS.map((h) => (
        <button
          key={h.value}
          onClick={() => onChange(h.value)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            value === h.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {h.label}
        </button>
      ))}
    </div>
  )
}
