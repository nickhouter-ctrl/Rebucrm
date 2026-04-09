'use client'

import { useState, useEffect, useCallback } from 'react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error'
}

let toastId = 0
let addToastGlobal: ((message: string, type?: 'success' | 'error') => void) | null = null

export function showToast(message: string, type: 'success' | 'error' = 'success') {
  addToastGlobal?.(message, type)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  useEffect(() => {
    addToastGlobal = addToast
    return () => { addToastGlobal = null }
  }, [addToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white animate-in slide-in-from-bottom-2 fade-in duration-200 ${
            t.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
