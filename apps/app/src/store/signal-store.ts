import { create } from 'zustand';
import type { SignalSimulation } from '@codevisualizer/types';
import { api } from '../api/client.js';
import { useRepoStore } from './repo-store.js';

type PlaybackState = 'idle' | 'playing' | 'paused';

interface SignalState {
  simulation: SignalSimulation | null;
  playbackState: PlaybackState;
  frameIdx: number;
  speed: number;

  runSimulation: (seedNodeId: string, maxHops?: number) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  scrub: (idx: number) => void;
  setSpeed: (s: number) => void;
  nextFrame: () => void;
}

export const useSignalStore = create<SignalState>((set, get) => ({
  simulation: null,
  playbackState: 'idle',
  frameIdx: 0,
  speed: 1,

  runSimulation: async (seedNodeId, maxHops = 5) => {
    const repoId = useRepoStore.getState().activeRepoId;
    if (!repoId) return;
    const sim = await api.repos.simulate(repoId, { seedNodeId, maxHops });
    set({ simulation: sim, frameIdx: 0, playbackState: 'idle' });
  },

  play: () => set({ playbackState: 'playing' }),
  pause: () => set({ playbackState: 'paused' }),
  stop: () => set({ simulation: null, frameIdx: 0, playbackState: 'idle' }),
  scrub: (idx) => set({ frameIdx: idx, playbackState: 'paused' }),
  setSpeed: (speed) => set({ speed }),

  nextFrame: () => {
    const { simulation, frameIdx } = get();
    if (!simulation) return;
    const next = frameIdx + 1;
    if (next >= simulation.frames.length) {
      set({ playbackState: 'paused', frameIdx: simulation.frames.length - 1 });
    } else {
      set({ frameIdx: next });
    }
  },
}));
