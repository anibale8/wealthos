import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellOff, Loader2, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { useAlerts, useCreateAlert, useDeleteAlert, useToggleAlert } from '@/hooks/useAlerts'
import { usePositions } from '@/hooks/usePortfolio'
import { cn } from '@/lib/utils'
import type { Alert, AlertCreate, AlertType, AssetClass } from '@/types'

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  price: 'Precio',
  signal: 'Señal ML',
  rebalance: 'Desviación de rebalanceo',
}

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  equity: 'Acciones',
  etf: 'ETFs',
  fund: 'Fondos',
  crypto: 'Cripto',
  bond: 'Bonos',
  real_estate: 'Inmuebles',
  cash: 'Liquidez',
}

const PRICE_OPERATOR_LABELS: Record<string, string> = {
  gt: 'sube por encima de',
  gte: 'alcanza o supera',
  lt: 'baja por debajo de',
  lte: 'cae a o por debajo de',
}

function describeCondition(alert: Alert): string {
  try {
    const condition = JSON.parse(alert.condition_json)
    if (alert.type === 'price') {
      const op = PRICE_OPERATOR_LABELS[condition.operator] ?? condition.operator
      return `${alert.ticker} ${op} ${condition.value}`
    }
    if (alert.type === 'signal') {
      return `${alert.ticker} genera señal ${condition.action} con confianza ≥ ${Math.round((condition.min_confidence ?? 0) * 100)}%`
    }
    if (alert.type === 'rebalance') {
      const label = ASSET_CLASS_LABELS[condition.asset_class as AssetClass] ?? condition.asset_class
      return `${label} se desvía más de ${condition.max_deviation_pct} pp del objetivo (${condition.target_pct}%)`
    }
  } catch {
    /* condición mal formada — se muestra el JSON crudo */
  }
  return alert.condition_json
}

function formatTriggered(iso: string | null): string {
  if (!iso) return 'Nunca disparada'
  return `Disparada ${new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))}`
}

function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  const request = async () => {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setPermission(result)
  }

  return { permission, request }
}

/** Sondea las alertas y dispara una notificación del navegador cuando detecta
 * un `last_triggered` más reciente que el visto en la sesión anterior. */
function useAlertNotifications(alerts: Alert[] | undefined, enabled: boolean) {
  const seen = useRef<Map<number, string | null>>(new Map())
  const initialized = useRef(false)

  useEffect(() => {
    if (!alerts) return

    if (!initialized.current) {
      for (const alert of alerts) seen.current.set(alert.id, alert.last_triggered)
      initialized.current = true
      return
    }

    for (const alert of alerts) {
      const previous = seen.current.get(alert.id)
      if (alert.last_triggered && alert.last_triggered !== previous) {
        if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('WealthOS — Alerta disparada', {
            body: `${alert.name}: ${describeCondition(alert)}`,
            tag: `wealthos-alert-${alert.id}`,
          })
        }
      }
      seen.current.set(alert.id, alert.last_triggered)
    }
  }, [alerts, enabled])
}

