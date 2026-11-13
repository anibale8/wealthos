import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useEffect } from 'react'

import { AppLayout }     from '@/components/layout/AppLayout'
import { useAppStore }   from '@/store'

// Pages (lazy-loadable later)
import { PortfolioPage } from '@/pages/PortfolioPage'
// import { TradingPage }   from '@/pages/TradingPage'  // Señales ocultas
import { AIPage }        from '@/pages/AIPage'
import { AnalysisPage }  from '@/pages/AnalysisPage'
import { AlertsPage }    from '@/pages/AlertsPage'
import { SettingsPage }  from '@/pages/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,       // 1 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useAppStore()

  useEffect(() => {
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark)
    root.classList.toggle('dark', isDark)
  }, [theme])

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index        element={<PortfolioPage />} />
              <Route path="trading"  element={<Navigate to="/" replace />} />
              <Route path="ai"       element={<AIPage />} />
              <Route path="analysis" element={<AnalysisPage />} />
              <Route path="alerts"   element={<AlertsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
