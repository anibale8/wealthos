import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { Moon, Sun, Monitor } from 'lucide-react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  const { theme, setTheme } = useAppStore()

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
  }

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor

  return (
    <header className={cn('flex items-center justify-between px-6 h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10', className)}>
      <div>
        <h1 className="font-display text-[17px] font-600 tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={cycleTheme}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Cambiar tema"
        >
          <ThemeIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
