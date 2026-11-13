import type { ReactNode } from 'react'
import { Bell, Inbox, Receipt, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'

const VARIANT_ICONS = {
  positions: Inbox,
  transactions: Receipt,
  signals: Radio,
  alerts: Bell,
} as const

interface EmptyStateProps {
  variant?: keyof typeof VARIANT_ICONS
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ variant = 'positions', title, description, action, className }: EmptyStateProps) {
  const Icon = VARIANT_ICONS[variant]

  return (
    <div className={cn('flex flex-col items-center justify-center text-center gap-2 py-12 px-6', className)}>
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-1">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
