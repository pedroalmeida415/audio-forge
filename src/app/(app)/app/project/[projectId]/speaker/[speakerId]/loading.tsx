import { Skeleton } from "~/components/ui/skeleton";

export default function SpeakerLoading() {
  return (
    <div className="flex h-full flex-col">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>

      {/* Main Content Skeleton */}
      <div className="flex flex-1 overflow-hidden">
        {/* Segment List */}
        <div className="flex-1 p-4">
          {/* Filter Bar */}
          <div className="mb-4 flex items-center gap-3">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-24" />
          </div>
          {/* Segment Cards */}
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton className="h-32 rounded-lg" key={i} />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 border-l p-4">
          {/* Statistics Section */}
          <Skeleton className="mb-2 h-5 w-20" />
          <div className="mb-6 space-y-3">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
          {/* Processing Actions */}
          <Skeleton className="mb-2 h-5 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-9 rounded" />
            <Skeleton className="h-9 rounded" />
            <Skeleton className="h-9 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
