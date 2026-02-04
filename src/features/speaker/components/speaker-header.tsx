"use client";

import { useValue } from "@legendapp/state/react";
import { Download } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { Button } from "~/components/ui/button";
import { useSpeakerPageStore } from "~/features/speaker/context/store.context";
import { api } from "~/trpc/react";
import { ExportProgressDialog } from "./export-progress-dialog";

export function SpeakerHeader() {
  const { projectId, speakerId } = useParams<{
    projectId: string;
    speakerId: string;
  }>();
  const $store = useSpeakerPageStore();
  const speaker = useValue($store.speaker);

  const [showExportDialog, setShowExportDialog] = useState(false);

  // Fetch project name for breadcrumb
  const { data: project } = api.projects.getById.useQuery(
    { id: projectId },
    { refetchOnWindowFocus: false },
  );

  return (
    <>
      <div className="flex w-full items-center justify-between">
        {/* Left: Breadcrumb navigation */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href={`/app/project/${projectId}`}>
                  {project?.name ?? "Project"}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{speaker.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Right: Export button */}
        <Button onClick={() => setShowExportDialog(true)} size="sm">
          <Download className="size-4" />
          Export
        </Button>
      </div>

      {/* Export Dialog */}
      <ExportProgressDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        speakerId={speakerId}
      />
    </>
  );
}
