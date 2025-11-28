"use client";

import { useRouter } from "next/navigation";
import { DiarizationContent } from "~/components/diarization/diarization-content";
import { Modal } from "~/components/ui/modal";

export default function DiarizationModalPage() {
  const router = useRouter();

  function handleSuccess(jobId: string) {
    router.push(`/clipping/${jobId}`);
  }

  return (
    <Modal
      description="Upload an audio file for speaker diarization"
      size="lg"
      title="New Diarization Job"
    >
      <DiarizationContent onSuccess={handleSuccess} />
    </Modal>
  );
}
