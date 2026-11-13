import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PortfolioSummary, Position, Signal } from '@/types'

interface AppState {
  // Portfolio
  summary: PortfolioSummary | null
  positions: Position[]
  signals: Signal[]

  // UI
  theme: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean
  currency: string

  // Actions
  setSummary: (s: PortfolioSummary) => void
  setPositions: (p: Position[]) => void
  setSignals: (s: Signal[]) => void
  setTheme: (t: AppState['theme']) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setCurrency: (c: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      summary:          null,
      positions:        [],
      signals:          [],
      theme:            'system',
      sidebarCollapsed: false,
      currency:         'EUR',

      setSummary:    (summary)   => set({ summary }),
      setPositions:  (positions) => set({ positions }),
      setSignals:    (signals)   => set({ signals }),
      setTheme:      (theme)     => set({ theme }),
      toggleSidebar:      ()          => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setCurrency:   (currency)  => set({ currency }),
    }),
    {
      name: 'wealthos-store',
      partialize: (s) => ({ theme: s.theme, sidebarCollapsed: s.sidebarCollapsed, currency: s.currency }),
    }
  )
)
