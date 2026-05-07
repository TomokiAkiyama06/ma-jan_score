export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-800 ${className}`} />
}

export function HomePageSkeleton() {
  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export function StatsPageSkeleton() {
  return (
    <div className="px-4 pt-6 pb-8 space-y-5">
      <Skeleton className="h-7 w-16" />
      <div className="flex gap-2">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-16 rounded-full flex-none" />)}
      </div>
      <div className="flex gap-3 overflow-hidden">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-28 rounded-xl flex-none" />)}
      </div>
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  )
}

export function HistoryPageSkeleton() {
  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Skeleton className="h-7 w-16" />
      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  )
}
