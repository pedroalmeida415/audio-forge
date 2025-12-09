import { Skeleton } from "~/components/ui/skeleton";

export default function DiarizationLoading() {
  return (
    <div className="flex flex-1 flex-col px-6 py-8">
      <div className="mb-10 space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <Skeleton className="mb-8 h-48 rounded-xl" />
      <div className="grid gap-4">
        {Array.from({ length: 3 }, (_, i) => i).map((index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
