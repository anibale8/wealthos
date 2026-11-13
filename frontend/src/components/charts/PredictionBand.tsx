import { useMemo } from 'react'
import {
  Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { PredictionPoint } from '@/types'

interface PredictionBandProps {
  predictions: PredictionPoint[]
  isLoading?: boolean
  currency?: string
}

/** Banda de predicción: línea central + zona sombreada del intervalo de confianza,
 * que se ensancha cuanto más lejos está la fecha (más incertidumbre). */
export function PredictionBand({ predictions, isLoading, currency = 'EUR' }: PredictionBandProps) {
  const data = useMemo(
    () => predictions.map((p) => ({ ...p, band: [p.lower, p.upper] as [number, number] })),
    [predictions]
  )

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Calculando predicción…</div>
  }

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
        No hay predicción disponible — entrena primero el modelo para este activo.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="predictionBandGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#259970" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#259970" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDate(d)}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => formatCurrency(v, currency).replace(/,\d{2}(?=\D*$)/, '')}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={80}
        />
        <Tooltip content={<PredictionTooltip currency={currency} />} />
        <Area
          dataKey="band"
          stroke="none"
          fill="url(#predictionBandGradient)"
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#259970"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function PredictionTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: PredictionPoint }[]; currency: string }) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload

  return (
    <div className="bg-popover border border-border rounded-lg shadow-md px-3 py-2 text-xs space-y-1">
      <p className="font-medium">{formatDate(point.date)}</p>
      <p className="tabular-nums">Estimado: <span className="font-medium">{formatCurrency(point.value, currency)}</span></p>
      <p className="tabular-nums text-muted-foreground">
        Rango: {formatCurrency(point.lower, currency)} – {formatCurrency(point.upper, currency)}
      </p>
    </div>
  )
}
