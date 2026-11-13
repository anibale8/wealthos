import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assetsApi } from '@/lib/api'

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

/** Búsqueda de activos con debounce — solo dispara con 2+ caracteres */
export function useAssetSearch(query: string) {
  const [debounced, setDebounced] = useState(query)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const trimmed = debounced.trim()
  const enabled = trimmed.length >= MIN_QUERY_LENGTH

  return useQuery({
    queryKey: ['assets', 'search', trimmed],
    queryFn: () => assetsApi.search(trimmed).then((r) => r.data),
    enabled,
  })
}
