"use client";

import type { Table } from "@tanstack/react-table";
import { ListFilter, RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import type { SegmentWithClip } from "~/features/workspace/store/types";
import { api } from "~/trpc/react";

interface TableFilterPopoverProps {
  table: Table<SegmentWithClip>;
}

export function TableFilterPopover({ table }: TableFilterPopoverProps) {
  "use no memo";
  const [open, setOpen] = useState(false);

  // Active filters count
  const activeFilters = table.getState().columnFilters.length;

  const handleReset = useCallback(() => {
    table.resetColumnFilters();
  }, [table]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <ListFilter className="mr-2 size-4" />
          Filter
          {activeFilters > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <span className="flex size-5 items-center justify-center rounded bg-secondary font-mono text-[10px]">
                {activeFilters}
              </span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold text-sm">Filter Segments</span>
          {activeFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-auto p-1 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="mr-1 size-3" />
              <span className="text-xs">Reset</span>
            </Button>
          )}
        </div>
        <div className="grid gap-4 p-4">
          <SourceFilter table={table} />
          <TagsFilter table={table} />
          <DurationFilter table={table} />
          <ScoreFilter table={table} />
          <BooleanFilters table={table} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SourceFilter({ table }: { table: Table<SegmentWithClip> }) {
  "use no memo";
  const { projectId } = useParams<{ projectId: string }>();

  const { data: sources = [] } = api.source.listByProject.useQuery(
    { projectId },
    { refetchOnWindowFocus: false },
  );

  const column = table.getColumn("source");
  if (!column) return null;

  const filterValue = column.getFilterValue() as string | undefined;

  return (
    <div className="grid gap-2">
      <Label className="text-xs">Source</Label>
      <Select
        value={filterValue ?? "all"}
        onValueChange={(val) =>
          column.setFilterValue(val === "all" ? undefined : val)
        }
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="All sources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All sources</SelectItem>
          {sources.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.name ?? source.storageKey?.split("/").pop() ?? "Untitled"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TagsFilter({ table }: { table: Table<SegmentWithClip> }) {
  "use no memo";
  const column = table.getColumn("tags");
  if (!column) return null;

  const filterValue = column.getFilterValue() as string | undefined;

  return (
    <div className="grid gap-2">
      <Label className="text-xs">Tags</Label>
      <Input
        placeholder="Filter by tag..."
        value={filterValue ?? ""}
        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
        className="h-8 text-xs"
      />
    </div>
  );
}

function DurationFilter({ table }: { table: Table<SegmentWithClip> }) {
  "use no memo";
  const column = table.getColumn("duration");
  if (!column) return null;

  const filterValue = column.getFilterValue() as [number, number] | undefined;
  const minMax = column.getFacetedMinMaxValues() as
    | [number, number]
    | undefined;

  const min = minMax?.[0] ?? 0;
  const max = minMax?.[1] ?? 0;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Duration (s)</Label>
        {minMax && (
          <span className="text-[10px] text-muted-foreground">
            {min.toFixed(1)} - {max.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Min"
          value={filterValue?.[0] ?? ""}
          onChange={(e) =>
            column.setFilterValue((old: [number, number] | undefined) => {
              const val = e.target.value ? Number(e.target.value) : undefined;
              if (val === undefined && old?.[1] === undefined) return undefined;
              return [val, old?.[1]];
            })
          }
          className="h-8 text-xs"
        />
        <span className="text-muted-foreground text-xs">-</span>
        <Input
          type="number"
          placeholder="Max"
          value={filterValue?.[1] ?? ""}
          onChange={(e) =>
            column.setFilterValue((old: [number, number] | undefined) => {
              const val = e.target.value ? Number(e.target.value) : undefined;
              if (old?.[0] === undefined && val === undefined) return undefined;
              return [old?.[0], val];
            })
          }
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}

function ScoreFilter({ table }: { table: Table<SegmentWithClip> }) {
  "use no memo";
  const column = table.getColumn("score");
  if (!column) return null;

  const filterValue = column.getFilterValue() as
    | { min?: number; max?: number; showMissingOnly?: boolean }
    | undefined;
  const minMax = column.getFacetedMinMaxValues() as
    | [number, number]
    | undefined;

  const min = minMax?.[0] ?? 0;
  const max = minMax?.[1] ?? 5; // Default score max is 5

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Score</Label>
        {minMax && !filterValue?.showMissingOnly && (
          <span className="text-[10px] text-muted-foreground">
            {min.toFixed(1)} - {max.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Min"
          step="0.1"
          value={filterValue?.min ?? ""}
          disabled={filterValue?.showMissingOnly}
          onChange={(e) =>
            column.setFilterValue(
              (
                old:
                  | { min?: number; max?: number; showMissingOnly?: boolean }
                  | undefined,
              ) => {
                const val = e.target.value ? Number(e.target.value) : undefined;
                if (val === undefined && old?.max === undefined)
                  return undefined;
                return { ...old, min: val, showMissingOnly: false };
              },
            )
          }
          className="h-8 text-xs"
        />
        <span className="text-muted-foreground text-xs">-</span>
        <Input
          type="number"
          placeholder="Max"
          step="0.1"
          value={filterValue?.max ?? ""}
          disabled={filterValue?.showMissingOnly}
          onChange={(e) =>
            column.setFilterValue(
              (
                old:
                  | { min?: number; max?: number; showMissingOnly?: boolean }
                  | undefined,
              ) => {
                const val = e.target.value ? Number(e.target.value) : undefined;
                if (old?.min === undefined && val === undefined)
                  return undefined;
                return { ...old, max: val, showMissingOnly: false };
              },
            )
          }
          className="h-8 text-xs"
        />
      </div>
      <label className="mt-1 flex items-center gap-2">
        <Checkbox
          checked={filterValue?.showMissingOnly === true}
          onCheckedChange={(checked) => {
            if (checked) {
              column.setFilterValue({ showMissingOnly: true });
            } else {
              column.setFilterValue(undefined);
            }
          }}
        />
        <span className="text-muted-foreground text-xs">
          Missing score only
        </span>
      </label>
    </div>
  );
}

function BooleanFilters({ table }: { table: Table<SegmentWithClip> }) {
  "use no memo";
  const transColumn = table.getColumn("transcription");
  const clipColumn = table.getColumn("clip");

  const transValue = transColumn?.getFilterValue() as boolean | undefined;
  const clipValue = clipColumn?.getFilterValue() as boolean | undefined;

  return (
    <div className="grid gap-4 pt-2">
      {transColumn && (
        <div className="grid gap-2">
          <Label className="text-xs">Transcription</Label>
          <div className="grid gap-2 pl-2">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={transValue === true}
                onCheckedChange={(checked) => {
                  transColumn.setFilterValue(
                    checked === true ? true : undefined,
                  );
                }}
              />
              <span className="text-sm">Has transcription</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={transValue === false}
                onCheckedChange={(checked) => {
                  transColumn.setFilterValue(
                    checked === true ? false : undefined,
                  );
                }}
              />
              <span className="text-sm">Missing transcription</span>
            </label>
          </div>
        </div>
      )}
      {clipColumn && (
        <div className="grid gap-2">
          <Label className="text-xs">Processed Clip</Label>
          <div className="grid gap-2 pl-2">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={clipValue === true}
                onCheckedChange={(checked) => {
                  clipColumn.setFilterValue(
                    checked === true ? true : undefined,
                  );
                }}
              />
              <span className="text-sm">Has processed clip</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={clipValue === false}
                onCheckedChange={(checked) => {
                  clipColumn.setFilterValue(
                    checked === true ? false : undefined,
                  );
                }}
              />
              <span className="text-sm">Missing processed clip</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
