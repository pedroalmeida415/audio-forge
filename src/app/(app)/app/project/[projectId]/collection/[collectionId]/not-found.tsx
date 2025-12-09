"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "~/components/ui/button";

export default function CollectionDetailNotFoundPage() {
  const { projectId } = useParams<{
    projectId: string;
  }>();

  return (
    <div className="container mx-auto py-8">
      <p className="text-muted-foreground">Collection not found</p>
      <Link href={`/app/project/${projectId}`}>
        <Button className="mt-4" variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Project
        </Button>
      </Link>
    </div>
  );
}
