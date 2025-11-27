"use client";

import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    _count: {
      collections: number;
      diarizationJobs: number;
    };
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle className="line-clamp-1">{project.name}</CardTitle>
          {project.description && (
            <CardDescription className="line-clamp-2">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Badge variant="secondary">
              {project._count.collections} collection
              {project._count.collections !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline">
              {project._count.diarizationJobs} job
              {project._count.diarizationJobs !== 1 ? "s" : ""}
            </Badge>
          </div>
          <p className="mt-3 text-muted-foreground text-xs">
            Created {project.createdAt.toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
