"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

// ============================================================================
// Types
// ============================================================================

export type AudioFormat = "wav" | "flac" | "mp3";
export type SampleRate = 8000 | 16000 | 22050 | 44100 | 48000;
export type BitDepth = 16 | 24;
export type Channels = 1 | 2;

export interface ExportConfig {
  format: AudioFormat;
  sampleRate: SampleRate;
  bitDepth: BitDepth;
  channels: Channels;
}

const LJ_SPEECH_PRESET: ExportConfig = {
  format: "wav",
  sampleRate: 22050,
  bitDepth: 16,
  channels: 1,
};

const DEFAULT_CONFIG: ExportConfig = {
  format: "wav",
  sampleRate: 44100,
  bitDepth: 16,
  channels: 1,
};

// ============================================================================
// Component
// ============================================================================

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  speakerId: string;
  speakerName: string;
}

export function ExportModal({
  open,
  onOpenChange,
  speakerId,
  speakerName,
}: ExportModalProps) {
  const [config, setConfig] = useState<ExportConfig>(DEFAULT_CONFIG);

  const handleFormatChange = (value: string) => {
    setConfig((prev) => ({ ...prev, format: value as AudioFormat }));
  };

  const handleSampleRateChange = (value: string) => {
    setConfig((prev) => ({
      ...prev,
      sampleRate: Number.parseInt(value, 10) as SampleRate,
    }));
  };

  const handleBitDepthChange = (value: string) => {
    setConfig((prev) => ({
      ...prev,
      bitDepth: Number.parseInt(value, 10) as BitDepth,
    }));
  };

  const handleChannelsChange = (value: string) => {
    setConfig((prev) => ({
      ...prev,
      channels: Number.parseInt(value, 10) as Channels,
    }));
  };

  const applyLJSpeechPreset = () => {
    setConfig(LJ_SPEECH_PRESET);
  };

  const handleExport = () => {
    // Build export URL with query params
    const params = new URLSearchParams({
      speakerId,
      format: config.format,
      sampleRate: config.sampleRate.toString(),
      channels: config.channels.toString(),
    });

    // Only include bitDepth for WAV format
    if (config.format === "wav") {
      params.set("bitDepth", config.bitDepth.toString());
    }

    // Trigger download by opening the export endpoint
    const exportUrl = `/api/export/speaker?${params.toString()}`;
    window.open(exportUrl, "_blank");

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {speakerName}</DialogTitle>
          <DialogDescription>
            Configure the audio format and settings for your dataset export.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Preset Button */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Quick presets</span>
            <Button
              variant="outline"
              size="sm"
              onClick={applyLJSpeechPreset}
              type="button"
            >
              LJSpeech (22050Hz, 16-bit, Mono)
            </Button>
          </div>

          <div className="h-px bg-border" />

          {/* Audio Format */}
          <div className="grid grid-cols-2 items-center gap-4">
            <label htmlFor="format" className="text-sm font-medium">
              Audio Format
            </label>
            <Select value={config.format} onValueChange={handleFormatChange}>
              <SelectTrigger id="format" className="w-full">
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="flac">FLAC</SelectItem>
                <SelectItem value="mp3">MP3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sample Rate */}
          <div className="grid grid-cols-2 items-center gap-4">
            <label htmlFor="sampleRate" className="text-sm font-medium">
              Sample Rate
            </label>
            <Select
              value={config.sampleRate.toString()}
              onValueChange={handleSampleRateChange}
            >
              <SelectTrigger id="sampleRate" className="w-full">
                <SelectValue placeholder="Select sample rate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="8000">8,000 Hz</SelectItem>
                <SelectItem value="16000">16,000 Hz</SelectItem>
                <SelectItem value="22050">22,050 Hz</SelectItem>
                <SelectItem value="44100">44,100 Hz</SelectItem>
                <SelectItem value="48000">48,000 Hz</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bit Depth - Only for WAV */}
          {config.format === "wav" && (
            <div className="grid grid-cols-2 items-center gap-4">
              <label htmlFor="bitDepth" className="text-sm font-medium">
                Bit Depth
              </label>
              <Select
                value={config.bitDepth.toString()}
                onValueChange={handleBitDepthChange}
              >
                <SelectTrigger id="bitDepth" className="w-full">
                  <SelectValue placeholder="Select bit depth" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16">16-bit</SelectItem>
                  <SelectItem value="24">24-bit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Channels */}
          <div className="grid grid-cols-2 items-center gap-4">
            <label htmlFor="channels" className="text-sm font-medium">
              Channels
            </label>
            <Select
              value={config.channels.toString()}
              onValueChange={handleChannelsChange}
            >
              <SelectTrigger id="channels" className="w-full">
                <SelectValue placeholder="Select channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Mono</SelectItem>
                <SelectItem value="2">Stereo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