export function AlertsPage() {
  const { data: alerts = [], isLoading } = useAlerts()
  const { data: positions = [] } = usePositions()
  const createAlert = useCreateAlert()
  const toggleAlert = useToggleAlert()
  const deleteAlert = useDeleteAlert()
  const { permission, request } = useNotificationPermission()

  useAlertNotifications(alerts, permission === 'granted')

  const tickers = useMemo(() => Array.from(new Set(positions.map((p) => p.ticker))), [positions])

  const triggeredHistory = useMemo(
    () => alerts.filter((a) => a.last_triggered).sort((a, b) => (b.last_triggered! > a.last_triggered! ? 1 : -1)),
    [alerts]
  )

  return (
    <div>
      <PageHeader title="Alertas" subtitle="Notificaciones de precio, señales ML y desviación de cartera" />

      <div className="p-6 space-y-8">
        {permission !== 'granted' && (
          <div className="flex items-center justify-between gap-4 bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Activa las notificaciones del navegador</p>
                <p className="text-xs text-muted-foreground">
                  {permission === 'denied'
                    ? 'Has bloqueado las notificaciones — actívalas desde los ajustes del navegador para este sitio.'
                    : 'Recibe un aviso emergente cuando se dispare una alerta, aunque tengas la pestaña en segundo plano.'}
                </p>
              </div>
            </div>
            {permission === 'default' && (
              <button
                onClick={request}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Bell className="w-3.5 h-3.5" />
                Activar notificaciones
              </button>
            )}
          </div>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Crear alerta</h3>
          <div className="bg-card border border-border rounded-lg p-4">
            <AlertForm tickers={tickers} onSubmit={(data) => createAlert.mutate(data)} isPending={createAlert.isPending} />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Alertas configuradas</h3>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} className="h-14" />)}
              </div>
            ) : alerts.length === 0 ? (
              <EmptyState
                variant="alerts"
                title="No tienes alertas configuradas"
                description="Crea una alerta arriba para que WealthOS te avise cuando se cumpla una condición de precio, señal ML o desviación de cartera."
              />
            ) : (
              <ul className="divide-y divide-border">
                {alerts.map((alert) => (
                  <li key={alert.id} className="flex items-center gap-4 px-4 py-3">
                    <button
                      onClick={() => toggleAlert.mutate({ id: alert.id, isActive: !alert.is_active })}
                      title={alert.is_active ? 'Desactivar alerta' : 'Activar alerta'}
                      className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors',
                        alert.is_active ? 'bg-brand-500/15 text-brand-500' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {alert.is_active ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{alert.name}</span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium shrink-0">
                          {ALERT_TYPE_LABELS[alert.type]}
                        </span>
                        {alert.ticker && <span className="text-xs font-mono text-muted-foreground shrink-0">{alert.ticker}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{describeCondition(alert)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatTriggered(alert.last_triggered)}</p>
                    </div>

                    <button
                      onClick={() => deleteAlert.mutate(alert.id)}
                      title="Eliminar alerta"
                      className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-loss hover:bg-loss-light transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Historial de disparos</h3>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {triggeredHistory.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground text-center">
                Todavía no se ha disparado ninguna alerta.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {triggeredHistory.map((alert) => (
                  <li key={alert.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{alert.name}</span>
                      {alert.ticker && <span className="text-xs font-mono text-muted-foreground">{alert.ticker}</span>}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{formatTriggered(alert.last_triggered)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

const inputClass = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      {children}
    </label>
  )
}

interface AlertFormProps {
  tickers: string[]
  onSubmit: (data: AlertCreate) => void
  isPending: boolean
}

function AlertForm({ tickers, onSubmit, isPending }: AlertFormProps) {
  const [type, setType] = useState<AlertType>('price')
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState(tickers[0] ?? '')

  const [priceOperator, setPriceOperator] = useState<'gt' | 'lt' | 'gte' | 'lte'>('gt')
  const [priceValue, setPriceValue] = useState('')

  const [signalAction, setSignalAction] = useState<'BUY' | 'SELL' | 'HOLD'>('BUY')
  const [minConfidence, setMinConfidence] = useState('60')

  const [assetClass, setAssetClass] = useState<AssetClass>('equity')
  const [targetPct, setTargetPct] = useState('')
  const [maxDeviationPct, setMaxDeviationPct] = useState('5')

  useEffect(() => {
    if (!ticker && tickers.length > 0) setTicker(tickers[0])
  }, [tickers, ticker])

  const canSubmit = useMemo(() => {
    if (!name.trim()) return false
    if (type === 'price') return !!ticker && priceValue.trim() !== ''
    if (type === 'signal') return !!ticker && minConfidence.trim() !== ''
    return targetPct.trim() !== '' && maxDeviationPct.trim() !== ''
  }, [name, type, ticker, priceValue, minConfidence, targetPct, maxDeviationPct])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    let condition: Record<string, unknown>
    let alertTicker: string | null = null

    if (type === 'price') {
      condition = { operator: priceOperator, value: Number(priceValue) }
      alertTicker = ticker
    } else if (type === 'signal') {
      condition = { action: signalAction, min_confidence: Number(minConfidence) / 100 }
      alertTicker = ticker
    } else {
      condition = { asset_class: assetClass, target_pct: Number(targetPct), max_deviation_pct: Number(maxDeviationPct) }
    }

    onSubmit({ type, ticker: alertTicker, name: name.trim(), condition_json: JSON.stringify(condition) })
    setName('')
    setPriceValue('')
    setTargetPct('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Tipo de alerta">
          <select value={type} onChange={(e) => setType(e.target.value as AlertType)} className={inputClass}>
            {Object.entries(ALERT_TYPE_LABELS).filter(([value]) => value !== 'signal').map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre de la alerta">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. AAPL por debajo de 150€"
            className={inputClass}
          />
        </Field>
      </div>

      {(type === 'price' || type === 'signal') && (
        <Field label="Activo">
          <select value={ticker} onChange={(e) => setTicker(e.target.value)} className={inputClass}>
            {tickers.length === 0 && <option value="">Sin posiciones en cartera</option>}
            {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      )}

      {type === 'price' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Condición">
            <select value={priceOperator} onChange={(e) => setPriceOperator(e.target.value as typeof priceOperator)} className={inputClass}>
              <option value="gt">Sube por encima de</option>
              <option value="gte">Alcanza o supera</option>
              <option value="lt">Baja por debajo de</option>
              <option value="lte">Cae a o por debajo de</option>
            </select>
          </Field>
          <Field label="Precio (€)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder="150.00"
              className={cn(inputClass, 'tabular-nums')}
            />
          </Field>
        </div>
      )}

      {type === 'signal' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Acción de la señal">
            <select value={signalAction} onChange={(e) => setSignalAction(e.target.value as typeof signalAction)} className={inputClass}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="HOLD">HOLD</option>
            </select>
          </Field>
          <Field label="Confianza mínima (%)">
            <input
              type="number"
              min="0"
              max="100"
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value)}
              className={cn(inputClass, 'tabular-nums')}
            />
          </Field>
        </div>
      )}

      {type === 'rebalance' && (
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Clase de activo">
            <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)} className={inputClass}>
              {Object.entries(ASSET_CLASS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Peso objetivo (%)">
            <input
              type="number"
              min="0"
              max="100"
              value={targetPct}
              onChange={(e) => setTargetPct(e.target.value)}
              placeholder="30"
              className={cn(inputClass, 'tabular-nums')}
            />
          </Field>
          <Field label="Desviación máx. (puntos %)">
            <input
              type="number"
              min="0"
              max="100"
              value={maxDeviationPct}
              onChange={(e) => setMaxDeviationPct(e.target.value)}
              className={cn(inputClass, 'tabular-nums')}
            />
          </Field>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Crear alerta
        </button>
      </div>
    </form>
  )
}
