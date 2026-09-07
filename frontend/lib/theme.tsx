'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Mode = 'light' | 'dark' | 'system'

interface ThemeCtx {
  mode: Mode
  resolved: 'light' | 'dark'
  setMode: (m: Mode) => void
}

const Ctx = createContext<ThemeCtx>({ mode: 'system', resolved: 'light', setMode: () => {} })

const STORAGE_KEY = 'kfg-theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>('system')
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  // Read the stored preference once on mount.
  useEffect(() => {
    let stored: Mode = 'system'
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v === 'light' || v === 'dark' || v === 'system') stored = v
    } catch {
      /* private window / blocked storage — the system default is fine */
    }
    setModeState(stored)
  }, [])

  // Apply the mode to the document and track the OS setting while on "system".
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const next = mode === 'system' ? (mq.matches ? 'dark' : 'light') : mode
      setResolved(next)
      const root = document.documentElement
      if (mode === 'system') root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', mode)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  const setMode = useCallback((m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      /* non-fatal: the choice just won't survive a reload */
    }
  }, [])

  return <Ctx.Provider value={{ mode, resolved, setMode }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
