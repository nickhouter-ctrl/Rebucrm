/**
 * Lichtgewicht loading-skeleton voor tabellen/lijsten. Laat bij navigatie
 * direct een visuele placeholder zien zodat het systeem 'snappy' aanvoelt
 * terwijl de server-data nog geladen wordt.
 */
export function PageSkeleton({ title = 'Laden...', rows = 6 }: { title?: string; rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-7 bg-gray-200 rounded w-48 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-72" aria-label={title} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-100 rounded flex-1" />
            <div className="h-4 bg-gray-100 rounded w-20" />
            <div className="h-6 bg-gray-100 rounded w-16" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="animate-pulse">
      <div className="h-7 bg-gray-200 rounded w-40 mb-6" />
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 last:border-0">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-4 bg-gray-100 rounded flex-1" />
            <div className="h-4 bg-gray-100 rounded w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-7 bg-gray-200 rounded w-64 mb-2" />
          <div className="h-4 bg-gray-100 rounded w-40" />
        </div>
        <div className="h-9 bg-gray-100 rounded w-32" />
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 bg-gray-100 rounded w-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-2/3" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  )
}
