import { Skeleton } from "~/components/ui/skeleton";

export default function ProjectLoading() {
  // TODO: show loading state for the project
  return (
    <div className="container mx-auto py-8">
      <Skeleton className="mb-8 h-10 w-64" />
      <Skeleton className="h-[400px]" />
    </div>
  );
}
