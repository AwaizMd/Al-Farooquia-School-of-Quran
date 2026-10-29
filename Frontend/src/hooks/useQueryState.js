import { useSearchParams } from 'react-router-dom'

// Keeps a filter value in the URL so links (e.g. from the action centre) can open filtered views.
export function useQueryState(key, fallback = '') {
  const [params, setParams] = useSearchParams()
  const value = params.get(key) ?? fallback
  const setValue = (v) => {
    const next = new URLSearchParams(params)
    if (v === fallback || v === '' || v == null) next.delete(key)
    else next.set(key, v)
    setParams(next, { replace: true })
  }
  return [value, setValue]
}
