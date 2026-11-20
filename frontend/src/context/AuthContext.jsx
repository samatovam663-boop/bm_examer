import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api.me()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  // token yangilab bo'lmasa (refresh muddati tugagan) api qatlami shu hodisani yuboradi
  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await api.login({ username, password })
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (form) => {
    await api.register(form)
    return login(form.username, form.password)
  }, [login])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (data) => {
    const u = await api.updateProfile(data)
    setUser(u)
    return u
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateProfile }),
    [user, loading, login, register, logout, updateProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export const HOME_BY_ROLE = { admin: '/admin', teacher: '/teacher', student: '/student' }
