import { useState } from 'react'

/** To'liq yuklangan ro'yxatni sahifalarga bo'ladi. Ro'yxat qisqarsa, sahifa avtomatik tuzatiladi. */
export function usePaged(list, pageSize = 10) {
  const [requested, setPage] = useState(1)
  const count = list.length
  const pages = Math.max(1, Math.ceil(count / pageSize))
  const page = Math.min(requested, pages)
  return {
    page,
    setPage,
    pageSize,
    count,
    items: list.slice((page - 1) * pageSize, page * pageSize),
    offset: (page - 1) * pageSize,
  }
}
