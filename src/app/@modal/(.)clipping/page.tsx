"use client";

import { useRouter } from "next/navigation";
import { JobSelector } from "~/components/clipping/job-selector";
import { Modal } from "~/components/ui/modal";

export default function ClippingModalPage() {
  const router = useRouter();

  function handleSelectJob(jobId: string) {
    router.push(`/clipping/${jobId}`);
  }

  return (
    <Modal
      description="Select a completed job to start clipping"
      size="lg"
      title="Clipping Workspace"
    >
      <div className="max-h-[60vh] overflow-y-auto">
        <JobSelector onSelect={handleSelectJob} />
      </div>
    </Modal>
  );
}
