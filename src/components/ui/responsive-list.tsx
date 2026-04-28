'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export interface ResponsiveListColumn<T> {
  header: string
  cell: (row: T) => ReactNode
  // Mobiel verbergen? (bij desktop-only kolommen zoals 'Aangemaakt op')
  mobileHidden?: boolean
  // Custom styling van de cel
  className?: string
  align?: 'left' | 'right' | 'center'
}

export interface ResponsiveListProps<T> {
  rows: T[]
  columns: ResponsiveListColumn<T>[]
  // Op mobiel wordt elke rij een card. Deze functie geeft de "primaire" tekst,
  // ondertitel en eventueel rechts-bovenaan-badge per row.
  mobileCard?: (row: T) => {
    title: ReactNode
    subtitle?: ReactNode
    rightTop?: ReactNode
    rightBottom?: ReactNode
    href?: string
  }
  rowKey: (row: T, idx: number) => string
  rowHref?: (row: T) => string
  emptyState?: ReactNode
  className?: string
}

// Tabel op desktop, gestapelde cards op mobiel — geen aparte rendering nodig in
// de pagina-code. Werkt out-of-the-box voor relaties, taken, offertes etc.
export function ResponsiveList<T>({
  rows,
  columns,
  mobileCard,
  rowKey,
  rowHref,
  emptyState,
  className = '',
}: ResponsiveListProps<T>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>

  return (
    <div className={className}>
      {/* Desktop: tabel */}
      <div className="hidden md:block overflow-x-auto bg-white border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 font-medium text-gray-600 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const href = rowHref?.(row)
              const cells = columns.map((c, i) => (
                <td
                  key={i}
                  className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''} ${c.className || ''}`}
                >
                  {c.cell(row)}
                </td>
              ))
              if (href) {
                return (
                  <tr
                    key={rowKey(row, idx)}
                    className="border-b border-gray-100 last:border-0 hover:bg-blue-50/50 cursor-pointer"
                    onClick={(e) => {
                      // Voorkom dubbele navigatie als de cel al een link/knop bevat
                      const target = e.target as HTMLElement
                      if (target.closest('a, button')) return
                      window.location.href = href
                    }}
                  >
                    {cells}
                  </tr>
                )
              }
              return (
                <tr key={rowKey(row, idx)} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/50">
                  {cells}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobiel: cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row, idx) => {
          const card = mobileCard?.(row)
          const href = card?.href || rowHref?.(row)
          const inner = (
            <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-start gap-3 active:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{card?.title}</div>
                    {card?.subtitle && <div className="text-xs text-gray-500 truncate mt-0.5">{card.subtitle}</div>}
                  </div>
                  {card?.rightTop && <div className="text-xs text-gray-500 flex-shrink-0 text-right">{card.rightTop}</div>}
                </div>
                {card?.rightBottom && <div className="mt-1.5 text-xs">{card.rightBottom}</div>}
              </div>
              {href && <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />}
            </div>
          )
          return href ? (
            <Link key={rowKey(row, idx)} href={href} className="block">{inner}</Link>
          ) : (
            <div key={rowKey(row, idx)}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}
