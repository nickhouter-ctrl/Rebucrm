'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { navigationItems } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { GripVertical, Settings2, RotateCcw } from 'lucide-react'

const SIDEBAR_ORDER_KEY = 'rebu-sidebar-order'
const medewerkerNavHrefs = ['/', '/agenda', '/taken', '/uren']

export function Sidebar({ rol }: { rol?: string }) {
  const pathname = usePathname()
  const [editMode, setEditMode] = useState(false)
  const [order, setOrder] = useState<string[]>([])
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverItem, setDragOverItem] = useState<string | null>(null)

  const baseItems = rol === 'medewerker'
    ? navigationItems.filter(item => medewerkerNavHrefs.includes(item.href))
    : navigationItems

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_ORDER_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        // Clean up: only keep hrefs that exist in baseItems
        const validHrefs = new Set(baseItems.map(i => i.href))
        const cleaned = parsed.filter(href => validHrefs.has(href))
        // Add any new items not in saved order
        for (const item of baseItems) {
          if (!cleaned.includes(item.href)) cleaned.push(item.href)
        }
        setOrder(cleaned)
      } else {
        setOrder(baseItems.map(i => i.href))
      }
    } catch {
      setOrder(baseItems.map(i => i.href))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const orderedItems = order.length > 0
    ? order.map(href => baseItems.find(i => i.href === href)).filter(Boolean) as typeof baseItems
    : baseItems

  function handleDragStart(e: React.DragEvent, href: string) {
    setDraggedItem(href)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, href: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverItem !== href) setDragOverItem(href)
  }

  function handleDrop(href: string) {
    if (!draggedItem || draggedItem === href) {
      setDraggedItem(null)
      setDragOverItem(null)
      return
    }
    const newOrder = [...order.length > 0 ? order : baseItems.map(i => i.href)]
    const from = newOrder.indexOf(draggedItem)
    const to = newOrder.indexOf(href)
    if (from === -1 || to === -1) {
      setDraggedItem(null)
      setDragOverItem(null)
      return
    }
    newOrder.splice(from, 1)
    newOrder.splice(to, 0, draggedItem)
    setOrder(newOrder)
    localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(newOrder))
    setDraggedItem(null)
    setDragOverItem(null)
  }

  function handleDragEnd() {
    setDraggedItem(null)
    setDragOverItem(null)
  }

  function resetOrder() {
    const defaultOrder = baseItems.map(i => i.href)
    setOrder(defaultOrder)
    localStorage.removeItem(SIDEBAR_ORDER_KEY)
  }

  return (
    <aside className="w-60 bg-sidebar text-white flex flex-col h-screen fixed left-0 top-0">
      <div className="p-4 border-b border-white/10">
        <Image src="/images/logo-rebu.png" alt="Rebu Kozijnen" width={140} height={45} className="h-9 w-auto brightness-0 invert" />
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {orderedItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)

          return (
            <div
              key={item.href}
              draggable={editMode}
              onDragStart={editMode ? (e) => handleDragStart(e, item.href) : undefined}
              onDragOver={editMode ? (e) => handleDragOver(e, item.href) : undefined}
              onDrop={editMode ? () => handleDrop(item.href) : undefined}
              onDragEnd={editMode ? handleDragEnd : undefined}
              className={cn(
                draggedItem === item.href && 'opacity-40',
                dragOverItem === item.href && editMode && 'border-t-2 border-white/50',
              )}
            >
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-sidebar-active text-white'
                    : 'text-white/70 hover:bg-sidebar-hover hover:text-white'
                )}
                onClick={editMode ? (e) => e.preventDefault() : undefined}
              >
                {editMode && <GripVertical className="h-3 w-3 text-white/40 flex-shrink-0 cursor-grab" />}
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {item.label}
              </Link>
            </div>
          )
        })}
      </nav>

      <div className="p-3 border-t border-white/10 flex items-center justify-between">
        <span className="text-xs text-white/40">Rebu v1.0</span>
        <div className="flex items-center gap-1">
          {editMode && (
            <button
              onClick={resetOrder}
              className="p-1 text-white/40 hover:text-white/70 transition-colors"
              title="Reset volgorde"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setEditMode(!editMode)}
            className={cn(
              'p-1 transition-colors',
              editMode ? 'text-white' : 'text-white/40 hover:text-white/70'
            )}
            title={editMode ? 'Klaar' : 'Volgorde aanpassen'}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
