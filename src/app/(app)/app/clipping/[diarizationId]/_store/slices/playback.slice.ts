import type { PlaybackSlice, SliceCreator } from "../types";

export const createPlaybackSlice: SliceCreator<PlaybackSlice> = (set) => ({
  isPlaying: false,
  duration: 0,
  playbackRate: 1,
  isLoading: true,
  error: null,
  currentTime: 0,
  setIsPlaying: (isPlaying) =>
    set((state) => {
      state.playback.isPlaying = isPlaying;
    }),
  setDuration: (duration) =>
    set((state) => {
      state.playback.duration = duration;
    }),
  setPlaybackRate: (playbackRate) =>
    set((state) => {
      state.playback.playbackRate = playbackRate;
    }),
  setIsLoading: (isLoading) =>
    set((state) => {
      state.playback.isLoading = isLoading;
    }),
  setError: (error) =>
    set((state) => {
      state.playback.error = error;
    }),
  setCurrentTime: (currentTime) =>
    set((state) => {
      state.playback.currentTime = currentTime;
    }),
});
