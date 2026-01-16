import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";

export default function SpeakerNotFound() {
  return (
    <div className="container mx-auto py-8">
      <p className="text-muted-foreground">Speaker not found</p>
      <Link href="/app">
        <Button className="mt-4" variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </Link>
    </div>
  );
}
