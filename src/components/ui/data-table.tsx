'use client'

import { useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  searchPlaceholder?: string
  onRowClick?: (row: T) => void
  // Optionele bulk-selectie: als getRowId is meegegeven krijgen rijen
  // checkboxes en wordt onSelectionChange aangeroepen met geselecteerde IDs.
  selectable?: boolean
  getRowId?: (row: T) => string
  onSelectionChange?: (selectedIds: string[]) => void
  // Bulk-acties balk die boven de tabel verschijnt zodra ≥1 rij geselecteerd is
  bulkActions?: (selectedIds: string[], clearSelection: () => void) => React.ReactNode
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'Zoeken...',
  onRowClick,
  selectable,
  getRowId,
  onSelectionChange,
  bulkActions,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const idOf = (row: T): string => (getRowId ? getRowId(row) : (row as unknown as { id: string }).id)
  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onSelectionChange?.([...next])
      return next
    })
  }
  function clearSelection() {
    setSelected(new Set())
    onSelectionChange?.([])
  }
  function toggleAllVisible() {
    setSelected(prev => {
      const visibleIds = table.getRowModel().rows.map(r => idOf(r.original))
      const allSelected = visibleIds.every(id => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        for (const id of visibleIds) next.delete(id)
      } else {
        for (const id of visibleIds) next.add(id)
      }
      onSelectionChange?.([...next])
      return next
    })
  }

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: 20 },
    },
  })

  return (
    <div>
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full max-w-sm pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
      </div>

      {selectable && selected.size > 0 && bulkActions && (
        <div className="mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between">
          <span className="text-sm text-blue-900">
            <strong>{selected.size}</strong> {selected.size === 1 ? 'item' : 'items'} geselecteerd
          </span>
          <div className="flex items-center gap-2">
            {bulkActions([...selected], clearSelection)}
            <button
              onClick={clearSelection}
              className="text-xs text-blue-700 hover:underline"
            >
              Selectie wissen
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-gray-200 bg-gray-50">
                  {selectable && (
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={
                          table.getRowModel().rows.length > 0 &&
                          table.getRowModel().rows.every(r => selected.has(idOf(r.original)))
                        }
                        onChange={toggleAllVisible}
                        className="h-3.5 w-3.5"
                      />
                    </th>
                  )}
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className={cn(
                        'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
                        header.column.getCanSort() && 'cursor-pointer select-none hover:text-gray-700'
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    Geen resultaten gevonden
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const rowId = idOf(row.original)
                  const isChecked = selected.has(rowId)
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-gray-100 hover:bg-gray-50 transition-colors group/row',
                        onRowClick && 'cursor-pointer',
                        isChecked && 'bg-blue-50/40',
                      )}
                      onClick={() => onRowClick?.(row.original)}
                    >
                      {selectable && (
                        <td
                          className="px-3 py-3 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(rowId)}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                      )}
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-sm text-gray-700">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-500">
            {table.getFilteredRowModel().rows.length} resultaten
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-600">
              Pagina {table.getState().pagination.pageIndex + 1} van{' '}
              {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
