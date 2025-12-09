"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { api } from "~/trpc/react";

export default function CollectionDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; collectionId: string }>;
}) {
  const { projectId, collectionId } = use(params);

  const [collection] = api.collections.getById.useSuspenseQuery({
    id: collectionId,
  });

  if (!collection) {
    notFound();
  }

  const [clips] = api.clips.listByCollection.useSuspenseQuery({
    collectionId,
  });

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main content area - clips list */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <Link
            className="mb-2 inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
            href={`/app/project/${projectId}`}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to {collection.project.name}
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-bold text-2xl">{collection.name}</h1>
              {collection.description && (
                <p className="mt-1 text-muted-foreground text-sm">
                  {collection.description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <span>{clips.length} clips</span>
            </div>
          </div>
        </div>

        {/* Selection toolbar */}
        {/* <Toolbar /> */}

        {/* Clips list */}
        {/* <ClipList /> */}
      </div>

      {/* Right sidebar */}
      <div className="w-[400px] shrink-0">{/* <Sidebar /> */}</div>
    </div>
  );
}
