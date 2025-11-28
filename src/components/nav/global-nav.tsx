"use client";

import { AudioLines, FolderOpen, Scissors } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function GlobalNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <nav className="container mx-auto flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link className="font-semibold text-lg" href="/">
            Voice Dataset
          </Link>
          <Link
            className={cn(
              "flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground",
              pathname.startsWith("/projects") && "text-foreground"
            )}
            href="/projects"
          >
            <FolderOpen className="h-4 w-4" />
            Projects
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/diarization">
            <Button size="sm" variant="outline">
              <AudioLines className="mr-2 h-4 w-4" />
              Diarize
            </Button>
          </Link>
          <Link href="/clipping">
            <Button size="sm" variant="outline">
              <Scissors className="mr-2 h-4 w-4" />
              Clipping
            </Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}
