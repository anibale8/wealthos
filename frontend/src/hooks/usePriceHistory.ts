import { useQuery } from '@tanstack/react-query'
import { assetsApi } from '@/lib/api'

/** Histórico OHLCV de un activo, para gráficos de velas */
export function usePriceHistory(ticker: string | undefined, period = '1y', interval = '1d') {
  return useQuery({
    queryKey: ['assets', ticker, 'history', period, interval],
    queryFn: () => assetsApi.getHistory(ticker as string, period, interval).then((r) => r.data),
    enabled: !!ticker,
  })
}
