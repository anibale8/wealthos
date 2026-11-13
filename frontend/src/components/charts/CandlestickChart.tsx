import { useEffect, useRef, useState } from 'react'
import {
  ColorType, CrosshairMode, type IChartApi, type ISeriesApi, createChart,
} from 'lightweight-charts'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { OHLCVPoint } from '@/types'

const PERIODS = [
  { label: '1S', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1A', value: '1y' },
  { label: '5A', value: '5y' },
] as const

interface CandlestickChartProps {
  data: OHLCVPoint[]
  isLoading?: boolean
  period: string
  onPeriodChange: (period: string) => void
  currency?: string
}

export function CandlestickChart({ data, isLoading, period, onPeriodChange, currency }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const [hovered, setHovered] = useState<OHLCVPoint | null>(null)

  // Crear el chart una sola vez
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isDark = document.documentElement.classList.contains('dark')
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#a1a1aa' : '#71717a',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? '#27272a' : '#e4e4e7' },
        horzLines: { color: isDark ? '#27272a' : '#e4e4e7' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: false },
      autoSize: true,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
      priceScaleId: 'right',
    })
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.3 } })

    const volumeSeries = chart.addHistogramSeries({
      color: '#a1a1aa',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHovered(null)
        return
      }
      const point = data.find((d) => d.date === param.time)
      setHovered(point ?? null)
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    return () => {
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Actualizar datos cuando cambian
  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    const volumeSeries = volumeSeriesRef.current
    if (!candleSeries || !volumeSeries) return

    const candles = data
      .filter((d) => d.open !== null && d.high !== null && d.low !== null)
      .map((d) => ({ time: d.date, open: d.open!, high: d.high!, low: d.low!, close: d.close }))

    const volumes = data
      .filter((d) => d.volume !== null)
      .map((d) => ({
        time: d.date,
        value: d.volume!,
        color: d.close >= (d.open ?? d.close) ? 'rgba(22, 163, 74, 0.4)' : 'rgba(220, 38, 38, 0.4)',
      }))

    candleSeries.setData(candles)
    volumeSeries.setData(volumes)
    chartRef.current?.timeScale().fitContent()
  }, [data])

  const last = data[data.length - 1]
  const prev = data[data.length - 2]
  const dayChange = last && prev ? last.close - prev.close : null
  const dayChangePct = last && prev ? (dayChange! / prev.close) * 100 : null
  const displayed = hovered ?? last

  return (
    <div className="bg-card border border-border rounded-lg p-4 flex flex-col h-full min-h-[420px]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2 min-h-[28px]">
          {displayed && (
            <>
              <span className="text-lg font-display font-600 tabular-nums">{formatCurrency(displayed.close, currency)}</span>
              {dayChangePct !== null && hovered === null && (
                <span className={cn('text-xs font-medium tabular-nums', dayChangePct >= 0 ? 'text-profit' : 'text-loss')}>
                  {dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%
                </span>
              )}
              {hovered && <span className="text-xs text-muted-foreground">{formatDate(hovered.date)}</span>}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => onPeriodChange(p.value)}
              className={cn(
                'px-2 py-1 rounded-md text-xs font-medium transition-colors',
                period === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-[320px]">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-muted-foreground bg-card/60">
            Cargando velas…
          </div>
        )}
        {!isLoading && data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Sin histórico de precios disponible.
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  )
}
