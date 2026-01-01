"use client";

import { FolderOpen } from "lucide-react";
import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import type { RouterOutputs } from "~/trpc/react";

type ProjectCardProps = {
  project: RouterOutputs["projects"]["list"][number];
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link className="group/card" href={`/app/project/${project.id}`}>
      <Card className="h-full cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-300 group-hover/card:bg-primary/20">
              <FolderOpen className="size-5" />
            </div>
            <Badge className="shrink-0" variant="secondary">
              {project.speakersCount} speaker
              {project.speakersCount !== 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="mt-3 space-y-1">
            <CardTitle className="line-clamp-1 text-lg transition-colors duration-200 group-hover/card:text-primary">
              {project.name}
            </CardTitle>
            {project.description && (
              <CardDescription className="line-clamp-2">
                {project.description}
              </CardDescription>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <div className="size-1.5 rounded-full bg-success/60" />
            <span>Created {project.createdAt.toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
