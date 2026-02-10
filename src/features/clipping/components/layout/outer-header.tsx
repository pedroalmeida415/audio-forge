"use client";

import { useValue } from "@legendapp/state/react";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Pencil,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { useClippingStore } from "~/features/clipping/context/store.context";
import { api } from "~/trpc/react";

interface OuterHeaderProps {
  sessionName: string;
  projectId: string;
}

export function OuterHeader({ sessionName, projectId }: OuterHeaderProps) {
  const $store = useClippingStore();
  const sourceId = useValue($store.sourceId);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(sessionName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch other sources in project for dropdown
  const { data: sources } = api.source.listByProject.useQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const renameMutation = api.source.rename.useMutation({
    onSuccess: () => setIsEditing(false),
  });

  const diarizeMutation = api.source.startDiarization.useMutation();
  const isDiarizing = diarizeMutation.isPending;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(sessionName);
    setIsEditing(true);
  };

  const handleConfirmEdit = () => {
    if (editValue.trim() && editValue !== sessionName) {
      renameMutation.mutate({ id: sourceId, name: editValue.trim() });
    } else {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirmEdit();
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  const otherSources = sources?.filter((s) => s.id !== sourceId) ?? [];

  return (
    <header className="flex h-12 items-center justify-between border-b bg-background px-3">
      {/* Left: Back button */}
      <div className="flex w-24 items-center">
        <Link href={`/app/project/${projectId}/clipping`}>
          <Button size="icon" variant="ghost" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Center: Session name with dropdown */}
      <div className="flex flex-1 items-center justify-center">
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleConfirmEdit}
            onKeyDown={handleKeyDown}
            className="h-8 max-w-[300px] text-center font-medium text-sm"
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 gap-1.5 px-3 font-medium text-sm"
              >
                <span className="max-w-[200px] truncate">{sessionName}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-[280px]">
              {/* Edit name option */}
              <DropdownMenuItem onClick={handleStartEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename session
              </DropdownMenuItem>

              {otherSources.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-muted-foreground text-xs">
                    Switch to another source
                  </div>
                  {otherSources.map((source) => (
                    <DropdownMenuItem key={source.id} asChild>
                      <Link
                        href={`/app/project/${projectId}/clipping/${source.id}`}
                        className="cursor-pointer"
                      >
                        <span className="truncate">
                          {source.name ??
                            source.storageKey?.split("/").pop()}
                        </span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href={`/app/project/${projectId}/clipping`}
                  className="cursor-pointer"
                >
                  New session
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Right: Diarize button */}
      <div className="flex w-24 items-center justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={isDiarizing}
          onClick={() => diarizeMutation.mutate({ sourceId })}
        >
          {isDiarizing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Diarizing...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Diarize
            </>
          )}
        </Button>
      </div>
    </header>
  );
}
