import { create } from 'zustand'
import type { SignalSimulation } from '@cv/types'

type PlaybackState = 'idle' | 'playing' | 'paused'

interface Playback {
  state: PlaybackState
  frameIdx: number
  speed: number
}

interface SignalState {
  simulation: SignalSimulation | null
  playback: Playback
  setSimulation: (sim: SignalSimulation | null) => void
  setPlaybackState: (state: PlaybackState) => void
  setFrameIdx: (idx: number) => void
  setSpeed: (speed: number) => void
}

export const useSignalStore = create<SignalState>((set) => ({
  simulation: null,
  playback: { state: 'idle', frameIdx: 0, speed: 1 },
  setSimulation: (sim) =>
    set({ simulation: sim, playback: { state: 'idle', frameIdx: 0, speed: 1 } }),
  setPlaybackState: (state) =>
    set((s) => ({ playback: { ...s.playback, state } })),
  setFrameIdx: (frameIdx) =>
    set((s) => ({ playback: { ...s.playback, frameIdx } })),
  setSpeed: (speed) =>
    set((s) => ({ playback: { ...s.playback, speed } })),
}))
