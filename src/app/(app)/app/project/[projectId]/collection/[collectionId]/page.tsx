"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useMemo } from "react";
import { api } from "~/trpc/react";
import { ClipList } from "./_component/clip-list";
import { Sidebar } from "./_component/sidebar";
import { Toolbar } from "./_component/toolbar";
import {
  enrichClipsWithMockData,
  useCollectionState,
} from "./_hooks/use-collection-state";

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

  const enrichedClips = useMemo(() => enrichClipsWithMockData(clips), [clips]);

  const {
    activeClipId,
    activeClip,
    selectedClipIds,
    selectedClips,
    filteredClips,
    searchQuery,
    filters,
    sort,
    activeFilterCount,
    setActiveClip,
    toggleClipSelection,
    selectAll,
    deselectAll,
    setSearchQuery,
    setFilters,
    resetFilters,
    setSort,
  } = useCollectionState({ clips: enrichedClips });

  const handleTranscriptionChange = (clipId: string, text: string) => {
    console.log("Transcription change:", clipId, text);
  };

  const handleAutoTranscribe = (clipId: string) => {
    console.log("Auto-transcribe:", clipId);
  };

  const handleProcess = (clipIds: string[], option: string) => {
    console.log("Process:", clipIds, option);
  };

  const handleDelete = (clipIds: string[]) => {
    console.log("Delete:", clipIds);
  };

  return (
    <div className="flex flex-1">
      <div className="flex flex-1 flex-col overflow-hidden">
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

        <Toolbar
          activeFilterCount={activeFilterCount}
          filters={filters}
          onDeselectAll={deselectAll}
          onFiltersChange={setFilters}
          onFiltersReset={resetFilters}
          onSearchChange={setSearchQuery}
          onSelectAll={selectAll}
          onSortChange={setSort}
          searchQuery={searchQuery}
          selectedCount={selectedClipIds.size}
          sort={sort}
          totalCount={filteredClips.length}
        />

        <ClipList
          activeClipId={activeClipId}
          clips={filteredClips}
          onCheckboxChange={toggleClipSelection}
          onClipClick={setActiveClip}
          selectedClipIds={selectedClipIds}
        />
      </div>

      <div className="w-[400px] shrink-0">
        <Sidebar
          activeClip={activeClip}
          onAutoTranscribe={handleAutoTranscribe}
          onDelete={handleDelete}
          onProcess={handleProcess}
          onTranscriptionChange={handleTranscriptionChange}
          selectedClips={selectedClips}
        />
      </div>
    </div>
  );
}
