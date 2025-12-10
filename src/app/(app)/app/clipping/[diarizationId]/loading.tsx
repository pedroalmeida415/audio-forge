import { Skeleton } from "~/components/ui/skeleton";

export default function ClippingWorkspaceLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      {/* Main Content Skeleton */}
      <div className="flex flex-1 overflow-hidden">
        {/* Speakers Panel */}
        <div className="w-64 border-r p-4">
          <Skeleton className="mb-4 h-5 w-20" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton className="h-20 rounded-lg" key={i} />
            ))}
          </div>
        </div>

        {/* Segments Grid */}
        <div className="flex-1 p-4">
          <Skeleton className="mb-4 h-5 w-24" />
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 15 }).map((_, i) => (
              <Skeleton className="h-20 rounded-lg" key={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Timeline Skeleton */}
      <div className="h-48 border-t">
        <Skeleton className="h-full" />
      </div>
    </div>
  );
}
