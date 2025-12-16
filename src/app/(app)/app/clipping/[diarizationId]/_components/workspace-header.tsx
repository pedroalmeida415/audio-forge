"use client";

import { ArrowLeft, Focus, Table2 } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useClippingWorkspaceStore } from "../_context/store.context";
import type { ViewMode } from "../_store/clipping-workspace-store";

export function WorkspaceHeader({ fileName }: { fileName: string }) {
  const viewMode = useClippingWorkspaceStore((s) => s.viewMode);
  const setViewMode = useClippingWorkspaceStore((s) => s.setViewMode);

  return (
    <div className="flex items-center justify-between border-b bg-background px-4 py-2">
      <div className="flex items-center gap-3">
        <Link href="/app/clipping">
          <Button size="icon" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="font-medium text-sm">{fileName}</h1>
      </div>

      <Tabs
        value={viewMode}
        onValueChange={(value) => setViewMode(value as ViewMode)}
      >
        <TabsList className="h-8">
          <TabsTrigger value="table" className="gap-1.5 px-3 text-xs">
            <Table2 className="h-3.5 w-3.5" />
            Table
          </TabsTrigger>
          <TabsTrigger value="focus" className="gap-1.5 px-3 text-xs" disabled>
            <Focus className="h-3.5 w-3.5" />
            Focus
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Generate Clips button moved to table toolbar */}
      <div className="w-[120px]" />
    </div>
  );
}
