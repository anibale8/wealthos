import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '@/lib/api'
import type { TransactionCreate } from '@/types'

const REFRESH_INTERVAL = 60_000
const ANALYSIS_STALE_TIME = 5 * 60_000

export function usePortfolioSummary() {
  return useQuery({
    queryKey: ['portfolio', 'summary'],
    queryFn: () => portfolioApi.getSummary().then((r) => r.data),
    refetchInterval: REFRESH_INTERVAL,
  })
}

export function usePositions() {
  return useQuery({
    queryKey: ['portfolio', 'positions'],
    queryFn: () => portfolioApi.getPositions().then((r) => r.data),
    refetchInterval: REFRESH_INTERVAL,
  })
}

export function usePortfolioHistory(days = 365) {
  return useQuery({
    queryKey: ['portfolio', 'history', days],
    queryFn: () => portfolioApi.getHistory(days).then((r) => r.data),
  })
}

export function usePortfolioMetrics() {
  return useQuery({
    queryKey: ['portfolio', 'metrics'],
    queryFn: () => portfolioApi.getMetrics().then((r) => r.data),
  })
}

export function useTransactions() {
  return useQuery({
    queryKey: ['portfolio', 'transactions'],
    queryFn: () => portfolioApi.getTransactions().then((r) => r.data),
  })
}

export function useDividends() {
  return useQuery({
    queryKey: ['portfolio', 'dividends'],
    queryFn: () => portfolioApi.getDividends().then((r) => r.data),
    staleTime: ANALYSIS_STALE_TIME,
  })
}

export function useCorrelations() {
  return useQuery({
    queryKey: ['portfolio', 'correlations'],
    queryFn: () => portfolioApi.getCorrelations().then((r) => r.data),
    staleTime: ANALYSIS_STALE_TIME,
  })
}

export function useOverlaps() {
  return useQuery({
    queryKey: ['portfolio', 'overlaps'],
    queryFn: () => portfolioApi.getOverlaps().then((r) => r.data),
    staleTime: ANALYSIS_STALE_TIME,
  })
}

export function useTaxImpact(year?: number) {
  return useQuery({
    queryKey: ['portfolio', 'tax-impact', year],
    queryFn: () => portfolioApi.getTaxImpact(year).then((r) => r.data),
    staleTime: ANALYSIS_STALE_TIME,
  })
}

export function useRebalanceSuggestion() {
  return useMutation({
    mutationFn: (targetWeights: Record<string, number>) =>
      portfolioApi.suggestRebalance(targetWeights).then((r) => r.data),
  })
}

function useInvalidatePortfolio() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['portfolio'] })
}

export function useAddTransaction() {
  const invalidate = useInvalidatePortfolio()
  return useMutation({
    mutationFn: (data: TransactionCreate) => portfolioApi.addTransaction(data).then((r) => r.data),
    onSuccess: () => invalidate(),
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidatePortfolio()
  return useMutation({
    mutationFn: (id: number) => portfolioApi.deleteTransaction(id),
    onSuccess: () => invalidate(),
  })
}
