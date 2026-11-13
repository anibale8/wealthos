// ─── Dominio: activos ──────────────────────────────────────────────────────
export type AssetClass =
  | 'equity' | 'etf' | 'fund' | 'crypto' | 'bond' | 'real_estate' | 'cash'

export type TransactionType = 'buy' | 'sell' | 'dividend' | 'split' | 'fee'

export interface AssetSearchResult {
  ticker: string
  name: string
  asset_class: string
  exchange: string | null
  currency: string | null
}

export interface PriceResponse {
  price: number
  change: number
  change_pct: number
  volume: number | null
  market_cap: number | null
}

export interface OHLCVPoint {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
  adj_close: number | null
}

export interface AssetInfo {
  name: string | null
  sector: string | null
  country: string | null
  isin: string | null
  description: string | null
  fifty_two_week_high: number | null
  fifty_two_week_low: number | null
  currency: string | null
}

export interface AssetFundamentals {
  pe_ratio: number | null
  pb_ratio: number | null
  dividend_yield: number | null
  beta: number | null
}

// ─── Dominio: portfolio ────────────────────────────────────────────────────
export interface Position {
  id: number
  ticker: string
  name: string
  asset_class: AssetClass
  quantity: number
  avg_cost: number
  current_price: number
  current_value: number
  pnl: number
  pnl_pct: number
  weight: number
  currency: string
  daily_change_pct: number
}

export interface PortfolioSummary {
  total_value: number
  total_cost: number
  total_pnl: number
  total_pnl_pct: number
  daily_change: number
  daily_change_pct: number
  currency: string
  n_positions: number
}

export interface SnapshotPoint {
  date: string
  total_value: number
  total_cost: number
}

export interface RiskMetrics {
  volatility_annual: number
  sharpe_ratio: number
  sortino_ratio: number
  max_drawdown: number
  var_95: number
  beta: number | null
}

export interface DividendEntry {
  ticker: string
  amount: number
  date: string
  projected_annual: number
}

// ─── Dominio: análisis avanzado ────────────────────────────────────────────
export interface CorrelationMatrix {
  tickers: string[]
  matrix: number[][]
}

export interface OverlapPair {
  ticker_a: string
  ticker_b: string
  overlap_pct: number
  shared_holdings: string[]
}

export interface RebalanceRow {
  asset_class: AssetClass
  current_pct: number
  target_pct: number
  diff_pct: number
  current_value: number
  target_value: number
}

export interface RebalanceTrade {
  ticker: string
  asset_class: AssetClass
  action: 'buy' | 'sell'
  amount: number
  approx_quantity: number
}

export interface RebalanceSuggestion {
  rows: RebalanceRow[]
  trades: RebalanceTrade[]
}

export interface TaxSummary {
  fiscal_year: number
  realized_gains_short_term: number
  realized_gains_long_term: number
  realized_gains_total: number
  estimated_tax: number
  unrealized_gains: number
  effective_rate: number | null
}

export interface Transaction {
  id: number
  asset_id: number
  type: TransactionType
  quantity: number
  price: number
  fees: number
  date: string
  notes: string | null
  created_at: string
}

export interface TransactionCreate {
  ticker: string
  type: TransactionType
  quantity: number
  price: number
  fees?: number
  date: string
  notes?: string | null
  asset_name?: string | null
  asset_class?: string | null
  asset_exchange?: string | null
  asset_currency?: string | null
}

// ─── Dominio: alertas ──────────────────────────────────────────────────────
export type AlertType = 'price' | 'signal' | 'rebalance'

export interface Alert {
  id: number
  type: AlertType
  ticker: string | null
  name: string
  condition_json: string
  is_active: boolean
  last_triggered: string | null
  created_at: string
}

export interface AlertCreate {
  type: AlertType
  ticker?: string | null
  name: string
  condition_json: string
}

// ─── Dominio: IA ───────────────────────────────────────────────────────────
export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface FundHolding {
  name: string
  weight_pct: number | null
}

export interface FundAnalysis {
  fund_name: string
  isin: string | null
  ter: number | null
  risk_level: number | null
  benchmark: string | null
  returns_1y: number | null
  returns_3y: number | null
  top_holdings: FundHolding[]
  summary: string
  key_risks: string[]
}

export interface FundComparisonRow {
  isin: string
  name: string
  ter: number | null
  risk_level: number | null
  category: string | null
  returns_1y: number | null
  returns_3y: number | null
}

export interface FundComparison {
  funds: FundComparisonRow[]
  comparison_table: string
  recommendation: string
  overlap_pct: number | null
}

export interface PositionImpact {
  ticker: string
  name: string
  impact_pct: number
  rationale: string
}

export interface ScenarioAnalysis {
  scenario_summary: string
  impact_by_position: PositionImpact[]
  portfolio_impact_pct: number
  recommendations: string[]
}

export type BiasSeverity = 'leve' | 'moderado' | 'alto'

export interface BiasFinding {
  type: string
  description: string
  evidence: string
  severity: BiasSeverity
  recommendation: string
}

export interface BiasAnalysis {
  biases_detected: BiasFinding[]
}

// ─── Dominio: Trading / Señales ML ─────────────────────────────────────────
export type SignalAction = 'BUY' | 'HOLD' | 'SELL'

export interface Signal {
  id: number
  ticker: string
  action: SignalAction
  confidence: number
  predicted_return: number | null
  horizon_days: number
  model_version: string
  shap_values: Record<string, number> | null
  generated_at: string
  expires_at: string | null
}

export interface PredictionPoint {
  date: string
  value: number
  lower: number
  upper: number
}

export interface Prediction {
  ticker: string
  horizon_days: number
  predictions: PredictionPoint[]
  confidence: number
  predicted_return: number
  shap_values: Record<string, number>
}

export interface EquityPoint {
  date: string
  value: number
  benchmark: number
}

export interface TradeRecord {
  entry_date: string
  exit_date: string
  entry_price: number
  exit_price: number
  pnl: number
  pnl_pct: number
}

export interface BacktestSummary {
  total_return: number
  sharpe_ratio: number | null
  sortino_ratio: number | null
  max_drawdown: number
  hit_rate: number | null
  profit_factor: number | null
  n_trades: number | null
  trades: TradeRecord[] | null
}

export interface Backtest {
  ticker: string
  initial_capital: number
  equity_curve: EquityPoint[]
  strategy: BacktestSummary
  benchmark: BacktestSummary
}
