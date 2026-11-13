import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Plus, Upload } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { portfolioApi } from '@/lib/api'
import { MetricCard } from '@/components/ui/MetricCard'
import { SkeletonCard } from '@/components/ui/SkeletonCard'
import { AddAssetModal } from '@/components/portfolio/AddAssetModal'
import { ImportCSVModal } from '@/components/portfolio/ImportCSVModal'
import { PositionsTable } from '@/components/portfolio/PositionsTable'
import { PositionDetailPanel } from '@/components/portfolio/PositionDetailPanel'
import { TransactionHistory } from '@/components/portfolio/TransactionHistory'
import { PortfolioAreaChart } from '@/components/charts/PortfolioAreaChart'
import { AllocationDonut } from '@/components/charts/AllocationDonut'
import {
  usePortfolioHistory, usePortfolioSummary, usePositions, useTransactions,
} from '@/hooks/usePortfolio'
import type { Position } from '@/types'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ExportButtons() {
  const [pending, setPending] = useState<'pdf' | 'excel' | null>(null)

  const handleExport = async (format: 'pdf' | 'excel') => {
    setPending(format)
    try {
      const { data } = format === 'pdf' ? await portfolioApi.exportPdf() : await portfolioApi.exportExcel()
      downloadBlob(data, format === 'pdf' ? 'wealthos_informe.pdf' : 'wealthos_informe.xlsx')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleExport('pdf')}
        disabled={pending !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
      >
        {pending === 'pdf' ? <Download className="w-4 h-4 animate-pulse" /> : <FileText className="w-4 h-4" />}
        PDF
      </button>
      <button
        onClick={() => handleExport('excel')}
        disabled={pending !== null}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
      >
        {pending === 'excel' ? <Download className="w-4 h-4 animate-pulse" /> : <FileSpreadsheet className="w-4 h-4" />}
        Excel
      </button>
    </div>
  )
}

export function PortfolioPage() {
  const { data: summary, isLoading: loadingSummary } = usePortfolioSummary()
  const { data: positions = [], isLoading: loadingPositions } = usePositions()
  const { data: transactions = [], isLoading: loadingTransactions } = useTransactions()

  const [historyDays, setHistoryDays] = useState(365)
  const { data: history = [], isLoading: loadingHistory } = usePortfolioHistory(historyDays)

  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const visiblePositions = useMemo(
    () => (selectedClass ? positions.filter((p) => p.asset_class === selectedClass) : positions),
    [positions, selectedClass]
  )

  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Portfolio"
        subtitle="Vista general de tus activos"
        actions={
          <div className="flex items-center gap-2">
            <ExportButtons />
            <ImportCSVModal
              trigger={
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors">
                  <Upload className="w-4 h-4" />
                  Importar CSV
                </button>
              }
            />
            <AddAssetModal
              trigger={
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  <Plus className="w-4 h-4" />
                  Añadir activo
                </button>
              }
            />
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* KPI row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {loadingSummary ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={2} />)
          ) : (
            <>
              <MetricCard
                label="Patrimonio total"
                value={summary?.total_value ?? 0}
                change={summary?.daily_change}
                changePct={summary?.daily_change_pct}
                size="lg"
                className="col-span-2 xl:col-span-1"
              />
              <MetricCard
                label="P&L total"
                value={summary?.total_pnl ?? 0}
                changePct={summary?.total_pnl_pct}
              />
              <MetricCard
                label="Variación hoy"
                value={summary?.daily_change ?? 0}
                changePct={summary?.daily_change_pct}
              />
              <MetricCard
                label="Posiciones"
                value={summary?.n_positions ?? positions.length}
                type="number"
              />
            </>
          )}
        </div>

        {/* Chart + distribution */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2">
            <PortfolioAreaChart
              data={history}
              isLoading={loadingHistory}
              period={historyDays}
              onPeriodChange={setHistoryDays}
            />
          </div>
          <AllocationDonut
            positions={positions}
            isLoading={loadingPositions}
            selectedClass={selectedClass}
            onSelectClass={setSelectedClass}
          />
        </div>

        {/* Positions table */}
        <div className="bg-card border border-border rounded-lg">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-medium">
              Posiciones ({visiblePositions.length}{selectedClass ? ` de ${positions.length}` : ''})
            </h2>
            {selectedClass && (
              <button
                onClick={() => setSelectedClass(null)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Quitar filtro
              </button>
            )}
          </div>
          {loadingPositions ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} lines={1} />)}
            </div>
          ) : (
            <PositionsTable positions={visiblePositions} onSelect={setSelectedPosition} />
          )}
        </div>

        {/* Transaction history */}
        <TransactionHistory
          transactions={transactions}
          positions={positions}
          isLoading={loadingTransactions}
        />
      </div>

      <PositionDetailPanel
        position={selectedPosition}
        onOpenChange={(open) => !open && setSelectedPosition(null)}
      />
    </div>
  )
}
