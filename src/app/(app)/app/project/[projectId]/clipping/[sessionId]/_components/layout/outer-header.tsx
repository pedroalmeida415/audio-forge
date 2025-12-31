"use client";

import { useSelector } from "@legendapp/state/react";
import { ArrowLeft, ChevronDown, Loader2, Pencil, Sparkles } from "lucide-react";
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
import { api } from "~/trpc/react";
import { useClippingStore } from "../../_context/store.context";

interface OuterHeaderProps {
  fileName: string;
  projectId: string;
}

export function OuterHeader({ fileName, projectId }: OuterHeaderProps) {
  const $store = useClippingStore();
  const sessionId = useSelector(() => $store.sessionId.get());
  const fileId = useSelector(() => $store.fileId.get());

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(fileName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch other files in project for dropdown
  const { data: files } = api.file.listByProject.useQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const renameMutation = api.file.rename.useMutation({
    onSuccess: () => setIsEditing(false),
  });

  const diarizeMutation = api.clippingSession.startDiarization.useMutation();
  const isDiarizing = diarizeMutation.isPending;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(fileName);
    setIsEditing(true);
  };

  const handleConfirmEdit = () => {
    if (editValue.trim() && editValue !== fileName) {
      renameMutation.mutate({ id: fileId, name: editValue.trim() });
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

  const otherFiles = files?.filter((f) => f.id !== fileId) ?? [];

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

      {/* Center: File name with dropdown */}
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
                <span className="max-w-[200px] truncate">{fileName}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-[280px]">
              {/* Edit name option */}
              <DropdownMenuItem onClick={handleStartEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename file
              </DropdownMenuItem>

              {otherFiles.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-muted-foreground text-xs">
                    Switch to another file
                  </div>
                  {otherFiles.map((file) => (
                    <DropdownMenuItem key={file.id} asChild>
                      <Link
                        href={`/app/project/${projectId}/clipping/${file.clippingSession?.id}`}
                        className="cursor-pointer"
                      >
                        <span className="truncate">
                          {file.name ?? file.storageKey?.split("/").pop()}
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
                  Upload new file
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
          onClick={() => diarizeMutation.mutate({ sessionId })}
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
