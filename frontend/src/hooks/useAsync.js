import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api'

/** Ma'lumot yuklash: { data, loading, error, reload }. Eski so'rov natijasi yangisini bosib ketmaydi. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const run = useRef(0)

  const load = useCallback(() => {
    const id = ++run.current
    setState((s) => ({ ...s, loading: true, error: null }))
    return Promise.resolve()
      .then(fn)
      .then((data) => { if (id === run.current) setState({ data, loading: false, error: null }) })
      .catch((err) => { if (id === run.current) setState({ data: null, loading: false, error: errorMessage(err) }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
