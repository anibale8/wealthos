import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mlApi } from '@/lib/api'

const REFRESH_INTERVAL = 5 * 60_000

/** Señales activas (no expiradas), filtradas por confianza mínima. */
export function useSignals(minConfidence = 0) {
  return useQuery({
    queryKey: ['ml', 'signals', minConfidence],
    queryFn: () => mlApi.getSignals(minConfidence).then((r) => r.data),
    refetchInterval: REFRESH_INTERVAL,
  })
}

/** Predicción puntual (banda de confianza) para un ticker y horizonte dados. */
export function usePrediction(ticker: string | null, horizon: number) {
  return useQuery({
    queryKey: ['ml', 'predict', ticker, horizon],
    queryFn: () => mlApi.getPrediction(ticker as string, horizon).then((r) => r.data),
    enabled: Boolean(ticker),
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** Curva de backtesting (estrategia vs Buy & Hold) para un ticker. */
export function useBacktest(ticker: string | null, start?: string) {
  return useQuery({
    queryKey: ['ml', 'backtest', ticker, start],
    queryFn: () => mlApi.getBacktest(ticker as string, start).then((r) => r.data),
    enabled: Boolean(ticker),
    staleTime: 30 * 60_000,
    retry: false,
  })
}

/** Lanza el reentrenamiento + regeneración de señales para los tickers indicados. */
export function useTrainModels() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tickers: string[]) => mlApi.trainModels(tickers).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ml', 'signals'] }),
  })
}
