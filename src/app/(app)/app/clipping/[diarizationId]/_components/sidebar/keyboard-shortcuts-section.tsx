"use client";

interface Shortcut {
  label: string;
  keys: string[];
}

const SHORTCUTS: Shortcut[] = [
  { label: "Play/Pause", keys: ["Space"] },
  { label: "Next segment", keys: ["↓"] },
  { label: "Previous segment", keys: ["↑"] },
  { label: "Select all", keys: ["⌘", "A"] },
];

export function KeyboardShortcutsSection() {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wide">
        Shortcuts
      </h3>

      <div className="flex flex-col gap-2">
        {SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.label}
            className="flex items-center justify-between text-xs"
          >
            <span className="text-muted-foreground">{shortcut.label}</span>
            <div className="flex gap-1">
              {shortcut.keys.map((key, idx) => (
                <kbd
                  key={idx}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
