"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

interface TranscriptionEditorProps {
  text: string | null;
  onChange: (text: string) => void;
}

/**
 * Inline transcription editor component.
 *
 * Displays transcription text or empty state in display mode.
 * Click to enter edit mode with textarea, save/cancel buttons, and character count.
 */
export function TranscriptionEditor({
  text,
  onChange,
}: TranscriptionEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(text ?? "");

  const handleEdit = () => {
    setEditValue(text ?? "");
    setIsEditing(true);
  };

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(text ?? "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Save on Ctrl+Enter / Cmd+Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
    // Cancel on Escape
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <Textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter transcription..."
          className="min-h-[60px]"
          autoFocus
        />
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {editValue.length} characters
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-4 w-4" />
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleEdit}
      className="group flex w-full cursor-pointer items-start justify-between rounded-md p-2 text-left transition-colors hover:bg-accent/10"
    >
      {text ? (
        <p className="text-sm leading-relaxed">{text}</p>
      ) : (
        <p className="text-muted-foreground text-sm italic">No transcription</p>
      )}
      <Pencil className="ml-2 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
