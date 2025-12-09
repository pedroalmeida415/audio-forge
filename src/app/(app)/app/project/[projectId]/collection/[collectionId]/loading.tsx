import { Skeleton } from "~/components/ui/skeleton";

export default function CollectionDetailLoadingPage() {
  return (
    <div className="flex h-full">
      <div className="flex-1 p-6">
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    </div>
  );
}
