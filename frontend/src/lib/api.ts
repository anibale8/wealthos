import axios from 'axios'
import { toast } from 'sonner'
import type {
  Alert,
  AlertCreate,
  AssetFundamentals,
  AssetInfo,
  AssetSearchResult,
  Backtest,
  BiasAnalysis,
  CorrelationMatrix,
  DividendEntry,
  FundAnalysis,
  FundComparison,
  OHLCVPoint,
  OverlapPair,
  PortfolioSummary,
  Position,
  Prediction,
  PriceResponse,
  RebalanceSuggestion,
  RiskMetrics,
  ScenarioAnalysis,
  Signal,
  SnapshotPoint,
  TaxSummary,
  Transaction,
  TransactionCreate,
} from '@/types'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// Response interceptor — centralised error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.detail ?? err.message ?? 'Error desconocido'
    toast.error(msg)
    return Promise.reject(err)
  }
)

// ─── Portfolio ─────────────────────────────────────────────────────────────
export const portfolioApi = {
  getSummary:        () => api.get<PortfolioSummary>('/api/portfolio/summary'),
  getPositions:      () => api.get<Position[]>('/api/portfolio/positions'),
  getHistory:        (days = 365) => api.get<SnapshotPoint[]>(`/api/portfolio/history?days=${days}`),
  getMetrics:        () => api.get<RiskMetrics>('/api/portfolio/metrics'),
  getTransactions:   () => api.get<Transaction[]>('/api/portfolio/transactions'),
  addTransaction:    (data: TransactionCreate) => api.post<Transaction>('/api/portfolio/transactions', data),
  deleteTransaction: (id: number) => api.delete<void>(`/api/portfolio/transactions/${id}`),
  getDividends:      () => api.get<DividendEntry[]>('/api/portfolio/dividends'),
  getCorrelations:   () => api.get<CorrelationMatrix>('/api/portfolio/correlations'),
  getOverlaps:       () => api.get<OverlapPair[]>('/api/portfolio/overlaps'),
  suggestRebalance:  (targetWeights: Record<string, number>) =>
                       api.post<RebalanceSuggestion>('/api/portfolio/rebalance', { target_weights: targetWeights }),
  getTaxImpact:      (year?: number) =>
                       api.get<TaxSummary>('/api/portfolio/tax-impact', { params: year ? { year } : undefined }),
  exportPdf:         () => api.get<Blob>(`/api/portfolio/export/pdf?t=${Date.now()}`, { responseType: 'blob' }),
  exportExcel:       () => api.get<Blob>(`/api/portfolio/export/excel?t=${Date.now()}`, { responseType: 'blob' }),
}

// ─── Assets / market data ──────────────────────────────────────────────────
export const assetsApi = {
  search:     (q: string, limit = 10) =>
                api.get<AssetSearchResult[]>(`/api/assets/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getPrice:   (ticker: string) => api.get<PriceResponse>(`/api/assets/${ticker}/price`),
  getHistory: (ticker: string, period = '1y', interval = '1d') =>
                api.get<OHLCVPoint[]>(`/api/assets/${ticker}/history?period=${period}&interval=${interval}`),
  getInfo:    (ticker: string) => api.get<AssetInfo>(`/api/assets/${ticker}/info`),
  getMetrics: (ticker: string) => api.get<AssetFundamentals>(`/api/assets/${ticker}/metrics`),
}

// ─── AI module ─────────────────────────────────────────────────────────────
// Nota: /api/ai/chat usa streaming SSE y se consume con fetch() en useAIStream,
// no con el cliente Axios (que no soporta ReadableStream de forma nativa).
export const aiApi = {
  analyzePdf:      (file: File) => {
                     const formData = new FormData()
                     formData.append('file', file)
                     return api.post<FundAnalysis>('/api/ai/analyze-pdf', formData, {
                       headers: { 'Content-Type': 'multipart/form-data' },
                     })
                   },
  compareFunds:    (isins: string[]) => api.post<FundComparison>('/api/ai/compare-funds', { isins }),
  analyzeScenario: (scenario: string) => api.post<ScenarioAnalysis>('/api/ai/scenario', { scenario }),
  detectBiases:    () => api.get<BiasAnalysis>('/api/ai/biases'),
}

// ─── ML signals ────────────────────────────────────────────────────────────
export const mlApi = {
  getSignals:    (minConfidence = 0) =>
                   api.get<Signal[]>('/api/ml/signals', { params: { min_confidence: minConfidence } }),
  getPrediction: (ticker: string, horizon = 30) =>
                   api.get<Prediction>(`/api/ml/predict/${ticker}`, { params: { horizon } }),
  getBacktest:   (ticker: string, start?: string) =>
                   api.get<Backtest>(`/api/ml/backtest/${ticker}`, { params: start ? { start } : undefined }),
  trainModels:   (tickers: string[]) => api.post('/api/ml/train', { tickers }),
}

// ─── Settings ──────────────────────────────────────────────────────────────
export const settingsApi = {
  getSettings: () => api.get<{ anthropic_key_configured: boolean; base_currency: string; version: string }>('/api/settings'),
  seedDemo:    () => api.post<{ assets: number; transactions: number; snapshots: number; signals: number }>('/api/settings/seed'),
  resetData:   () => api.post<{ status: string; message: string }>('/api/settings/reset'),
}

// ─── Alerts ────────────────────────────────────────────────────────────────
export const alertsApi = {
  getAll:  ()                      => api.get<Alert[]>('/api/alerts'),
  create:  (data: AlertCreate)     => api.post<Alert>('/api/alerts', data),
  update:  (id: number, isActive: boolean) =>
                                      api.patch<Alert>(`/api/alerts/${id}`, { is_active: isActive }),
  delete:  (id: number)            => api.delete<void>(`/api/alerts/${id}`),
}
