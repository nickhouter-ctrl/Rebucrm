// Lichtgewicht skeleton-loaders. Gebruiken op pagina's waar data laadt
// zodat lay-out niet "springt" wanneer content arriveert.

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

export function SkeletonCard({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="border-b border-gray-100 last:border-0 px-3 py-3 flex gap-4">
          {Array.from({ length: cols }).map((_, ci) => (
            <Skeleton key={ci} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
