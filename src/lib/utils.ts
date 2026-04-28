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

// App-URL helper: trimt newlines/spaces uit de env var (Vercel injecteert
// soms een \n) en valt terug op productie URL bij ontbreken/ongeldig.
// Gebruik DEZE i.p.v. process.env.NEXT_PUBLIC_APP_URL rechtstreeks.
export function getAppUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/[\r\n\s]+/g, '')
  if (raw.startsWith('http')) return raw.replace(/\/$/, '')
  return 'https://rebucrm.vercel.app'
}
