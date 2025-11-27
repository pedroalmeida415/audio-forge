"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import type {
  Region,
  RegionParams,
} from "wavesurfer.js/dist/plugins/regions.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";

export interface UseWaveSurferOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  audioUrl: string | null;
  onReady?: (duration: number) => void;
  onTimeUpdate?: (time: number) => void;
  onRegionUpdate?: (region: Region) => void;
  onRegionClick?: (region: Region) => void;
}

export interface UseWaveSurferReturn {
  isReady: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  play: () => void;
  pause: () => void;
  playPause: () => void;
  seekTo: (time: number) => void;
  zoom: (pxPerSec: number) => void;
  addRegion: (params: RegionParams) => Region | undefined;
  removeRegion: (id: string) => void;
  updateRegion: (id: string, params: Partial<RegionParams>) => void;
  clearRegions: () => void;
  getRegions: () => Region[];
}

const SNAP_GRID = 0.1; // 0.1 second precision

function snapToGrid(time: number): number {
  return Math.round(time / SNAP_GRID) * SNAP_GRID;
}

export function useWaveSurfer({
  containerRef,
  audioUrl,
  onReady,
  onTimeUpdate,
  onRegionUpdate,
  onRegionClick,
}: UseWaveSurferOptions): UseWaveSurferReturn {
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!(containerRef.current && audioUrl)) return;

    // Clean up any existing instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
    }

    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    // Create WaveSurfer instance
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4a5568",
      progressColor: "#2563eb",
      cursorColor: "#dc2626",
      height: 128,
      normalize: true,
      minPxPerSec: 50,
      fillParent: true,
      interact: true,
      dragToSeek: true,
      autoScroll: true,
      autoCenter: true,
    });

    // Create Regions plugin
    const regions = ws.registerPlugin(RegionsPlugin.create());

    wavesurferRef.current = ws;
    regionsRef.current = regions;

    // Event handlers
    ws.on("ready", () => {
      const dur = ws.getDuration();
      setDuration(dur);
      setIsReady(true);
      onReady?.(dur);
    });

    ws.on("timeupdate", (time) => {
      setCurrentTime(time);
      onTimeUpdate?.(time);
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    // Region events
    regions.on("region-updated", (region) => {
      // Snap to grid
      const snappedStart = snapToGrid(region.start);
      const snappedEnd = snapToGrid(region.end);

      if (snappedStart !== region.start || snappedEnd !== region.end) {
        region.setOptions({
          start: snappedStart,
          end: snappedEnd,
        });
      }

      onRegionUpdate?.(region);
    });

    regions.on("region-clicked", (region, e) => {
      e.stopPropagation();
      onRegionClick?.(region);
    });

    // Load audio
    ws.load(audioUrl);

    // Cleanup
    return () => {
      ws.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
    };
  }, [
    audioUrl,
    containerRef,
    onReady,
    onTimeUpdate,
    onRegionUpdate,
    onRegionClick,
  ]);

  const play = useCallback(() => {
    wavesurferRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    wavesurferRef.current?.pause();
  }, []);

  const playPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const seekTo = useCallback(
    (time: number) => {
      if (wavesurferRef.current && duration > 0) {
        wavesurferRef.current.seekTo(time / duration);
      }
    },
    [duration]
  );

  const zoom = useCallback((pxPerSec: number) => {
    wavesurferRef.current?.zoom(pxPerSec);
  }, []);

  const addRegion = useCallback((params: RegionParams): Region | undefined => {
    if (!regionsRef.current) return;

    return regionsRef.current.addRegion({
      ...params,
      start: snapToGrid(params.start ?? 0),
      end: snapToGrid(params.end ?? 0),
    });
  }, []);

  const removeRegion = useCallback((id: string) => {
    const regions = regionsRef.current?.getRegions();
    const region = regions?.find((r) => r.id === id);
    region?.remove();
  }, []);

  const updateRegion = useCallback(
    (id: string, params: Partial<RegionParams>) => {
      const regions = regionsRef.current?.getRegions();
      const region = regions?.find((r) => r.id === id);
      if (region) {
        region.setOptions({
          ...params,
          start:
            params.start !== undefined ? snapToGrid(params.start) : undefined,
          end: params.end !== undefined ? snapToGrid(params.end) : undefined,
        });
      }
    },
    []
  );

  const clearRegions = useCallback(() => {
    regionsRef.current?.clearRegions();
  }, []);

  const getRegions = useCallback(
    (): Region[] => regionsRef.current?.getRegions() ?? [],
    []
  );

  return {
    isReady,
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    playPause,
    seekTo,
    zoom,
    addRegion,
    removeRegion,
    updateRegion,
    clearRegions,
    getRegions,
  };
}
