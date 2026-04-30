import type React from 'react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'd MMMM yyyy', { locale: nl })
}

export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return format(d, 'dd-MM-yyyy', { locale: nl })
}

// Parse een gekopieerd bedrag in NL-formaat ("1.234,56", "1234,56") of
// US-formaat ("1,234.56", "1234.56") naar een puntnotatie-string die
// `<input type="number">` accepteert. Lege/onparseerbare input geeft '' terug.
export function parseLocaleNumber(raw: string): string {
  const s = (raw || '').trim().replace(/\s+/g, '').replace(/[€$]/g, '')
  if (!s) return ''
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  let normalized = s
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    normalized = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')   // EU: 1.234,56 → 1234.56
      : s.replace(/,/g, '')                       // US: 1,234.56 → 1234.56
  } else if (hasComma) {
    // 1234,56 → 1234.56  (NL decimaal-komma)
    normalized = s.replace(',', '.')
  }
  // Houd alleen geldige number-tekens over
  normalized = normalized.replace(/[^0-9.\-]/g, '')
  return normalized
}

// onPaste-handler voor `<input type="number">` zodat NL-formaat ("1.234,56")
// niet door de browser gestripped wordt en je niet "1.234" overhoudt.
export function handleNumberPaste(
  e: React.ClipboardEvent<HTMLInputElement>,
  setValue: (val: string) => void
) {
  const text = e.clipboardData.getData('text')
  const normalized = parseLocaleNumber(text)
  if (!normalized) return
  e.preventDefault()
  setValue(normalized)
}

// App-URL helper: trimt newlines/spaces uit de env var (Vercel injecteert
// soms een \n) en valt terug op productie URL bij ontbreken/ongeldig.
// Gebruik DEZE i.p.v. process.env.NEXT_PUBLIC_APP_URL rechtstreeks.
export function getAppUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/[\r\n\s]+/g, '')
  if (raw.startsWith('http')) return raw.replace(/\/$/, '')
  return 'https://rebucrm.vercel.app'
}
