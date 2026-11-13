import { useEffect, useRef } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import {
  LayoutDashboard, Bot, BarChart3,
  Bell, Settings, ChevronLeft, Wallet,
} from 'lucide-react'

const MOBILE_BREAKPOINT = '(max-width: 768px)'

/** Colapsa la sidebar automáticamente al entrar en viewport móvil, y la restaura
 * al volver a desktop — sin pisar una expansión manual del usuario en pantallas grandes. */
function useAutoCollapseSidebar() {
  const { sidebarCollapsed, setSidebarCollapsed } = useAppStore()
  const collapsedByMediaQuery = useRef(false)

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT)

    const apply = (isMobile: boolean) => {
      if (isMobile && !sidebarCollapsed) {
        collapsedByMediaQuery.current = true
        setSidebarCollapsed(true)
      } else if (!isMobile && collapsedByMediaQuery.current) {
        collapsedByMediaQuery.current = false
        setSidebarCollapsed(false)
      }
    }

    apply(mql.matches)
    const listener = (e: MediaQueryListEvent) => apply(e.matches)
    mql.addEventListener('change', listener)
    return () => mql.removeEventListener('change', listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

const navItems = [
  { to: '/',          icon: LayoutDashboard, label: 'Portfolio'  },
  // Señales ocultas (módulo ML apagado). Para recuperarlas, descomentar esta línea y la ruta en App.tsx.
  // { to: '/trading',   icon: TrendingUp,      label: 'Señales'    },
  { to: '/ai',        icon: Bot,             label: 'IA Asesor'  },
  { to: '/analysis',  icon: BarChart3,       label: 'Análisis'   },
  { to: '/alerts',    icon: Bell,            label: 'Alertas'    },
]

export function AppLayout() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  useAutoCollapseSidebar()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'relative flex flex-col border-r border-border bg-card transition-all duration-200 ease-in-out shrink-0',
          sidebarCollapsed ? 'w-16' : 'w-[240px]'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center gap-3 px-4 h-16 border-b border-border shrink-0',
          sidebarCollapsed && 'justify-center px-0'
        )}>
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4 text-primary-foreground" />
          </div>
          {!sidebarCollapsed && (
            <span className="font-display font-700 text-[15px] tracking-tight">
              WealthOS
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto scrollbar-thin">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  'text-muted-foreground hover:text-foreground hover:bg-accent',
                  isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
                  sidebarCollapsed && 'justify-center px-0'
                )
              }
              title={sidebarCollapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2 pb-4 space-y-0.5 border-t border-border pt-4">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
                isActive && 'bg-primary/10 text-primary',
                sidebarCollapsed && 'justify-center px-0'
              )
            }
            title={sidebarCollapsed ? 'Ajustes' : undefined}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>Ajustes</span>}
          </NavLink>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleSidebar}
          className={cn(
            'absolute -right-3 top-[72px] w-6 h-6 rounded-full border border-border bg-card',
            'flex items-center justify-center text-muted-foreground hover:text-foreground',
            'transition-colors shadow-sm z-10'
          )}
          aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          <ChevronLeft className={cn('w-3 h-3 transition-transform', sidebarCollapsed && 'rotate-180')} />
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin">
        <Outlet />
      </main>
    </div>
  )
}
