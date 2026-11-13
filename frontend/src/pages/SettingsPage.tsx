import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, KeyRound, Loader2, Monitor, Moon, RotateCcw, Sun, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/PageHeader'
import { settingsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'

const CURRENCIES = [
  { value: 'EUR', label: 'Euro', symbol: '€' },
  { value: 'USD', label: 'US Dollar', symbol: '$' },
  { value: 'GBP', label: 'British Pound', symbol: '£' },
  { value: 'CHF', label: 'Swiss Franc', symbol: 'Fr' },
]

const THEMES = [
  { value: 'light' as const,  label: 'Claro',   icon: Sun },
  { value: 'dark'  as const,  label: 'Oscuro',  icon: Moon },
  { value: 'system' as const, label: 'Sistema', icon: Monitor },
]

export function SettingsPage() {
  const { theme, setTheme, currency, setCurrency } = useAppStore()
  const queryClient = useQueryClient()

  const { data: serverSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getSettings().then((r) => r.data),
  })

  const seedMutation = useMutation({
    mutationFn: () => settingsApi.seedDemo().then((r) => r.data),
    onSuccess: (data) => {
      toast.success(`Demo cargado: ${data.assets} activos, ${data.transactions} operaciones`)
      queryClient.invalidateQueries()
    },
  })

  const [resetStep, setResetStep] = useState<'idle' | 'confirm'>('idle')
  const resetMutation = useMutation({
    mutationFn: () => settingsApi.resetData().then((r) => r.data),
    onSuccess: () => {
      toast.success('Todos los datos han sido eliminados')
      setResetStep('idle')
      queryClient.invalidateQueries()
    },
  })

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Ajustes" subtitle="Personaliza tu experiencia en WealthOS" />

      <div className="flex-1 p-6 space-y-6 overflow-auto max-w-2xl">

        {/* Apariencia */}
        <Section title="Apariencia">
          <div className="flex gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                  theme === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
                {theme === value && <Check className="w-3.5 h-3.5 ml-0.5" />}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            El modo Sistema sigue la preferencia de tu sistema operativo.
          </p>
        </Section>

        {/* Moneda base */}
        <Section title="Moneda base">
          <div className="flex flex-wrap gap-2">
            {CURRENCIES.map(({ value, label, symbol }) => (
              <button
                key={value}
                onClick={() => setCurrency(value)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                  currency === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                )}
              >
                <span className="font-mono">{symbol}</span>
                {label}
                {currency === value && <Check className="w-3.5 h-3.5 ml-0.5" />}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Usada para mostrar el valor total de la cartera y los KPIs.
          </p>
        </Section>

        {/* API Key de Anthropic */}
        <Section title="IA — Anthropic API Key">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
            <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
            {serverSettings === undefined ? (
              <span className="text-sm text-muted-foreground">Comprobando...</span>
            ) : serverSettings.anthropic_key_configured ? (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <span className="text-sm">API key configurada correctamente</span>
              </div>
            ) : (
              <div>
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                  API key no configurada — el módulo IA no funcionará
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Añade <code className="font-mono bg-muted px-1 rounded">ANTHROPIC_API_KEY=sk-ant-...</code> al
                  archivo <code className="font-mono bg-muted px-1 rounded">backend/.env</code> y reinicia el servidor.
                </p>
              </div>
            )}
          </div>
        </Section>

        {/* Versión */}
        {serverSettings && (
          <Section title="Versión">
            <p className="text-sm text-muted-foreground font-mono">WealthOS v{serverSettings.version}</p>
          </Section>
        )}

        {/* Zona de peligro */}
        <Section title="Zona de peligro" danger>
          <div className="space-y-4">
            {/* Seed demo */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Cargar datos de demo</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Carga 5 activos (AAPL, MSFT, IBE.MC, VWRL.L, BTC-USD) con 2 años de historial y señales de prueba.
                  No borra datos existentes.
                </p>
              </div>
              <button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50 shrink-0"
              >
                {seedMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RotateCcw className="w-3.5 h-3.5" />}
                Cargar demo
              </button>
            </div>

            <div className="border-t border-border/60" />

            {/* Reset */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-destructive">Eliminar todos los datos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Borra activos, operaciones, snapshots, señales y alertas. Esta acción no se puede deshacer.
                </p>
              </div>
              {resetStep === 'idle' ? (
                <button
                  onClick={() => setResetStep('confirm')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/40 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Resetear
                </button>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-destructive font-medium">¿Seguro?</span>
                  <button
                    onClick={() => resetMutation.mutate()}
                    disabled={resetMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
                  >
                    {resetMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Sí, eliminar
                  </button>
                  <button
                    onClick={() => setResetStep('idle')}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        </Section>

      </div>
    </div>
  )
}

function Section({
  title,
  danger = false,
  children,
}: {
  title: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn(
      'rounded-lg border p-5 space-y-3',
      danger ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'
    )}>
      <h2 className={cn(
        'text-sm font-semibold',
        danger ? 'text-destructive' : 'text-foreground'
      )}>
        {title}
      </h2>
      {children}
    </div>
  )
}
